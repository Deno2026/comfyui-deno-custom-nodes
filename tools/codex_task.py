from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(os.environ.get("CODEX_HARNESS_REPO_ROOT", Path(__file__).resolve().parents[1]))
STATE_DIR = Path(os.environ.get("CODEX_HARNESS_STATE_DIR", ROOT / ".codex" / "state"))

ACTIVE_JSON = STATE_DIR / "ACTIVE_TASK.json"
ACTIVE_MD = STATE_DIR / "ACTIVE_TASK.md"
CHECKPOINT_MD = STATE_DIR / "CHECKPOINT.md"
FAILURE_LEDGER = STATE_DIR / "FAILURE_LEDGER.json"
ESCALATION_MD = STATE_DIR / "ESCALATION.md"
TEST_EVIDENCE = STATE_DIR / "TEST_EVIDENCE.json"


K_SAVE = "\uc800\uc7a5"
K_OFFICIAL = "\uacf5\uc2dd"
K_CONTINUE = "\uacc4\uc18d"
K_NODE = "\ub178\ub4dc"


def utc_now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat()


def ensure_state_dir() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    ensure_state_dir()
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def run_git(args: list[str], default: str = "") -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    except OSError:
        return default
    return result.stdout.strip() if result.returncode == 0 else default


def current_branch() -> str:
    return run_git(["branch", "--show-current"], "unknown")


def current_head() -> str:
    return run_git(["rev-parse", "HEAD"], "unknown")


def changed_files() -> list[str]:
    env_files = os.environ.get("CODEX_HARNESS_CHANGED_FILES")
    if env_files is not None:
        return [item.strip().replace("\\", "/") for item in env_files.replace(";", "\n").splitlines() if item.strip()]

    files: set[str] = set()
    for line in run_git(["status", "--porcelain"]).splitlines():
        if not line:
            continue
        if line.startswith("?? "):
            path = line[3:].strip()
        elif len(line) > 2 and line[2] == " ":
            path = line[3:].strip()
        else:
            path = line[2:].strip()
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        files.add(path.replace("\\", "/"))
    return sorted(files)


def task_id_from_prompt(prompt: str) -> str:
    seed = f"{utc_now()}:{prompt}".encode("utf-8")
    return hashlib.sha1(seed).hexdigest()[:12]


def risk_rank(risk: str) -> int:
    return {"GREEN": 1, "YELLOW": 2, "RED": 3}.get(risk, 1)


def higher_risk(a: str, b: str) -> str:
    return a if risk_rank(a) >= risk_rank(b) else b


