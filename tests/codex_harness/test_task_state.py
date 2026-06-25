from __future__ import annotations

import importlib
import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def load_modules(monkeypatch, tmp_path, changed_files: str | None = ""):
    monkeypatch.setenv("CODEX_HARNESS_REPO_ROOT", str(ROOT))
    monkeypatch.setenv("CODEX_HARNESS_STATE_DIR", str(tmp_path / "state"))
    if changed_files is None:
        monkeypatch.delenv("CODEX_HARNESS_CHANGED_FILES", raising=False)
    else:
        monkeypatch.setenv("CODEX_HARNESS_CHANGED_FILES", changed_files)
    sys.path.insert(0, str(ROOT))
    import tools.codex_task as codex_task
    import tools.codex_gate as codex_gate

    codex_task = importlib.reload(codex_task)
    codex_gate = importlib.reload(codex_gate)
    return codex_task, codex_gate


def run_hook(script: str, tmp_path: Path, payload: dict, changed_files: str = "") -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["CODEX_HARNESS_REPO_ROOT"] = str(ROOT)
    env["CODEX_HARNESS_STATE_DIR"] = str(tmp_path / "state")
    env["CODEX_HARNESS_CHANGED_FILES"] = changed_files
    return subprocess.run(
        [sys.executable, str(ROOT / ".codex" / "hooks" / script)],
        cwd=ROOT,
        input=json.dumps(payload),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        check=False,
    )


def test_instruction_size_budget(monkeypatch, tmp_path):
    _task, gate = load_modules(monkeypatch, tmp_path, "AGENTS.md")
    status, detail = gate.instruction_budget_check()
    assert status == "PASS", detail


def test_natural_prompt_creates_and_updates_one_contract(monkeypatch, tmp_path):
    task, _gate = load_modules(monkeypatch, tmp_path)
    first = task.start_task("\uc774 \ub178\ub4dc \uc800\uc7a5\ud558\uba74 \uac12\uc774 \uc0ac\ub77c\uc9c0\ub294 \uac83 \uac19\uc544. \ud55c\ubc88 \ubd10\uc918.")
    task_id = first["task_id"]
    assert "saved_workflow" in first["contract"]["capability_tags"]
    assert first["contract"]["risk_level"] == "YELLOW"

    second = task.update_task("\uc544\uae4c \uc598\uae30\ud55c \ubc29\ud5a5\uc740 \ubcc4\ub85c\uc57c. \uacf5\uc2dd ComfyUI \uae30\uc900\ub9cc \ub9de\ucdb0\uc918.")
    assert second["task_id"] == task_id
    assert "Third-party compatibility is not a goal unless explicitly requested." in second["contract"]["inferred_non_goals"]

    third = task.update_task("\uacc4\uc18d \ud574\uc918.")
    assert third["task_id"] == task_id
    assert len(third["journal"]) == 3


def test_session_start_without_active_task_injects_natural_prompt_instruction(tmp_path):
    result = run_hook("session_start.py", tmp_path, {"event": "startup"})
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert "Infer and persist the task contract" in data["developer_context"]


def test_prompt_hook_and_compaction_restore_context(tmp_path):
    prompt = "\uc774 \ub178\ub4dc \uc800\uc7a5\ud558\uba74 \uac12\uc774 \uc0ac\ub77c\uc9c0\ub294 \uac83 \uac19\uc544."
    submitted = run_hook("user_prompt_submit.py", tmp_path, {"prompt": prompt})
    assert submitted.returncode == 0, submitted.stderr
    data = json.loads(submitted.stdout)
    assert "saved-workflow-visible-state" in data["developer_context"]

    pre = run_hook("pre_compact.py", tmp_path, {"reason": "test compact"})
    assert pre.returncode == 0, pre.stderr
    post = run_hook("post_compact.py", tmp_path, {})
    assert post.returncode == 0, post.stderr
    restored = json.loads(post.stdout)
    assert "Codex Checkpoint" in restored["developer_context"]
    assert "saved_workflow" in restored["developer_context"]


