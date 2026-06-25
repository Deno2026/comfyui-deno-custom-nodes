from __future__ import annotations

from common import codex_task, emit, prompt_from_payload, read_payload


def main() -> int:
    payload = read_payload()
    prompt = prompt_from_payload(payload)
    if prompt:
        task = codex_task.update_task(prompt)
        context = codex_task.render_task_md(task)
    else:
        context = codex_task.session_context()
    emit(
        hook="UserPromptSubmit",
        developer_context=(
            "Interpret conversational intent, update the internal task contract, "
            "avoid formal user templates, and avoid unrequested features.\n\n" + context
        ),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
