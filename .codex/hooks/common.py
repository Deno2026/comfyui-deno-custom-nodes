from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools import codex_task  # noqa: E402


def read_payload() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {"payload": data}
    except json.JSONDecodeError:
        return {"text": raw}


def prompt_from_payload(payload: dict[str, Any]) -> str:
    for key in ("prompt", "message", "text", "input"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    if isinstance(payload.get("messages"), list) and payload["messages"]:
        last = payload["messages"][-1]
        if isinstance(last, dict):
            content = last.get("content")
            if isinstance(content, str):
                return content.strip()
    return ""


def emit(**fields: Any) -> None:
    print(json.dumps(fields, ensure_ascii=False))