def infer_contract(prompt: str, existing: dict[str, Any] | None = None) -> dict[str, Any]:
    text = prompt.casefold()
    tags: set[str] = set(existing.get("capability_tags", [])) if existing else set()
    non_goals: list[str] = list(existing.get("inferred_non_goals", [])) if existing else []
    assumptions: list[str] = list(existing.get("assumptions", [])) if existing else []
    affected = existing.get("affected_product_surface", "unknown") if existing else "unknown"
    risk = existing.get("risk_level", "GREEN") if existing else "GREEN"

    if any(token in text for token in ["codex", "harness", "autopilot", "hook", "gate", ".codex"]):
        tags.add("harness")
        affected = "codex operating harness"
        assumptions.append("This task changes operating surfaces, not production node behavior.")

    if any(token in text for token in ["save", "saved", "workflow", K_SAVE]):
        tags.add("saved_workflow")
        risk = higher_risk(risk, "YELLOW")
        affected = affected if affected != "unknown" else "saved workflow behavior"

    frontend_tokens = ["frontend", " dom ", " button ", " panel "]
    if any(token in text for token in frontend_tokens) or (K_NODE in text and "harness" not in tags):
        tags.add("frontend")
        risk = higher_risk(risk, "YELLOW")

    if any(token in text for token in ["async", "fetch", "request", "stale"]):
        tags.add("async")
        risk = higher_risk(risk, "YELLOW")

    if any(token in text for token in ["localstorage", "storage", "preset"]):
        tags.add("storage")
        risk = higher_risk(risk, "YELLOW")

    red_tokens = [
        "schema",
        "widget order",
        "target_slot",
        "node.inputs",
        "node.widgets",
        "dynamic slot",
        "migration",
        "delete",
        "remove data",
    ]
    if any(token in text for token in red_tokens):
        risk = "RED"
        tags.add("red_architecture")

    if "official comfyui" in text or K_OFFICIAL in text:
        assumptions.append("Official ComfyUI behavior is the baseline.")
        if "third-party compatibility is not a goal unless explicitly requested." not in non_goals:
            non_goals.append("Third-party compatibility is not a goal unless explicitly requested.")

    if K_CONTINUE in text or "continue" in text:
        assumptions.append("Continue the existing active task unless it is closed.")

    if not tags:
        tags.add("general")

    if "harness" in tags:
        allowed_scope = [
            "AGENTS.md",
            ".agents/skills/**",
            ".codex/hooks.json",
            ".codex/hooks/**",
            "tools/codex_*.py",
            "tools/codex_*.ps1",
            "docs/codex/**",
            "docs/archive/**",
            ".github/pull_request_template.md",
            ".github/workflows/*codex*gate*.yml",
            ".gitignore",
            "tests/codex_harness/**",
        ]
        verification = ["instruction_budget", "harness_pytest", "codex_gate"]
    else:
        allowed_scope = ["task-specific product files after contract review"]
        verification = ["codex_gate"]

    acceptance = []
    if "saved_workflow" in tags:
        acceptance.append(
            {
                "id": "saved-workflow-visible-state",
                "description": "Saved raw values and visible restored values match after reload and re-save.",
            }
        )
    if "harness" in tags:
        acceptance.extend(
            [
                {"id": "natural-prompt-contract", "description": "Natural prompts update one internal task contract."},
                {"id": "deterministic-gate", "description": "Gate selects checks and separates evidence from contract status."},
                {"id": "two-strike-escalation", "description": "Two failed implementation attempts create escalation."},
            ]
        )
    if not acceptance:
        acceptance.append({"id": "requested-behavior", "description": "Requested user-visible behavior works without scope creep."})

    return {
        "goal": prompt.strip()[:240] or "Continue the active task.",
        "user_visible_behavior": existing.get("user_visible_behavior", "User sees the requested behavior without extra required process.") if existing else "User sees the requested behavior without extra required process.",
        "inferred_non_goals": sorted(set(non_goals)),
        "assumptions": sorted(set(assumptions)),
        "affected_product_surface": affected,
        "canonical_state_owners": existing.get("canonical_state_owners", {}) if existing else {},
        "risk_level": risk,
        "capability_tags": sorted(tags),
        "official_runtime_baseline": "Official ComfyUI contract and exact installed runtime when behavior is claimed.",
        "saved_workflow_impact": "preserve and verify" if "saved_workflow" in tags else "none expected",
        "acceptance_tests": acceptance,
        "allowed_implementation_scope": allowed_scope,
        "verification_plan": verification,
        "release_status": existing.get("release_status", "local only") if existing else "local only",
    }


def render_task_md(task: dict[str, Any]) -> str:
    contract = task.get("contract", {})
    lines = [
        "# Active Codex Task",
        "",
        f"- Task ID: `{task.get('task_id', 'unknown')}`",
        f"- Status: `{task.get('status', 'active')}`",
        f"- Branch: `{task.get('branch', current_branch())}`",
        f"- HEAD: `{task.get('head', current_head())}`",
        f"- Base: `{task.get('base_commit', 'unknown')}`",
        f"- Latest intent: {task.get('latest_intent', '')}",
        "",
        "## Contract",
        "",
        f"- Goal: {contract.get('goal', '')}",
        f"- Risk: `{contract.get('risk_level', 'GREEN')}`",
        f"- Tags: `{', '.join(contract.get('capability_tags', []))}`",
        f"- Surface: {contract.get('affected_product_surface', '')}",
        f"- Saved workflow impact: {contract.get('saved_workflow_impact', '')}",
        "",
        "## Acceptance Tests",
    ]
    for item in contract.get("acceptance_tests", []):
        lines.append(f"- `{item.get('id')}`: {item.get('description')}")
    lines.extend(["", "## Next Action", "", task.get("next_action", "Run the deterministic gate before finalizing.")])
    return "\n".join(lines).rstrip() + "\n"


