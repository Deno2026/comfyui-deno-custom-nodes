from __future__ import annotations

from common import codex_task, emit, read_payload


def main() -> int:
    read_payload()
    checkpoint = codex_task.CHECKPOINT_MD.read_text(encoding="utf-8") if codex_task.CHECKPOINT_MD.exists() else ""
    context = checkpoint or codex_task.session_context()
    emit(hook="PostCompact", developer_context=context)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
