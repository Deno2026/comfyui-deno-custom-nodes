from __future__ import annotations

from common import codex_task, emit, read_payload


def main() -> int:
    payload = read_payload()
    note = payload.get("reason", "pre-compact snapshot") if isinstance(payload, dict) else "pre-compact snapshot"
    checkpoint = codex_task.checkpoint(str(note))
    emit(hook="PreCompact", checkpoint=checkpoint)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