def save_task(task: dict[str, Any]) -> None:
    write_json(ACTIVE_JSON, task)
    ensure_state_dir()
    ACTIVE_MD.write_text(render_task_md(task), encoding="utf-8")


def load_task() -> dict[str, Any] | None:
    return read_json(ACTIVE_JSON, None)


def start_task(prompt: str, base: str | None = None, branch: str | None = None, worktree: str | None = None) -> dict[str, Any]:
    task = {
        "task_id": task_id_from_prompt(prompt),
        "status": "active",
        "created_at": utc_now(),
        "updated_at": utc_now(),
        "branch": branch or current_branch(),
        "head": current_head(),
        "base_commit": base or current_head(),
        "worktree": worktree or str(ROOT),
        "latest_intent": prompt,
        "contract": infer_contract(prompt),
        "journal": [{"at": utc_now(), "prompt": prompt}],
        "decisions": [],
        "changed_files": changed_files(),
        "tests": [],
        "blockers": [],
        "next_action": "Implement within allowed scope, then run tools/codex_gate.py.",
    }
    save_task(task)
    return task


def update_task(prompt: str) -> dict[str, Any]:
    existing = load_task()
    if not existing or existing.get("status") == "closed":
        return start_task(prompt)

    existing["updated_at"] = utc_now()
    existing["latest_intent"] = prompt
    existing["head"] = current_head()
    existing["branch"] = current_branch()
    existing["changed_files"] = changed_files()
    existing.setdefault("journal", []).append({"at": utc_now(), "prompt": prompt})
    existing["contract"] = infer_contract(prompt, existing.get("contract", {}))
    existing["next_action"] = "Continue from the updated contract and run the deterministic gate before finalizing."
    save_task(existing)
    return existing


def record_decision(text: str, status: str = "accepted") -> dict[str, Any]:
    task = load_task() or start_task("Record decision")
    task.setdefault("decisions", []).append({"at": utc_now(), "status": status, "text": text})
    task["updated_at"] = utc_now()
    save_task(task)
    return task


def load_evidence() -> dict[str, Any]:
    return read_json(TEST_EVIDENCE, {"tests": {}})


def save_evidence(evidence: dict[str, Any]) -> None:
    write_json(TEST_EVIDENCE, evidence)


def load_failure_ledger() -> dict[str, Any]:
    return read_json(FAILURE_LEDGER, {"failures": {}})


def save_failure_ledger(ledger: dict[str, Any]) -> None:
    write_json(FAILURE_LEDGER, ledger)


def escalate(reason: str, acceptance_id: str | None = None) -> dict[str, Any]:
    task = load_task() or start_task("Escalation")
    task["status"] = "BLOCKED"
    task.setdefault("blockers", []).append({"at": utc_now(), "reason": reason, "acceptance_id": acceptance_id})
    task["next_action"] = "Resolve the escalation before additional product edits."
    save_task(task)
    lines = [
        "# Codex Escalation",
        "",
        f"- Created: `{utc_now()}`",
        f"- Task: `{task.get('task_id')}`",
        f"- Acceptance ID: `{acceptance_id or 'n/a'}`",
        f"- Reason: {reason}",
        "",
        "Further product edits are blocked until the architecture or acceptance failure is resolved.",
    ]
    ensure_state_dir()
    ESCALATION_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return task


