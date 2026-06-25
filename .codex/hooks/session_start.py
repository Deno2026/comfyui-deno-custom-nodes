from __future__ import annotations

from common import codex_task, emit, read_payload


def main() -> int:
    payload = read_payload()
    context = codex_task.session_context()
    emit(hook="SessionStart", event=payload.get("event", "startup"), developer_context=context)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