def test_stop_hook_blocks_once_then_escalates_without_loop(tmp_path):
    first_prompt = {"prompt": "Build Codex harness without touching product code."}
    setup = run_hook("user_prompt_submit.py", tmp_path, first_prompt, changed_files="README.md")
    assert setup.returncode == 0, setup.stderr

    first = run_hook("stop.py", tmp_path, {}, changed_files="README.md")
    assert first.returncode == 2
    assert json.loads(first.stdout)["decision"] == "continue"

    second = run_hook("stop.py", tmp_path, {}, changed_files="README.md")
    assert second.returncode == 0
    assert json.loads(second.stdout)["status"] == "BLOCKED"
    assert (tmp_path / "state" / "ESCALATION.md").exists()


def test_two_strike_rule_escalates_only_for_separate_code_attempts(monkeypatch, tmp_path):
    task, _gate = load_modules(monkeypatch, tmp_path)
    task.start_task("Codex harness task")
    task.record_test("saved-workflow-visible-state", "FAIL", attempt="a1", code_change=True)
    ledger = task.load_failure_ledger()
    assert ledger["failures"]["saved-workflow-visible-state"]["attempt_count"] == 1

    task.record_test("saved-workflow-visible-state", "FAIL", attempt="a1", code_change=False)
    ledger = task.load_failure_ledger()
    assert ledger["failures"]["saved-workflow-visible-state"]["attempt_count"] == 1

    task.record_test("saved-workflow-visible-state", "FAIL", attempt="a2", code_change=True)
    active = task.load_task()
    assert active["status"] == "BLOCKED"
    assert task.ESCALATION_MD.exists()


def test_gate_selects_checks_from_tags_and_paths(monkeypatch, tmp_path):
    _task, gate = load_modules(monkeypatch, tmp_path)
    selected = gate.select_required_gates(
        ["web/js/deno_example.js"],
        ["saved_workflow", "async", "storage"],
        "YELLOW",
    )
    assert "node_check" in selected
    assert "workflow_migration_fixture" in selected
    assert "async_latest" in selected
    assert "storage_precedence" in selected


def test_evidence_status_is_separate_from_contract_status(monkeypatch, tmp_path):
    task, gate = load_modules(monkeypatch, tmp_path, "")
    task.start_task("Saved workflow harness check")
    task.record_test("workflow_migration_fixture", "EXECUTED", evidence_path="scenario ran")
    result = gate.evaluate("local", run_commands=True)
    assert result["checks"]["workflow_migration_fixture"]["status"] == "UNVERIFIED"
    assert result["evidence_status"] == "UNVERIFIED"
    assert result["contract_status"] == "UNVERIFIED"


def test_red_task_requires_architecture_decision(monkeypatch, tmp_path):
    task, gate = load_modules(monkeypatch, tmp_path, "")
    task.start_task("Change workflow schema and widget order.")
    result = gate.evaluate("local", run_commands=True)
    assert result["checks"]["architecture_decision"]["status"] == "FAIL"
    assert result["contract_status"] == "FAIL"


def test_unrequested_product_file_change_is_detected(monkeypatch, tmp_path):
    task, gate = load_modules(monkeypatch, tmp_path, "web/js/deno_extra_nodes.js")
    task.start_task("Build Codex autopilot harness")
    result = gate.evaluate("local", run_commands=False)
    assert result["checks"]["product_scope"]["status"] == "FAIL"
    assert "web/js/deno_extra_nodes.js" in result["checks"]["product_scope"]["detail"]


def test_generated_handoff_stays_under_150_lines(monkeypatch, tmp_path):
    task, _gate = load_modules(monkeypatch, tmp_path, "AGENTS.md")
    task.start_task("Build Codex autopilot harness")
    text = task.generate_handoff()
    assert len(text.splitlines()) <= 150