def record_test(test_id: str, status: str, evidence_path: str = "", attempt: str = "", code_change: bool = False) -> dict[str, Any]:
    task = load_task() or start_task(f"Record test {test_id}")
    entry = {
        "at": utc_now(),
        "id": test_id,
        "status": status.upper(),
        "evidence": evidence_path,
        "attempt": attempt,
        "code_change": bool(code_change),
    }
    task.setdefault("tests", []).append(entry)
    task["updated_at"] = utc_now()

    evidence = load_evidence()
    evidence.setdefault("tests", {})[test_id] = entry
    save_evidence(evidence)

    if status.upper() in {"FAIL", "FAILED", "BLOCK"} and code_change:
        ledger = load_failure_ledger()
        failures = ledger.setdefault("failures", {})
        item = failures.setdefault(test_id, {"attempt_count": 0, "attempts": [], "last_attempt": ""})
        if attempt and attempt != item.get("last_attempt"):
            item["attempt_count"] += 1
            item["attempts"].append({"at": utc_now(), "attempt": attempt, "evidence": evidence_path})
            item["last_attempt"] = attempt
        save_failure_ledger(ledger)
        if item["attempt_count"] >= 2:
            escalate(
                f"Acceptance test `{test_id}` failed after two separate code-change attempts.",
                acceptance_id=test_id,
            )
            task = load_task() or task

    save_task(task)
    return task


def checkpoint(note: str = "") -> str:
    task = load_task()
    files = changed_files()
    lines = [
        "# Codex Checkpoint",
        "",
        f"- Created: `{utc_now()}`",
        f"- Branch: `{current_branch()}`",
        f"- HEAD: `{current_head()}`",
        f"- Note: {note or 'n/a'}",
        "",
        "## Active Task",
        "",
    ]
    if task:
        contract = task.get("contract", {})
        lines.extend(
            [
                f"- Task ID: `{task.get('task_id')}`",
                f"- Status: `{task.get('status')}`",
                f"- Latest intent: {task.get('latest_intent')}",
                f"- Risk: `{contract.get('risk_level')}`",
                f"- Tags: `{', '.join(contract.get('capability_tags', []))}`",
                f"- Next action: {task.get('next_action')}",
            ]
        )
    else:
        lines.append("- No active task.")
    lines.extend(["", "## Dirty Files", ""])
    lines.extend([f"- `{p}`" for p in files] or ["- None"])
    text = "\n".join(lines) + "\n"
    ensure_state_dir()
    CHECKPOINT_MD.write_text(text, encoding="utf-8")
    return text


def generate_handoff() -> str:
    task = load_task()
    files = changed_files()
    gate = read_json(STATE_DIR / "GATE_RESULT.json", {})
    lines = [
        "# SESSION_HANDOFF",
        "",
        f"- Generated: `{utc_now()}`",
        f"- Branch: `{current_branch()}`",
        f"- HEAD: `{current_head()}`",
        "",
        "## Dirty Files",
        "",
    ]
    lines.extend([f"- `{p}`" for p in files[:40]] or ["- None"])
    if len(files) > 40:
        lines.append(f"- ... {len(files) - 40} more")
    lines.extend(["", "## Active Task", ""])
    if task:
        contract = task.get("contract", {})
        lines.extend(
            [
                f"- Task ID: `{task.get('task_id')}`",
                f"- Status: `{task.get('status')}`",
                f"- Latest intent: {task.get('latest_intent')}",
                f"- Risk: `{contract.get('risk_level')}`",
                f"- Tags: `{', '.join(contract.get('capability_tags', []))}`",
                f"- Surface: {contract.get('affected_product_surface')}",
            ]
        )
    else:
        lines.append("- No active task.")
    lines.extend(["", "## Latest Gate", ""])
    if gate:
        lines.extend(
            [
                f"- Evidence: `{gate.get('evidence_status', 'UNKNOWN')}`",
                f"- Contract: `{gate.get('contract_status', 'UNKNOWN')}`",
            ]
        )
        missing = gate.get("missing", [])
        if missing:
            lines.append(f"- Missing: {', '.join(missing[:10])}")
    else:
        lines.append("- No gate result yet.")
    lines.extend(["", "## Blockers", ""])
    blockers = (task or {}).get("blockers", []) if task else []
    lines.extend([f"- {b.get('reason')}" for b in blockers[-5:]] or ["- None"])
    lines.extend(["", "## Next Action", "", (task or {}).get("next_action", "Start or update a task contract before editing.")])
    text = "\n".join(lines).rstrip() + "\n"
    (ROOT / "SESSION_HANDOFF.md").write_text(text, encoding="utf-8")
    return text


