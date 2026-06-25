from __future__ import annotations

import json

from common import ROOT, codex_task, emit, read_payload
from tools import codex_gate


STOP_STATE = codex_task.STATE_DIR / "STOP_HOOK.json"


def read_stop_state() -> dict:
    if STOP_STATE.exists():
        return json.loads(STOP_STATE.read_text(encoding="utf-8"))
    return {"stop_hook_active": False}


def write_stop_state(data: dict) -> None:
    codex_task.ensure_state_dir()
    STOP_STATE.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    read_payload()
    state = read_stop_state()
    result = codex_gate.evaluate("stop", run_commands=True)
    passed = result["evidence_status"] == "PASS" and result["contract_status"] == "PASS"
    if passed:
        write_stop_state({"stop_hook_active": False})
        emit(hook="Stop", decision="allow", gate=result)
        return 0

    if not state.get("stop_hook_active"):
        write_stop_state({"stop_hook_active": True})
        emit(hook="Stop", decision="continue", missing=result.get("missing", []), failed=result.get("failed", []))
        return 2

    write_stop_state({"stop_hook_active": False})
    codex_task.escalate("Stop hook gate failed after one continuation.", acceptance_id="stop-hook-gate")
    emit(hook="Stop", decision="allow", status="BLOCKED", gate=result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
