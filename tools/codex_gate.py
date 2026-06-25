from __future__ import annotations

import argparse
import fnmatch
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

try:
    from tools import codex_task
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from tools import codex_task


ROOT = Path(os.environ.get("CODEX_HARNESS_REPO_ROOT", Path(__file__).resolve().parents[1]))
STATE_DIR = Path(os.environ.get("CODEX_HARNESS_STATE_DIR", ROOT / ".codex" / "state"))
RESULT_JSON = STATE_DIR / "GATE_RESULT.json"
RESULT_MD = STATE_DIR / "GATE_RESULT.md"


HARNESS_PATTERNS = [
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

PRODUCT_PATTERNS = [
    "deno_*.py",
    "web/js/deno_*.js",
    "web/js/assets/**",
    "node_list.json",
    "pyproject.toml",
    "CHANGELOG.md",
    "README.md",
    "docs/README.*.md",
    "docs/images/**",
]


def norm(path: str) -> str:
    return path.replace("\\", "/").strip()


def matches(path: str, patterns: list[str]) -> bool:
    n = norm(path)
    return any(fnmatch.fnmatch(n, pattern) for pattern in patterns)


def run(cmd: list[str], cwd: Path = ROOT) -> tuple[int, str]:
    proc = subprocess.run(
        cmd,
        cwd=cwd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return proc.returncode, proc.stdout


def changed_files() -> list[str]:
    env_files = os.environ.get("CODEX_HARNESS_CHANGED_FILES")
    if env_files is not None:
        return [norm(item) for item in env_files.replace(";", "\n").splitlines() if item.strip()]
    return codex_task.changed_files()


def load_task() -> dict[str, Any]:
    return codex_task.load_task() or {}


def load_evidence() -> dict[str, Any]:
    return codex_task.read_json(codex_task.TEST_EVIDENCE, {"tests": {}})


def select_required_gates(files: list[str], tags: list[str], risk: str, mode: str = "local") -> list[str]:
    selected: set[str] = set()
    normalized = [norm(path) for path in files]

    if not normalized or any(matches(path, HARNESS_PATTERNS) for path in normalized):
        selected.add("instruction_budget")
        selected.add("handoff_budget")

    if any(path.endswith(".py") for path in normalized):
        selected.add("py_compile")

    if any(matches(path, ["tools/codex_*.py", ".codex/hooks/*.py", "tests/codex_harness/**"]) for path in normalized):
        selected.add("harness_pytest")

    if any(matches(path, ["web/js/*.js", "tests/js/*.mjs"]) for path in normalized):
        selected.add("node_check")

    if "saved_workflow" in tags:
        selected.add("workflow_migration_fixture")
    if "storage" in tags:
        selected.add("storage_precedence")
    if "async" in tags:
        selected.add("async_latest")
    if "dynamic_slots" in tags:
        selected.add("dynamic_slots_real_links")
    if "frontend" in tags or "runtime_sensitive" in tags:
        selected.add("runtime_identity")
    if risk == "RED" or "red_architecture" in tags:
        selected.add("architecture_decision")
    if mode == "release":
        selected.add("release_unverified_block")

    return sorted(selected)


def instruction_budget_check() -> tuple[str, str]:
    root_agents = ROOT / "AGENTS.md"
    skill = ROOT / ".agents" / "skills" / "deno-comfyui-node" / "SKILL.md"
    files = [path for path in [root_agents, skill] if path.exists()]
    root_bytes = root_agents.stat().st_size if root_agents.exists() else 0
    combined = sum(path.stat().st_size for path in files)
    if root_bytes > 8192:
        return "FAIL", f"AGENTS.md is {root_bytes} bytes, over 8192."
    if combined > 16384:
        return "FAIL", f"Autoload docs are {combined} bytes, over 16384."
    return "PASS", f"AGENTS.md={root_bytes} bytes; autoload={combined} bytes."


def handoff_budget_check() -> tuple[str, str]:
    text = codex_task.generate_handoff()
    lines = text.splitlines()
    if len(lines) > 150:
        return "FAIL", f"SESSION_HANDOFF.md has {len(lines)} lines, over 150."
    return "PASS", f"SESSION_HANDOFF.md has {len(lines)} lines."


def py_compile_check(files: list[str]) -> tuple[str, str]:
    py_files = [path for path in files if path.endswith(".py") and (ROOT / path).exists()]
    for required in ["tools/codex_task.py", "tools/codex_gate.py"]:
        if (ROOT / required).exists() and required not in py_files:
            py_files.append(required)
    hook_dir = ROOT / ".codex" / "hooks"
    if hook_dir.exists():
        for path in hook_dir.glob("*.py"):
            rel = norm(str(path.relative_to(ROOT)))
            if rel not in py_files:
                py_files.append(rel)
    if not py_files:
        return "PASS", "No Python files to compile."
    code, output = run([sys.executable, "-m", "py_compile", *py_files])
    return ("PASS" if code == 0 else "FAIL", output.strip() or f"Compiled {len(py_files)} Python files.")


def harness_pytest_check() -> tuple[str, str]:
    test_dir = ROOT / "tests" / "codex_harness"
    if not test_dir.exists():
        return "FAIL", "tests/codex_harness is missing."
    code, output = run([sys.executable, "-m", "pytest", "tests/codex_harness", "-q"])
    return ("PASS" if code == 0 else "FAIL", output.strip())


def node_check(files: list[str]) -> tuple[str, str]:
    js_files = [path for path in files if path.endswith((".js", ".mjs")) and (ROOT / path).exists()]
    if not js_files:
        return "PASS", "No JS files to check."
    failures = []
    for path in js_files:
        code, output = run(["node", "--check", path])
        if code != 0:
            failures.append(f"{path}: {output.strip()}")
    return ("FAIL", "\n".join(failures)) if failures else ("PASS", f"Checked {len(js_files)} JS files.")


def evidence_gate(gate: str, evidence: dict[str, Any]) -> tuple[str, str]:
    tests = evidence.get("tests", {})
    if gate in tests:
        status = str(tests[gate].get("status", "")).upper()
        if status in {"PASS", "VERIFIED"}:
            return "PASS", tests[gate].get("evidence", "recorded")
        if status in {"EXECUTED", "SCENARIO_EXECUTED"}:
            return "UNVERIFIED", "Scenario executed, but contract pass was not recorded."
        return "FAIL", tests[gate].get("evidence", "recorded failure")
    return "UNVERIFIED", "No evidence recorded."


def architecture_decision_check() -> tuple[str, str]:
    path = STATE_DIR / "ARCHITECTURE_DECISION.md"
    if path.exists() and path.read_text(encoding="utf-8").strip():
        return "PASS", "Architecture decision exists."
    return "FAIL", ".codex/state/ARCHITECTURE_DECISION.md is required for RED risk."


def product_scope_check(files: list[str], task: dict[str, Any]) -> tuple[str, list[str]]:
    contract = task.get("contract", {})
    allowed = contract.get("allowed_implementation_scope", [])
    tags = set(contract.get("capability_tags", []))
    if "harness" in tags:
        offenders = [path for path in files if matches(path, PRODUCT_PATTERNS) and not matches(path, HARNESS_PATTERNS)]
        return ("FAIL" if offenders else "PASS", offenders)

    if allowed and allowed != ["task-specific product files after contract review"]:
        offenders = [path for path in files if not matches(path, allowed)]
        return ("FAIL" if offenders else "PASS", offenders)
    return "PASS", []


def evaluate(mode: str = "local", run_commands: bool = True) -> dict[str, Any]:
    files = changed_files()
    task = load_task()
    contract = task.get("contract", {})
    tags = contract.get("capability_tags", [])
    risk = contract.get("risk_level", "GREEN")
    required = select_required_gates(files, tags, risk, mode)
    evidence = load_evidence()

    checks: dict[str, dict[str, str]] = {}
    scope_status, offenders = product_scope_check(files, task)
    if scope_status != "PASS":
        checks["product_scope"] = {
            "status": "FAIL",
            "detail": "Unrequested product files changed: " + ", ".join(offenders),
        }

    for gate in required:
        if not run_commands:
            checks[gate] = {"status": "PENDING", "detail": "dry run"}
            continue
        if gate == "instruction_budget":
            status, detail = instruction_budget_check()
        elif gate == "handoff_budget":
            status, detail = handoff_budget_check()
        elif gate == "py_compile":
            status, detail = py_compile_check(files)
        elif gate == "harness_pytest":
            status, detail = harness_pytest_check()
        elif gate == "node_check":
            status, detail = node_check(files)
        elif gate == "architecture_decision":
            status, detail = architecture_decision_check()
        else:
            status, detail = evidence_gate(gate, evidence)
        checks[gate] = {"status": status, "detail": detail}

    statuses = [item["status"] for item in checks.values()]
    missing = [name for name, item in checks.items() if item["status"] in {"UNVERIFIED", "PENDING"}]
    failed = [name for name, item in checks.items() if item["status"] == "FAIL"]
    evidence_status = "FAIL" if failed else ("UNVERIFIED" if missing else "PASS")
    contract_status = "FAIL" if failed else ("UNVERIFIED" if missing else "PASS")

    result = {
        "mode": mode,
        "branch": codex_task.current_branch(),
        "head": codex_task.current_head(),
        "changed_files": files,
        "required_gates": required,
        "checks": checks,
        "evidence_status": evidence_status,
        "contract_status": contract_status,
        "missing": missing,
        "failed": failed,
    }
    write_result(result)
    return result


def write_result(result: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_JSON.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    lines = [
        "# Codex Gate Result",
        "",
        f"- Mode: `{result['mode']}`",
        f"- Evidence status: `{result['evidence_status']}`",
        f"- Contract status: `{result['contract_status']}`",
        f"- Branch: `{result['branch']}`",
        f"- HEAD: `{result['head']}`",
        "",
        "## Checks",
        "",
    ]
    for name, item in result["checks"].items():
        detail = item.get("detail", "").replace("\n", " ")[:500]
        lines.append(f"- `{name}`: `{item.get('status')}` - {detail}")
    RESULT_MD.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the deterministic Codex gate.")
    parser.add_argument("--mode", choices=["local", "stop", "ci", "release"], default="local")
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    result = evaluate(args.mode, run_commands=not args.dry_run)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result["evidence_status"] == "PASS" and result["contract_status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