def session_context() -> str:
    task = load_task()
    if not task:
        return "The user may speak naturally. Infer and persist the task contract before editing."
    contract = task.get("contract", {})
    return "\n".join(
        [
            "Continue from the repository-local Codex task state.",
            f"Task ID: {task.get('task_id')}",
            f"Status: {task.get('status')}",
            f"Latest intent: {task.get('latest_intent')}",
            f"Risk: {contract.get('risk_level')}",
            f"Tags: {', '.join(contract.get('capability_tags', []))}",
            f"Next action: {task.get('next_action')}",
        ]
    )


def close_task() -> dict[str, Any]:
    task = load_task() or start_task("Close task")
    task["status"] = "closed"
    task["updated_at"] = utc_now()
    task["next_action"] = "Task closed."
    save_task(task)
    return task


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Maintain repository-local Codex task state.")
    sub = parser.add_subparsers(dest="command", required=True)

    start = sub.add_parser("start")
    start.add_argument("--prompt", required=True)
    start.add_argument("--base")
    start.add_argument("--branch")
    start.add_argument("--worktree")

    update = sub.add_parser("update")
    update.add_argument("--prompt", required=True)

    sub.add_parser("status").add_argument("--json", action="store_true")

    record = sub.add_parser("record-test")
    record.add_argument("--id", required=True)
    record.add_argument("--status", required=True)
    record.add_argument("--evidence", default="")
    record.add_argument("--attempt", default="")
    record.add_argument("--code-change", action="store_true")

    decision = sub.add_parser("record-decision")
    decision.add_argument("--text", required=True)
    decision.add_argument("--status", default="accepted")

    check = sub.add_parser("checkpoint")
    check.add_argument("--note", default="")

    esc = sub.add_parser("escalate")
    esc.add_argument("--reason", required=True)
    esc.add_argument("--acceptance-id", default="")

    sub.add_parser("handoff")
    sub.add_parser("session-context")
    sub.add_parser("close")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "start":
        result = start_task(args.prompt, args.base, args.branch, args.worktree)
        print(render_task_md(result), end="")
    elif args.command == "update":
        result = update_task(args.prompt)
        print(render_task_md(result), end="")
    elif args.command == "status":
        result = load_task()
        if args.json:
            print(json.dumps(result or {}, indent=2, ensure_ascii=False))
        else:
            print(render_task_md(result), end="") if result else print(session_context())
    elif args.command == "record-test":
        result = record_test(args.id, args.status, args.evidence, args.attempt, args.code_change)
        print(render_task_md(result), end="")
    elif args.command == "record-decision":
        result = record_decision(args.text, args.status)
        print(render_task_md(result), end="")
    elif args.command == "checkpoint":
        print(checkpoint(args.note), end="")
    elif args.command == "escalate":
        result = escalate(args.reason, args.acceptance_id or None)
        print(render_task_md(result), end="")
    elif args.command == "handoff":
        print(generate_handoff(), end="")
    elif args.command == "session-context":
        print(session_context())
    elif args.command == "close":
        result = close_task()
        print(render_task_md(result), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
