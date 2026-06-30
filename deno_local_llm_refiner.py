from __future__ import annotations

import base64
import hashlib
import http.client
import itertools
from io import BytesIO
import json
import logging
import os
import queue
import random
import re
import threading
import time
import urllib.parse
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

import numpy as np
from PIL import Image

try:
    from comfy_execution.graph_utils import ExecutionBlocker
except Exception:  # pragma: no cover - ComfyUI provides this at runtime.
    class ExecutionBlocker:  # type: ignore[no-redef]
        def __init__(self, message):
            self.message = message

try:
    from aiohttp import web
    from server import PromptServer
except Exception:  # pragma: no cover - ComfyUI provides these at runtime.
    web = None
    PromptServer = None

try:
    import comfy.model_management as comfy_model_management
except Exception:  # pragma: no cover - ComfyUI provides this at runtime.
    comfy_model_management = None

try:
    from .deno_resolution_common import validate_combo_choice
except Exception:  # pragma: no cover - direct import during local tests
    from deno_resolution_common import validate_combo_choice


PROVIDER_OLLAMA = "Ollama"
PROVIDER_LM_STUDIO = "LM Studio"
PROVIDER_LLAMA_CPP = "llama.cpp"
PROVIDER_VLLM = "vLLM"
PROVIDER_CUSTOM = "Custom"
LEGACY_PROVIDER_CUSTOM = "Custom Local Server"
PROVIDERS = [PROVIDER_OLLAMA, PROVIDER_LM_STUDIO, PROVIDER_LLAMA_CPP, PROVIDER_VLLM, PROVIDER_CUSTOM]
OPENAI_COMPATIBLE_PROVIDERS = {PROVIDER_LLAMA_CPP, PROVIDER_VLLM, PROVIDER_CUSTOM}
OLLAMA_DEFAULT_SERVER = "http://127.0.0.1:11434"
LM_STUDIO_DEFAULT_SERVER = "http://127.0.0.1:1234/v1"
LLAMA_CPP_DEFAULT_SERVER = "http://127.0.0.1:8080/v1"
VLLM_DEFAULT_SERVER = "http://127.0.0.1:8000/v1"
CUSTOM_SERVER_DEFAULT = "http://127.0.0.1:8000/v1"
LEGACY_CUSTOM_SERVER_DEFAULT = CUSTOM_SERVER_DEFAULT
LOCAL_LLM_IMAGE_MAX_SIDE = 2048
LOCAL_LLM_IMAGE_MAX_PIXELS = 2 * 1024 * 1024
LOCAL_LLM_IMAGE_JPEG_QUALITY = 92

MEMORY_UNLOAD_AFTER_RUN = "Unload after run"
LEGACY_MEMORY_FREE_AFTER_BATCH = "Free VRAM after batch"
MEMORY_KEEP_MINUTES = "Keep for minutes"
MEMORY_KEEP_LOADED = "Keep loaded"
MODEL_MEMORY_OPTIONS = [
    MEMORY_UNLOAD_AFTER_RUN,
    MEMORY_KEEP_MINUTES,
    MEMORY_KEEP_LOADED,
]
MODEL_MEMORY_ALIASES = {
    LEGACY_MEMORY_FREE_AFTER_BATCH: MEMORY_UNLOAD_AFTER_RUN,
}
COMFY_VRAM_AUTO = "Auto: unload only before first LLM call"
COMFY_VRAM_ALWAYS = "Always unload before each LLM call"
COMFY_VRAM_NEVER = "Never unload before LLM call"
COMFY_VRAM_POLICY_OPTIONS = [
    COMFY_VRAM_AUTO,
    COMFY_VRAM_ALWAYS,
    COMFY_VRAM_NEVER,
]
COMFY_VRAM_POLICY_ALIASES = {
    "Auto": COMFY_VRAM_AUTO,
    "Always free": COMFY_VRAM_ALWAYS,
    "Never free": COMFY_VRAM_NEVER,
}
_IS_CHANGED_COUNTER = itertools.count()
COMFY_VRAM_FREE_SETTLE_SECONDS = 0.6
SEED_MODE_FIXED = "fixed"
SEED_MODE_INCREMENT = "increment"
SEED_MODE_DECREMENT = "decrement"
SEED_MODE_RANDOMIZE = "randomize"
SEED_MODE_OPTIONS = [
    SEED_MODE_FIXED,
    SEED_MODE_INCREMENT,
    SEED_MODE_DECREMENT,
    SEED_MODE_RANDOMIZE,
]
SHIFTED_MODEL_WIDGET_VALUES = {
    PROVIDER_OLLAMA,
    PROVIDER_LM_STUDIO,
    PROVIDER_LLAMA_CPP,
    PROVIDER_VLLM,
    PROVIDER_CUSTOM,
    LEGACY_PROVIDER_CUSTOM,
    MEMORY_UNLOAD_AFTER_RUN,
    LEGACY_MEMORY_FREE_AFTER_BATCH,
    MEMORY_KEEP_MINUTES,
    MEMORY_KEEP_LOADED,
    COMFY_VRAM_AUTO,
    COMFY_VRAM_ALWAYS,
    COMFY_VRAM_NEVER,
    SEED_MODE_FIXED,
    SEED_MODE_INCREMENT,
    SEED_MODE_DECREMENT,
    SEED_MODE_RANDOMIZE,
    "Refresh Models",
    "Stop LLM",
    "Unload LLM",
    "System Prompt",
    "Thinking",
    "Seed",
    "Seed Mode",
    "Model After Run",
    "Unload ComfyUI Models Setting",
    "ComfyUI VRAM",
    "Ollama Model",
    "LM Studio Model",
    "Legacy Model",
    "Custom Model",
    "Custom Server URL",
    *COMFY_VRAM_POLICY_ALIASES,
}
MISSING_SAVED_MODEL_PREFIX = "Missing saved model: "

LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1", "[::1]"}
PROGRESS_EVENT = "deno-local-llm-progress"
THINK_TAG_RE = re.compile(r"<(?:think|thinking)>(.*?)</(?:think|thinking)>", re.IGNORECASE | re.DOTALL)
FINAL_PROMPT_TAG_RE = re.compile(r"<final\\?_prompt>(.*?)</final\\?_prompt>", re.IGNORECASE | re.DOTALL)
FINAL_PROMPT_MARKER_RE = re.compile(
    r"FINAL\\?[_\s-]*PROMPT\\?[_\s-]*START\s*(.*?)\s*FINAL\\?[_\s-]*PROMPT\\?[_\s-]*END",
    re.IGNORECASE | re.DOTALL,
)
FINAL_PROMPT_LINE_RE = re.compile(r"DENO_FINAL_PROMPT\s*:\s*([^\r\n]+)", re.IGNORECASE)
REVIEWER_PREVIEW_SUBFOLDER = "deno_llm_reviewer"
_WARM_LOCAL_LLM_KEYS: Dict[str, Optional[float]] = {}
_ACTIVE_LOCAL_LLM_KEYS: Dict[str, int] = {}
_CANCEL_LOCAL_LLM_KEYS: Set[str] = set()
_SLEEPING_VLLM_KEYS: Set[str] = set()
_ACTIVE_LOCAL_LLM_LOCK = threading.Lock()


def _json_response(payload: Dict[str, Any], status: int = 200):
    if web is None:
        return {"payload": payload, "status": status}
    return web.json_response(payload, status=status)


def _parse_local_llm_url(url: str) -> urllib.parse.ParseResult:
    parsed = urllib.parse.urlparse(str(url or "").strip())
    if parsed.scheme not in {"http", "https"}:
        raise RuntimeError("Use a local http:// or https:// server URL.")
    host = parsed.hostname or ""
    if host.lower() not in LOCAL_HOSTS:
        raise RuntimeError(
            "Only local LLM servers are allowed for this DENO node. "
            "Use 127.0.0.1 or localhost."
        )
    return parsed


def _assert_local_url(url: str) -> None:
    _parse_local_llm_url(url)


def _open_local_llm_http_connection(
    parsed: urllib.parse.ParseResult,
    timeout: float,
) -> http.client.HTTPConnection:
    host = parsed.hostname
    if not host:
        raise RuntimeError("Local LLM server URL is missing a host.")
    port = parsed.port
    connection_cls = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    return connection_cls(host, port, timeout=timeout)


def _strip_trailing_slash(url: str) -> str:
    return str(url or "").strip().rstrip("/")


def _looks_like_url(value: Any) -> bool:
    text = str(value or "").strip().lower()
    return text.startswith(("http://", "https://"))


def _is_missing_saved_model_display(value: Any) -> bool:
    return str(value or "").strip().startswith(MISSING_SAVED_MODEL_PREFIX)


def _original_model_value_from_display(value: Any) -> str:
    text = str(value or "").strip()
    if text.startswith(MISSING_SAVED_MODEL_PREFIX):
        return text[len(MISSING_SAVED_MODEL_PREFIX):].strip()
    return text


def _looks_like_shifted_model_value(value: Any) -> bool:
    text = _original_model_value_from_display(value)
    if not text:
        return False
    if _looks_like_url(text) or text in SHIFTED_MODEL_WIDGET_VALUES:
        return True
    if text.lower() in {"true", "false"}:
        return True
    return bool(re.fullmatch(r"-?\d+(?:\.\d+)?", text))


def _missing_saved_model_error(provider: str, model: Any) -> str:
    model_value = _original_model_value_from_display(model)
    return (
        f"Saved {provider} model is not available on this PC: {model_value}. "
        "Start the local LLM server and press Refresh Models, install/load that model, or choose another installed model."
    )


def _shifted_model_error(action: str, model: str) -> str:
    return (
        f"Refresh models and select a real local LLM model before {action}. "
        f"The current value looks like a shifted UI label, not a model name: {model}"
    )


def _normalize_provider(provider: str) -> str:
    value = str(provider or "").strip()
    if value == LEGACY_PROVIDER_CUSTOM:
        return PROVIDER_CUSTOM
    return value if value in PROVIDERS else PROVIDER_OLLAMA


def _default_openai_compatible_server(provider: str) -> str:
    provider = _normalize_provider(provider)
    if provider == PROVIDER_LLAMA_CPP:
        return LLAMA_CPP_DEFAULT_SERVER
    if provider == PROVIDER_VLLM:
        return VLLM_DEFAULT_SERVER
    return CUSTOM_SERVER_DEFAULT


def _normalize_ollama_url(server_url: str) -> str:
    url = _strip_trailing_slash(server_url or "http://127.0.0.1:11434")
    _assert_local_url(url)
    return url


def _normalize_lm_openai_url(server_url: str) -> str:
    url = _strip_trailing_slash(server_url or "http://127.0.0.1:1234/v1")
    _assert_local_url(url)
    if url.endswith("/v1"):
        return url
    if url.endswith("/api/v1"):
        return url[:-7] + "/v1"
    return f"{url}/v1"


def _normalize_lm_native_url(server_url: str) -> str:
    url = _strip_trailing_slash(server_url or "http://127.0.0.1:1234")
    _assert_local_url(url)
    if url.endswith("/v1"):
        return url[:-3]
    if url.endswith("/api/v1"):
        return url[:-7]
    return url


def _url_with_path(parsed: urllib.parse.ParseResult, path: str) -> str:
    normalized_path = path.rstrip("/")
    if normalized_path == "/":
        normalized_path = ""
    return urllib.parse.urlunparse((
        parsed.scheme.lower() or "http",
        parsed.netloc,
        normalized_path,
        "",
        "",
        "",
    )).rstrip("/")


def _normalize_openai_compatible_urls(provider: str, server_url: str) -> Tuple[str, str]:
    raw = _strip_trailing_slash(server_url or _default_openai_compatible_server(provider))
    parsed = _parse_local_llm_url(raw)
    path = (parsed.path or "").rstrip("/")
    for suffix in ("/chat/completions", "/completions", "/models"):
        if path.endswith(suffix):
            path = path[: -len(suffix)].rstrip("/")
    if path.endswith("/v1"):
        root_path = path[:-3].rstrip("/")
    else:
        root_path = path
    server_root = _url_with_path(parsed, root_path)
    openai_base = f"{server_root}/v1"
    return server_root, openai_base


def _canonical_local_llm_state_url(provider: str, server_url: str) -> str:
    provider = _normalize_provider(provider)
    if provider == PROVIDER_OLLAMA:
        url = _normalize_ollama_url(server_url)
    elif provider == PROVIDER_LM_STUDIO:
        url = _normalize_lm_native_url(server_url)
    elif provider in OPENAI_COMPATIBLE_PROVIDERS:
        _server_root, url = _normalize_openai_compatible_urls(provider, server_url)
    else:
        url = _strip_trailing_slash(server_url)

    parsed = urllib.parse.urlparse(url)
    host = str(parsed.hostname or "").lower()
    if host in {"localhost", "::1", "[::1]"}:
        host = "127.0.0.1"
    if not host:
        return _strip_trailing_slash(url).lower()
    netloc = f"{host}:{parsed.port}" if parsed.port else host
    path = parsed.path.rstrip("/")
    return urllib.parse.urlunparse((parsed.scheme.lower() or "http", netloc, path, "", "", ""))


def _model_unavailable_message(model: str, detail: str = "") -> str:
    model_value = str(model or "").strip()
    if model_value:
        message = (
            f"Selected local LLM model is not available: {model_value}. "
            "Refresh Models and choose another model, or load this model in the selected local server first."
        )
    else:
        message = "Selected local LLM model is not available. Refresh Models and choose another model."
    detail_value = str(detail or "").strip()
    if detail_value:
        message = f"{message} Server detail: {detail_value[:300]}"
    return message


def _looks_like_model_unavailable_error(message: str) -> bool:
    text = str(message or "").lower()
    return any(
        marker in text
        for marker in (
            "model_not_found",
            "model not found",
            "not found",
            "not loaded",
            "no such model",
            "unknown model",
            "model is not loaded",
        )
    )


def _extract_local_llm_error_detail(data: str) -> str:
    text = str(data or "").strip()
    if not text:
        return ""
    try:
        payload = json.loads(text)
    except Exception:
        return text
    error = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(error, dict):
        return str(error.get("message") or error.get("type") or error)
    if error is not None:
        return str(error)
    return text


def _local_llm_http_error(status: int, data: str, payload: Optional[Dict[str, Any]] = None) -> RuntimeError:
    detail = _extract_local_llm_error_detail(data)
    model = ""
    if isinstance(payload, dict):
        model = str(payload.get("model") or payload.get("instance_id") or "").strip()
    if status in {400, 404, 405} and model and _looks_like_model_unavailable_error(detail):
        return RuntimeError(_model_unavailable_message(model, detail))
    return RuntimeError(f"Local LLM server returned HTTP {status}: {str(data or '')[:800]}")


def _http_json(
    url: str,
    payload: Optional[Dict[str, Any]] = None,
    method: str = "GET",
    timeout: float = 20.0,
) -> Dict[str, Any]:
    parsed = _parse_local_llm_url(url)
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    connection = _open_local_llm_http_connection(parsed, timeout=timeout)
    try:
        connection.request(method.upper(), path, body=body, headers=headers)
        response = connection.getresponse()
        data = response.read().decode("utf-8", errors="replace")
        if response.status >= 400:
            raise _local_llm_http_error(response.status, data, payload)
    except (TimeoutError, OSError, http.client.HTTPException) as exc:
        raise RuntimeError(f"Could not reach local LLM server: {exc}") from exc
    finally:
        try:
            connection.close()
        except Exception:
            pass
    if not data.strip():
        return {}
    return json.loads(data)


def _http_stream_json_lines(
    url: str,
    payload: Dict[str, Any],
    timeout: float = 600.0,
    cancel_key: Optional[str] = None,
) -> Iterable[Dict[str, Any]]:
    try:
        for raw_line in _iter_cancellable_response_lines(url, payload, timeout=timeout, cancel_key=cancel_key):
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            yield json.loads(line)
    except (TimeoutError, OSError, http.client.HTTPException) as exc:
        raise RuntimeError(f"Could not reach local LLM server: {exc}") from exc


def _http_stream_sse(
    url: str,
    payload: Dict[str, Any],
    timeout: float = 600.0,
    cancel_key: Optional[str] = None,
) -> Iterable[Tuple[str, Dict[str, Any]]]:
    event_name = "message"
    data_lines: List[str] = []
    try:
        for raw_line in _iter_cancellable_response_lines(url, payload, timeout=timeout, cancel_key=cancel_key):
            line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
            if not line:
                if data_lines:
                    data = "\n".join(data_lines).strip()
                    if data and data != "[DONE]":
                        yield event_name, json.loads(data)
                event_name = "message"
                data_lines = []
                continue
            if line.startswith("event:"):
                event_name = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data_lines.append(line.split(":", 1)[1].strip())
        if data_lines:
            data = "\n".join(data_lines).strip()
            if data and data != "[DONE]":
                yield event_name, json.loads(data)
    except (TimeoutError, OSError, http.client.HTTPException) as exc:
        raise RuntimeError(f"Could not reach local LLM server: {exc}") from exc


def _iter_cancellable_response_lines(
    url: str,
    payload: Dict[str, Any],
    timeout: float = 600.0,
    cancel_key: Optional[str] = None,
) -> Iterable[bytes]:
    parsed = _parse_local_llm_url(url)
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"

    connection = _open_local_llm_http_connection(parsed, timeout=timeout)
    response_queue: "queue.Queue[Tuple[str, Any]]" = queue.Queue()
    stop_event = threading.Event()

    def reader() -> None:
        try:
            body = json.dumps(payload).encode("utf-8")
            connection.request("POST", path, body=body, headers={"Content-Type": "application/json"})
            response = connection.getresponse()
            if response.status >= 400:
                message = response.read().decode("utf-8", errors="replace")
                raise _local_llm_http_error(response.status, message, payload)
            while not stop_event.is_set():
                raw_line = response.readline()
                if raw_line == b"":
                    break
                response_queue.put(("line", raw_line))
            response_queue.put(("done", None))
        except BaseException as exc:
            if stop_event.is_set():
                response_queue.put(("done", None))
            else:
                response_queue.put(("error", exc))
        finally:
            try:
                connection.close()
            except Exception:
                pass

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()
    try:
        while True:
            _raise_if_local_llm_stopped(cancel_key)
            try:
                kind, value = response_queue.get(timeout=0.2)
            except queue.Empty:
                continue
            _raise_if_local_llm_stopped(cancel_key)
            if kind == "line":
                yield value
                continue
            if kind == "done":
                break
            if kind == "error":
                raise value
    finally:
        stop_event.set()
        try:
            connection.close()
        except Exception:
            pass
        thread.join(timeout=0.1)


def _extract_scalar(value: Any, default: Any = None) -> Any:
    if isinstance(value, list):
        if not value:
            return default
        return _extract_scalar(value[0], default)
    return default if value is None else value


def _extract_media(value: Any) -> Any:
    if isinstance(value, list):
        for item in value:
            found = _extract_media(item)
            if found is not None:
                return found
        return None
    return value


def _safe_int(value: Any, default: int, minimum: int = 0, maximum: Optional[int] = None) -> int:
    try:
        parsed = int(float(_extract_scalar(value, default)))
    except (TypeError, ValueError, OverflowError):
        parsed = int(default)
    parsed = max(int(minimum), parsed)
    if maximum is not None:
        parsed = min(int(maximum), parsed)
    return parsed


def _safe_bool(value: Any, default: bool = False) -> bool:
    scalar = _extract_scalar(value, default)
    if isinstance(scalar, bool):
        return scalar
    text = str(scalar).strip().lower()
    if text in {"true", "1", "yes", "on"}:
        return True
    if text in {"false", "0", "no", "off", ""}:
        return False
    return bool(default)


def _cache_array_signature(value: Any) -> Dict[str, Any]:
    array = np.ascontiguousarray(value)
    return {
        "__array__": True,
        "dtype": str(array.dtype),
        "shape": list(array.shape),
        "sha256": hashlib.sha256(array.tobytes()).hexdigest(),
    }


def _cache_stable_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, np.ndarray):
        return _cache_array_signature(value)
    if hasattr(value, "detach") and hasattr(value, "cpu"):
        try:
            return _cache_array_signature(value.detach().cpu().numpy())
        except Exception:
            pass
    if isinstance(value, dict):
        return {
            str(key): _cache_stable_value(item)
            for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))
        }
    if isinstance(value, (list, tuple)):
        return [_cache_stable_value(item) for item in value]
    try:
        json.dumps(value, sort_keys=True)
        return value
    except TypeError:
        return {"__repr__": repr(value), "__type__": type(value).__name__}


def _local_llm_cache_key(kwargs: Dict[str, Any]) -> str:
    seed_mode = _normalize_seed_mode(kwargs.get("seed_mode", SEED_MODE_FIXED))
    if seed_mode == SEED_MODE_RANDOMIZE:
        return f"randomize:{time.monotonic_ns()}:{next(_IS_CHANGED_COUNTER)}"
    payload = {
        key: _cache_stable_value(value)
        for key, value in sorted(kwargs.items())
        if key != "unique_id"
    }
    payload["seed_mode"] = seed_mode
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return f"stable:{hashlib.sha256(encoded.encode('utf-8')).hexdigest()}"


def _normalize_model_memory(value: Any) -> str:
    text = str(_extract_scalar(value, MEMORY_UNLOAD_AFTER_RUN) or MEMORY_UNLOAD_AFTER_RUN).strip()
    text = MODEL_MEMORY_ALIASES.get(text, text)
    return text if text in MODEL_MEMORY_OPTIONS else MEMORY_UNLOAD_AFTER_RUN


def _normalize_comfy_vram_policy(value: Any) -> str:
    text = str(_extract_scalar(value, COMFY_VRAM_AUTO) or COMFY_VRAM_AUTO).strip()
    text = COMFY_VRAM_POLICY_ALIASES.get(text, text)
    return text if text in COMFY_VRAM_POLICY_OPTIONS else COMFY_VRAM_AUTO


def _normalize_seed_mode(value: Any) -> str:
    text = str(_extract_scalar(value, SEED_MODE_FIXED) or SEED_MODE_FIXED).strip()
    if text == "random":
        return SEED_MODE_RANDOMIZE
    return text if text in SEED_MODE_OPTIONS else SEED_MODE_FIXED


def _flatten_prompts(value: Any) -> List[str]:
    if value is None:
        return [""]
    if isinstance(value, list):
        prompts: List[str] = []
        for item in value:
            prompts.extend(_flatten_prompts(item))
        return prompts or [""]
    return [str(value)]


def _seed_for_index(seed: int, mode: str = "fixed", index: int = 0) -> int:
    seed = int(seed)
    mode = _normalize_seed_mode(mode)
    if mode == SEED_MODE_INCREMENT:
        return max(0, seed + index)
    if mode == SEED_MODE_DECREMENT:
        return max(0, seed - index)
    if mode == SEED_MODE_RANDOMIZE:
        return random.randint(0, 0xFFFFFFFF)
    return max(0, seed)


def _ollama_keep_alive(model_memory: str, keep_minutes: int, is_last: bool) -> Any:
    keep_minutes = max(1, int(keep_minutes))
    model_memory = _normalize_model_memory(model_memory)
    if model_memory == MEMORY_KEEP_LOADED:
        return "-1m"
    if model_memory == MEMORY_KEEP_MINUTES:
        return f"{keep_minutes}m"
    return "0m" if is_last else f"{keep_minutes}m"


def _lm_ttl(model_memory: str, keep_minutes: int, is_last: bool) -> int:
    keep_minutes = max(1, int(keep_minutes))
    model_memory = _normalize_model_memory(model_memory)
    if model_memory == MEMORY_KEEP_LOADED:
        return 24 * 60 * 60
    if model_memory == MEMORY_KEEP_MINUTES:
        return keep_minutes * 60
    return 1 if is_last else max(60, keep_minutes * 60)


def _should_unload_after_run(model_memory: str, is_last: bool) -> bool:
    return bool(is_last and _normalize_model_memory(model_memory) == MEMORY_UNLOAD_AFTER_RUN)


def _post_run_unload_warning(provider: str, unload_info: Any) -> str:
    if not isinstance(unload_info, dict):
        return ""
    action = str(unload_info.get("action") or "")
    message = str(unload_info.get("message") or "").strip()
    if action == "failed":
        detail = f": {message}" if message else "."
        return f"Generation finished, but {provider} unload after run failed{detail}"
    if action == "unsupported":
        detail = f" {message}" if message else ""
        return f"Generation finished, but unload after run is unavailable for {provider}.{detail}"
    return ""


def _llm_state_key(provider: str, server_url: str, model: str) -> str:
    return "|".join([
        _normalize_provider(provider),
        _canonical_local_llm_state_url(provider, server_url),
        str(model or "").strip(),
    ])


def _is_local_llm_marked_warm(key: str) -> bool:
    expires_at = _WARM_LOCAL_LLM_KEYS.get(key)
    if key not in _WARM_LOCAL_LLM_KEYS:
        return False
    if expires_at is None:
        return True
    if time.monotonic() < expires_at:
        return True
    _WARM_LOCAL_LLM_KEYS.pop(key, None)
    return False


def _mark_local_llm_warm(provider: str, server_url: str, model: str, model_memory: str, keep_minutes: int) -> None:
    if _normalize_provider(provider) == PROVIDER_CUSTOM:
        return
    key = _llm_state_key(provider, server_url, model)
    memory_value = _normalize_model_memory(model_memory)
    if memory_value == MEMORY_KEEP_LOADED:
        _WARM_LOCAL_LLM_KEYS[key] = None
    elif memory_value == MEMORY_KEEP_MINUTES:
        _WARM_LOCAL_LLM_KEYS[key] = time.monotonic() + max(1, int(keep_minutes)) * 60
    else:
        _WARM_LOCAL_LLM_KEYS.pop(key, None)


def _clear_local_llm_warm(provider: str, server_url: str, model: str) -> None:
    _WARM_LOCAL_LLM_KEYS.pop(_llm_state_key(provider, server_url, model), None)


def _parse_llm_state_key(key: str) -> Optional[Tuple[str, str, str]]:
    parts = str(key or "").split("|", 2)
    if len(parts) != 3 or not parts[0] or not parts[1] or not parts[2]:
        return None
    return parts[0], parts[1], parts[2]


def _unload_other_warm_local_llms(provider: str, server_url: str, model: str, node_id: str) -> Dict[str, Any]:
    current_key = _llm_state_key(provider, server_url, model)
    unloaded: List[Dict[str, Any]] = []
    errors: List[str] = []

    for key in list(_WARM_LOCAL_LLM_KEYS):
        if key == current_key:
            continue
        if not _is_local_llm_marked_warm(key):
            continue
        parsed = _parse_llm_state_key(key)
        if parsed is None:
            _WARM_LOCAL_LLM_KEYS.pop(key, None)
            continue
        old_provider, old_server_url, old_model = parsed
        if _llm_state_key(old_provider, old_server_url, old_model) == current_key:
            _WARM_LOCAL_LLM_KEYS.pop(key, None)
            continue
        _send_progress({
            "node_id": node_id,
            "status": "swapping local LLM",
            "provider": provider,
            "model": model,
            "index": 0,
            "total": 0,
            "answer": "",
            "thinking": f"Unloading previous kept {old_provider} model before loading {provider}.",
        })
        try:
            result = unload_local_llm_model(old_provider, old_server_url, old_model)
            if not result.get("ok"):
                errors.append(str(result.get("message") or result.get("error") or result))
                continue
            unloaded.append({
                "provider": old_provider,
                "server_url": old_server_url,
                "model": old_model,
                "message": result.get("message", ""),
            })
        except RuntimeError as exc:
            message = str(exc)
            if "Could not reach local LLM server" in message:
                _WARM_LOCAL_LLM_KEYS.pop(key, None)
                unloaded.append({
                    "provider": old_provider,
                    "server_url": old_server_url,
                    "model": old_model,
                    "message": "Cleared stale warm marker because the previous local LLM server was not reachable.",
                })
                continue
            errors.append(message)

    if errors:
        raise RuntimeError("Could not unload the previous kept local LLM before switching: " + "; ".join(errors))
    return {
        "action": "unloaded_previous" if unloaded else "none",
        "current": {
            "provider": provider,
            "server_url": _strip_trailing_slash(server_url),
            "model": model,
        },
        "unloaded": unloaded,
    }


def _mark_local_llm_active(provider: str, server_url: str, model: str) -> str:
    key = _llm_state_key(provider, server_url, model)
    with _ACTIVE_LOCAL_LLM_LOCK:
        _ACTIVE_LOCAL_LLM_KEYS[key] = _ACTIVE_LOCAL_LLM_KEYS.get(key, 0) + 1
    return key


def _clear_local_llm_active(key: str) -> None:
    with _ACTIVE_LOCAL_LLM_LOCK:
        count = _ACTIVE_LOCAL_LLM_KEYS.get(key, 0)
        if count <= 1:
            _ACTIVE_LOCAL_LLM_KEYS.pop(key, None)
            _CANCEL_LOCAL_LLM_KEYS.discard(key)
        else:
            _ACTIVE_LOCAL_LLM_KEYS[key] = count - 1


def _is_local_llm_active(provider: str, server_url: str, model: str) -> bool:
    key = _llm_state_key(provider, server_url, model)
    with _ACTIVE_LOCAL_LLM_LOCK:
        return _ACTIVE_LOCAL_LLM_KEYS.get(key, 0) > 0


def _busy_unload_response(provider: str, model: str) -> Dict[str, Any]:
    return {
        "ok": False,
        "busy": True,
        "message": (
            f"{provider} model is still generating: {model}. "
            "Press Stop LLM first, wait for the current request to stop, then unload."
        ),
    }


def _local_llm_stop_exception(message: str):
    exc_cls = getattr(comfy_model_management, "InterruptProcessingException", None) if comfy_model_management else None
    if exc_cls is not None:
        return exc_cls(message)
    return RuntimeError(message)


def _raise_if_local_llm_stopped(cancel_key: Optional[str] = None) -> None:
    if cancel_key:
        with _ACTIVE_LOCAL_LLM_LOCK:
            cancelled = cancel_key in _CANCEL_LOCAL_LLM_KEYS
            if cancelled:
                _CANCEL_LOCAL_LLM_KEYS.discard(cancel_key)
        if cancelled:
            raise _local_llm_stop_exception("Local LLM generation stopped.")
    if comfy_model_management is not None:
        throw_if_interrupted = getattr(comfy_model_management, "throw_exception_if_processing_interrupted", None)
        if callable(throw_if_interrupted):
            throw_if_interrupted()


def _candidate_stop_keys(provider: str, server_url: str, model: str) -> List[str]:
    provider = _normalize_provider(provider)
    if provider == PROVIDER_LM_STUDIO:
        native_base = _normalize_lm_native_url(server_url)
        openai_base = _normalize_lm_openai_url(server_url)
        return [
            _llm_state_key(provider, openai_base, model),
            _llm_state_key(provider, native_base, model),
        ]
    if provider in OPENAI_COMPATIBLE_PROVIDERS:
        server_root, openai_base = _normalize_openai_compatible_urls(provider, server_url)
        return [
            _llm_state_key(provider, openai_base, model),
            _llm_state_key(provider, server_root, model),
        ]
    base = _normalize_ollama_url(server_url)
    return [_llm_state_key(PROVIDER_OLLAMA, base, model)]


def stop_local_llm_generation(provider: str, server_url: str, model: str) -> Dict[str, Any]:
    provider = _normalize_provider(provider)
    model = str(model or "").strip()
    if not model:
        raise RuntimeError("Select a local LLM model before stopping.")
    if _looks_like_shifted_model_value(model):
        raise RuntimeError(_shifted_model_error("stopping", model))
    keys = _candidate_stop_keys(provider, server_url, model)
    with _ACTIVE_LOCAL_LLM_LOCK:
        active_keys = [key for key in keys if _ACTIVE_LOCAL_LLM_KEYS.get(key, 0) > 0]
        for key in active_keys:
            _CANCEL_LOCAL_LLM_KEYS.add(key)
    if not active_keys:
        return {
            "ok": False,
            "stopping": False,
            "message": f"No active {provider} request matched {model}.",
        }
    return {
        "ok": True,
        "stopping": True,
        "message": f"Stop requested for {provider} model: {model}.",
    }


def _safe_free_memory_bytes() -> Optional[int]:
    if comfy_model_management is None:
        return None
    try:
        device = comfy_model_management.get_torch_device()
        return int(comfy_model_management.get_free_memory(device))
    except Exception:
        return None


def _loaded_comfy_model_count() -> Optional[int]:
    if comfy_model_management is None:
        return None
    try:
        return len(comfy_model_management.loaded_models())
    except Exception:
        return None


def _free_comfy_vram_for_local_llm() -> Dict[str, Any]:
    info: Dict[str, Any] = {
        "available": comfy_model_management is not None,
        "before_free_bytes": _safe_free_memory_bytes(),
        "before_loaded_models": _loaded_comfy_model_count(),
        "after_free_bytes": None,
        "after_loaded_models": None,
        "settle_seconds": COMFY_VRAM_FREE_SETTLE_SECONDS,
    }
    if comfy_model_management is None:
        info["reason"] = "ComfyUI model management is not available in this runtime."
        return info
    try:
        comfy_model_management.unload_all_models()
        comfy_model_management.soft_empty_cache(force=True)
        time.sleep(COMFY_VRAM_FREE_SETTLE_SECONDS)
        comfy_model_management.soft_empty_cache(force=True)
        info["after_free_bytes"] = _safe_free_memory_bytes()
        info["after_loaded_models"] = _loaded_comfy_model_count()
    except Exception as exc:
        info["error"] = str(exc)
        logging.warning("DENO Local LLM could not free ComfyUI VRAM before LLM call: %s", exc)
    return info


def _prepare_comfy_vram_before_llm(
    provider: str,
    server_url: str,
    model: str,
    model_memory: str,
    keep_minutes: int,
    comfy_vram_policy: str,
    node_id: str,
) -> Dict[str, Any]:
    policy = _normalize_comfy_vram_policy(comfy_vram_policy)
    key = _llm_state_key(provider, server_url, model)
    if policy == COMFY_VRAM_NEVER:
        return {"policy": policy, "action": "skipped", "reason": "disabled"}
    if policy == COMFY_VRAM_AUTO and _is_local_llm_marked_warm(key):
        return {"policy": policy, "action": "skipped", "reason": "local LLM is already marked loaded"}
    if policy == COMFY_VRAM_AUTO and _is_provider_model_loaded(provider, server_url, model):
        _mark_local_llm_warm(provider, server_url, model, model_memory, keep_minutes)
        return {"policy": policy, "action": "skipped", "reason": "local LLM is already loaded by provider"}

    _send_progress({
        "node_id": node_id,
        "status": "freeing ComfyUI VRAM",
        "provider": provider,
        "model": model,
        "index": 0,
        "total": 0,
        "answer": "",
        "thinking": "ComfyUI diffusion models are being unloaded before the local LLM request.",
    })
    info = _free_comfy_vram_for_local_llm()
    info["policy"] = policy
    info["action"] = "freed" if info.get("available") and not info.get("error") else "attempted"
    return info


def _split_thinking_tags(answer: str, thinking: str) -> Tuple[str, str]:
    answer = str(answer or "")
    thinking_parts = [str(thinking or "").strip()] if str(thinking or "").strip() else []
    extracted = [match.group(1).strip() for match in THINK_TAG_RE.finditer(answer or "")]
    if extracted:
        answer = THINK_TAG_RE.sub("", answer or "").strip()
        thinking_parts.extend(part for part in extracted if str(part or "").strip())
    dangling_close = re.search(r"</(?:think|thinking)>", answer or "", flags=re.IGNORECASE)
    if dangling_close:
        before = answer[: dangling_close.start()].strip()
        after = answer[dangling_close.end() :].strip()
        before = re.sub(r"<(?:think|thinking)>", "", before, flags=re.IGNORECASE).strip()
        if before:
            thinking_parts.append(before)
        answer = after
    answer = re.sub(r"</?(?:think|thinking)>", "", answer or "", flags=re.IGNORECASE).strip()
    thinking = "\n".join(part for part in thinking_parts if str(part or "").strip()).strip()
    return answer or "", thinking or ""


def _requires_final_prompt_block(system_prompt: str) -> bool:
    prompt = str(system_prompt or "").lower()
    return (
        ("<final_prompt>" in prompt and "</final_prompt>" in prompt)
        or ("final_prompt_start" in prompt and "final_prompt_end" in prompt)
        or ("deno_final_prompt" in prompt)
    )


def _is_valid_final_prompt_candidate(candidate: str) -> bool:
    text = str(candidate or "").strip()
    if not text:
        return False
    lower = text.lower()
    rejected_fragments = (
        "your final image prompt here",
        "the app will pass only",
        "the app will keep only",
        "return exactly",
        "do not explain",
        "downstream",
    )
    return not any(fragment in lower for fragment in rejected_fragments)


def _extract_final_prompt_block(answer: str, require: bool = False) -> str:
    text = answer or ""
    for pattern in (FINAL_PROMPT_LINE_RE, FINAL_PROMPT_TAG_RE, FINAL_PROMPT_MARKER_RE):
        matches = [match.group(1).strip() for match in pattern.finditer(text)]
        matches = [match for match in matches if _is_valid_final_prompt_candidate(match)]
        if matches:
            return matches[-1]

    if require:
        raise RuntimeError(
            "The local model did not return the required Prompt Only final prompt block. "
            "Use a model that follows the Prompt Only preset, or remove the block requirement."
        )
    return text


def _requires_final_prompt_tags(system_prompt: str) -> bool:
    return _requires_final_prompt_block(system_prompt)


def _extract_final_prompt_tags(answer: str, require: bool = False) -> str:
    return _extract_final_prompt_block(answer, require=require)


def _raise_if_thinking_only_result(answer: str, thinking: str) -> None:
    if str(answer or "").strip() or not str(thinking or "").strip():
        return
    raise RuntimeError(
        "The local model returned thinking text but no final result. "
        "Turn Thinking off, or ask the model to write a final answer after thinking."
    )


def _ensure_ollama_model_stays_loaded(
    base: str,
    model: str,
    keep_alive: Any,
    node_id: str,
    index: int,
    total: int,
) -> Dict[str, Any]:
    keep_alive_value = str(keep_alive)
    if keep_alive_value in ("0", "0m", "0s"):
        return {"checked": False, "reason": "unload_requested"}
    was_loaded = _ollama_is_model_loaded(base, model)
    if not was_loaded:
        _send_progress({
            "node_id": node_id,
            "status": "keeping local LLM loaded",
            "provider": PROVIDER_OLLAMA,
            "model": model,
            "index": index,
            "total": total,
            "answer": "",
            "thinking": "Ollama unloaded the model after the request. Reloading it to honor the selected memory setting.",
        })
    try:
        payload = _ollama_keepalive_best_effort(base, model, keep_alive)
    except Exception as exc:
        return {"checked": True, "action": "failed", "error": str(exc)}
    is_loaded = _ollama_is_model_loaded(base, model)
    return {
        "checked": True,
        "action": "refreshed" if was_loaded and is_loaded else "reloaded" if is_loaded else "reload_requested",
        "done_reason": str(payload.get("done_reason") or ""),
    }


def _split_words(value: Any) -> List[str]:
    text = str(_extract_scalar(value, "") or "")
    parts = re.split(r"[,;\n]+", text)
    return [part.strip() for part in parts if part.strip()]


def _extract_first_json_object(text: str) -> Optional[Dict[str, Any]]:
    stripped = str(text or "").strip()
    if not stripped:
        return None
    candidates = [stripped]
    start = stripped.find("{")
    end = stripped.rfind("}")
    if 0 <= start < end:
        candidates.append(stripped[start:end + 1])
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except Exception:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _extract_review_reason(parsed: Optional[Dict[str, Any]], review_text: str) -> str:
    if isinstance(parsed, dict):
        for key in ("reason", "message", "comment", "explanation", "notes"):
            value = parsed.get(key)
            if value:
                return str(value).strip()
    return " ".join(str(review_text or "").strip().split())[:500]


def _friendly_review_reason(raw_reason: str, token: str, passed: bool) -> str:
    reason = str(raw_reason or "").strip()
    token_text = str(token or "").strip()
    if reason and token_text and reason.lower() != token_text.lower():
        return reason
    if passed:
        return "Reviewer marked this result as OK."
    return "Reviewer marked this result as FAIL."


def _word_found(text: str, words: List[str]) -> Optional[str]:
    lowered = text.lower()
    for word in words:
        needle = word.strip()
        if not needle:
            continue
        if re.search(rf"(?<![A-Za-z0-9_]){re.escape(needle.lower())}(?![A-Za-z0-9_])", lowered):
            return needle
    return None


def _judge_review_text(
    review: Any,
    pass_words: Any,
    reject_words: Any,
    unclear_result: str,
) -> Tuple[bool, str, str]:
    review_text = str(_extract_scalar(review, "") or "")
    parsed = _extract_first_json_object(review_text)
    pass_tokens = _split_words(pass_words) or ["OK", "PASS", "APPROVED"]
    reject_tokens = _split_words(reject_words) or ["FAIL", "REJECT", "BAD"]
    reason = _extract_review_reason(parsed, review_text)

    if isinstance(parsed, dict):
        for key in ("verdict", "status", "result", "decision"):
            if key in parsed:
                value = str(parsed.get(key) or "").strip()
                pass_hit = _word_found(value, pass_tokens)
                reject_hit = _word_found(value, reject_tokens)
                if reject_hit:
                    return False, "FAIL", reason or f"Reviewer returned {value}."
                if pass_hit:
                    return True, "OK", reason or f"Reviewer returned {value}."
        for key in ("ok", "pass", "passed", "accepted", "save"):
            if isinstance(parsed.get(key), bool):
                return bool(parsed[key]), "OK" if parsed[key] else "FAIL", reason or f"Reviewer field {key}={parsed[key]}."

    reject_hit = _word_found(review_text, reject_tokens)
    pass_hit = _word_found(review_text, pass_tokens)
    if reject_hit:
        return False, "FAIL", _friendly_review_reason(reason, reject_hit, False)
    if pass_hit:
        return True, "OK", _friendly_review_reason(reason, pass_hit, True)

    should_pass = str(unclear_result or "").strip() == "Pass"
    verdict = "OK" if should_pass else "FAIL"
    return should_pass, verdict, "Reviewer answer was unclear."


def _iter_media_inputs(image: Any) -> Iterable[Any]:
    if image is None:
        return
    if isinstance(image, (list, tuple)):
        for item in image:
            yield from _iter_media_inputs(item)
        return
    image = _extract_media(image)
    if image is None:
        return
    yield image


def _image_array_from_media(media: Any) -> np.ndarray:
    if hasattr(media, "detach"):
        return media.detach().cpu().numpy()
    return np.asarray(media)


def _local_llm_image_resize_size(
    width: int,
    height: int,
    max_side: int = LOCAL_LLM_IMAGE_MAX_SIDE,
    max_pixels: int = LOCAL_LLM_IMAGE_MAX_PIXELS,
) -> Tuple[int, int]:
    width = max(1, int(width))
    height = max(1, int(height))
    max_side = max(1, int(max_side))
    max_pixels = max(1, int(max_pixels))
    scale = 1.0
    longest = max(width, height)
    if longest > max_side:
        scale = min(scale, max_side / float(longest))
    pixels = width * height
    if pixels > max_pixels:
        scale = min(scale, (max_pixels / float(pixels)) ** 0.5)
    if scale >= 1.0:
        return width, height
    return max(1, int(round(width * scale))), max(1, int(round(height * scale)))


def _image_attachment_from_array(
    arr: np.ndarray,
    max_side: int = LOCAL_LLM_IMAGE_MAX_SIDE,
    max_pixels: int = LOCAL_LLM_IMAGE_MAX_PIXELS,
) -> Dict[str, Any]:
    if arr.ndim != 3:
        raise RuntimeError("Image input must be an IMAGE tensor shaped like HxWxC or BxHxWxC.")
    if arr.shape[-1] > 3:
        arr = arr[..., :3]
    if arr.shape[-1] == 1:
        arr = np.repeat(arr, 3, axis=-1)

    if arr.dtype != np.uint8:
        if float(np.nanmax(arr)) <= 1.5:
            arr = arr * 255.0
        arr = np.nan_to_num(arr, nan=0.0, posinf=255.0, neginf=0.0)
        arr = np.clip(arr, 0, 255).astype(np.uint8)

    pil = Image.fromarray(arr, "RGB")
    original_width, original_height = pil.size
    target_width, target_height = _local_llm_image_resize_size(
        original_width,
        original_height,
        max_side=max_side,
        max_pixels=max_pixels,
    )
    if (target_width, target_height) != (original_width, original_height):
        pil = pil.resize((target_width, target_height), Image.Resampling.LANCZOS)
    buffer = BytesIO()
    pil.save(buffer, format="JPEG", quality=LOCAL_LLM_IMAGE_JPEG_QUALITY)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return {
        "base64": encoded,
        "data_url": f"data:image/jpeg;base64,{encoded}",
        "mime": "image/jpeg",
        "width": original_width,
        "height": original_height,
        "sent_width": pil.size[0],
        "sent_height": pil.size[1],
    }


def _prepare_image_attachments(
    image: Any,
    max_side: int = LOCAL_LLM_IMAGE_MAX_SIDE,
    max_pixels: int = LOCAL_LLM_IMAGE_MAX_PIXELS,
) -> List[Dict[str, Any]]:
    attachments: List[Dict[str, Any]] = []
    for media in _iter_media_inputs(image):
        arr = _image_array_from_media(media)
        if arr.ndim == 4:
            for index in range(int(arr.shape[0])):
                attachments.append(
                    _image_attachment_from_array(arr[index], max_side=max_side, max_pixels=max_pixels)
                )
        else:
            attachments.append(_image_attachment_from_array(arr, max_side=max_side, max_pixels=max_pixels))
    return attachments


def _prepare_image_attachment(
    image: Any,
    max_side: int = LOCAL_LLM_IMAGE_MAX_SIDE,
    max_pixels: int = LOCAL_LLM_IMAGE_MAX_PIXELS,
) -> Optional[Dict[str, Any]]:
    attachments = _prepare_image_attachments(image, max_side=max_side, max_pixels=max_pixels)
    return attachments[0] if attachments else None


def _image_attachment_metadata(attachments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {
            "width": item["width"],
            "height": item["height"],
            "sent_width": item["sent_width"],
            "sent_height": item["sent_height"],
        }
        for item in attachments
    ]


def _stable_reviewer_preview_path(unique_id: Any = None) -> Tuple[str, str, str]:
    import folder_paths

    temp_dir = folder_paths.get_temp_directory()
    abs_dir = os.path.join(temp_dir, REVIEWER_PREVIEW_SUBFOLDER)
    os.makedirs(abs_dir, exist_ok=True)
    node_token = "".join(c for c in str(_extract_scalar(unique_id, "node")) if c.isalnum()) or "node"
    filename = f"deno_llm_reviewer_{node_token}.jpg"
    return os.path.join(abs_dir, filename), filename, REVIEWER_PREVIEW_SUBFOLDER


def _stable_reviewer_snapshot_path(unique_id: Any = None) -> Tuple[str, str, str]:
    import folder_paths

    temp_dir = folder_paths.get_temp_directory()
    abs_dir = os.path.join(temp_dir, REVIEWER_PREVIEW_SUBFOLDER)
    os.makedirs(abs_dir, exist_ok=True)
    node_token = "".join(c for c in str(_extract_scalar(unique_id, "node")) if c.isalnum()) or "node"
    filename = f"deno_llm_reviewer_{node_token}.npy"
    return os.path.join(abs_dir, filename), filename, REVIEWER_PREVIEW_SUBFOLDER


def _normalize_image_array_for_snapshot(image: Any) -> Optional[np.ndarray]:
    image = _extract_media(image)
    if image is None:
        return None
    if hasattr(image, "detach"):
        arr = image.detach().cpu().numpy()
    else:
        arr = np.asarray(image)
    if arr.ndim == 3:
        arr = arr[None, ...]
    if arr.ndim != 4 or arr.size == 0:
        return None
    if arr.shape[-1] > 3:
        arr = arr[..., :3]
    if arr.shape[-1] == 1:
        arr = np.repeat(arr, 3, axis=-1)
    arr = np.nan_to_num(arr.astype(np.float32, copy=False), nan=0.0, posinf=1.0, neginf=0.0)
    if float(np.nanmax(arr)) > 1.5:
        arr = arr / 255.0
    return np.clip(arr, 0.0, 1.0).astype(np.float32, copy=False)


def _save_reviewer_snapshot_image(image: Any, unique_id: Any = None) -> Optional[Dict[str, Any]]:
    try:
        arr = _normalize_image_array_for_snapshot(image)
        if arr is None:
            return None
        out_path, filename, subfolder = _stable_reviewer_snapshot_path(unique_id)
        np.save(out_path, arr, allow_pickle=False)
        return {
            "filename": filename,
            "subfolder": subfolder,
            "type": "temp",
            "shape": list(arr.shape),
        }
    except Exception:
        return None


def _load_reviewer_snapshot_image(reviewer_state: Any, unique_id: Any = None):
    state_text = str(_extract_scalar(reviewer_state, "") or "").strip()
    if not state_text:
        return None
    try:
        state = json.loads(state_text)
    except Exception:
        return None
    snapshot = state.get("snapshot_image") if isinstance(state, dict) else None
    if not isinstance(snapshot, dict):
        return None
    filename = os.path.basename(str(snapshot.get("filename") or ""))
    if not filename.endswith(".npy"):
        return None
    subfolder = str(snapshot.get("subfolder") or REVIEWER_PREVIEW_SUBFOLDER)
    if subfolder != REVIEWER_PREVIEW_SUBFOLDER:
        return None
    try:
        import folder_paths
        import torch

        temp_dir = folder_paths.get_temp_directory()
        abs_path = os.path.join(temp_dir, REVIEWER_PREVIEW_SUBFOLDER, filename)
        if not os.path.isfile(abs_path):
            return None
        arr = np.load(abs_path, allow_pickle=False)
        if arr.ndim == 3:
            arr = arr[None, ...]
        if arr.ndim != 4 or arr.shape[-1] not in (1, 3, 4):
            return None
        if arr.shape[-1] == 1:
            arr = np.repeat(arr, 3, axis=-1)
        if arr.shape[-1] > 3:
            arr = arr[..., :3]
        arr = np.nan_to_num(arr.astype(np.float32, copy=False), nan=0.0, posinf=1.0, neginf=0.0)
        arr = np.clip(arr, 0.0, 1.0).copy()
        from_numpy = getattr(torch, "from_numpy", None)
        return from_numpy(arr) if callable(from_numpy) else arr
    except Exception:
        return None


def _save_reviewer_preview_image(
    image: Any,
    unique_id: Any = None,
    max_side: int = 640,
) -> Optional[Dict[str, Any]]:
    image = _extract_media(image)
    if image is None:
        return None
    try:
        if hasattr(image, "detach"):
            arr = image.detach().cpu().numpy()
        else:
            arr = np.asarray(image)

        if arr.ndim == 4:
            if arr.shape[0] < 1:
                return None
            arr = arr[0]
        if arr.ndim != 3 or arr.size == 0:
            return None
        if arr.shape[-1] > 3:
            arr = arr[..., :3]
        if arr.shape[-1] == 1:
            arr = np.repeat(arr, 3, axis=-1)

        if arr.dtype != np.uint8:
            if float(np.nanmax(arr)) <= 1.5:
                arr = arr * 255.0
            arr = np.nan_to_num(arr, nan=0.0, posinf=255.0, neginf=0.0)
            arr = np.clip(arr, 0, 255).astype(np.uint8)

        pil = Image.fromarray(arr, "RGB")
        original_width, original_height = pil.size
        pil.thumbnail((int(max_side), int(max_side)), Image.Resampling.LANCZOS)
        out_path, filename, subfolder = _stable_reviewer_preview_path(unique_id)
        pil.save(out_path, format="JPEG", quality=90)
        return {
            "filename": filename,
            "subfolder": subfolder,
            "type": "temp",
            "width": original_width,
            "height": original_height,
            "preview_width": pil.size[0],
            "preview_height": pil.size[1],
        }
    except Exception:
        return None


def _openai_user_content(prompt: str, images: Optional[List[Dict[str, Any]]]) -> Any:
    if not images:
        return prompt
    parts: List[Dict[str, Any]] = [{"type": "text", "text": prompt}]
    for image in images:
        parts.append({"type": "image_url", "image_url": {"url": image["data_url"]}})
    return parts


def _send_progress(payload: Dict[str, Any]) -> None:
    try:
        instance = getattr(PromptServer, "instance", None)
        sender = getattr(instance, "send_sync", None)
        if sender:
            sender(PROGRESS_EVENT, payload)
    except Exception:
        pass


def _extract_lm_delta(payload: Dict[str, Any]) -> Tuple[str, str]:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return "", ""
    delta = choices[0].get("delta") or {}
    if not isinstance(delta, dict):
        return "", ""
    answer = str(delta.get("content") or "")
    thinking = str(
        delta.get("reasoning")
        or delta.get("reasoning_content")
        or delta.get("thinking")
        or ""
    )
    return answer, thinking


def _extract_lm_non_stream(payload: Dict[str, Any]) -> Tuple[str, str]:
    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        message = choices[0].get("message") or {}
        if isinstance(message, dict):
            return (
                str(message.get("content") or ""),
                str(message.get("reasoning") or message.get("reasoning_content") or ""),
            )
    return "", ""


def _lm_native_input(prompt: str, images: Optional[List[Dict[str, Any]]]) -> Any:
    if not images:
        return prompt
    return [{"type": "text", "content": prompt}] + [
        {"type": "image", "data_url": image["data_url"]}
        for image in images
    ]


def _extract_lm_native_final(payload: Dict[str, Any], include_reasoning: bool) -> Tuple[str, str]:
    result = payload.get("result") if isinstance(payload, dict) else None
    output = result.get("output") if isinstance(result, dict) else None
    if output is None and isinstance(payload, dict):
        output = payload.get("output")
    if not isinstance(output, list):
        return "", ""
    answer_parts: List[str] = []
    thinking_parts: List[str] = []
    for item in output:
        if not isinstance(item, dict):
            continue
        item_type = str(item.get("type") or "")
        content = str(item.get("content") or "")
        if item_type == "message" and content:
            answer_parts.append(content)
        elif item_type == "reasoning" and content and include_reasoning:
            thinking_parts.append(content)
    return "".join(answer_parts).strip(), "".join(thinking_parts).strip()


def _lm_studio_empty_stream_error(message: str) -> str:
    detail = str(message or "").strip()
    lowered = detail.lower()
    if "context length" in lowered or "n_ctx" in lowered or "n_keep" in lowered:
        return (
            "LM Studio rejected the prompt because it is longer than the loaded model context. "
            "Increase the model context length in LM Studio, or shorten the system/prompt text. "
            f"Details: {detail}"
        )
    return (
        "LM Studio ended the response stream without final text. "
        "Check the loaded model, context length, and LM Studio server log. "
        f"Details: {detail}"
    )


def _recover_lm_native_empty_stream(
    native_base: str,
    payload: Dict[str, Any],
    include_reasoning: bool,
) -> Tuple[str, str, Dict[str, Any]]:
    diagnostic_payload = dict(payload)
    diagnostic_payload["stream"] = False
    try:
        diagnostic = _http_json(
            f"{native_base}/api/v1/chat",
            diagnostic_payload,
            method="POST",
            timeout=120.0,
        )
    except RuntimeError as exc:
        raise RuntimeError(_lm_studio_empty_stream_error(str(exc))) from exc

    answer, thought = _extract_lm_native_final(diagnostic, include_reasoning)
    if answer or thought:
        return answer, thought, diagnostic
    raise RuntimeError(_lm_studio_empty_stream_error(json.dumps(diagnostic, ensure_ascii=False)[:800]))


def list_local_llm_models(provider: str, server_url: str) -> List[Dict[str, Any]]:
    provider = _normalize_provider(provider)
    if provider == PROVIDER_OLLAMA:
        base = _normalize_ollama_url(server_url)
        payload = _http_json(f"{base}/api/tags", timeout=10.0)
        models = payload.get("models") or []
        return [
            {
                "id": str(item.get("model") or item.get("name") or ""),
                "label": str(item.get("model") or item.get("name") or ""),
                "loaded": False,
            }
            for item in models
            if item.get("model") or item.get("name")
        ]

    if provider in OPENAI_COMPATIBLE_PROVIDERS:
        _server_root, openai_base = _normalize_openai_compatible_urls(provider, server_url)
        payload = _http_json(f"{openai_base}/models", timeout=10.0)
        models = payload.get("data") or payload.get("models") or []
        result = []
        for item in models:
            if not isinstance(item, dict):
                continue
            model_id = str(item.get("id") or item.get("model") or item.get("name") or "").strip()
            if not model_id:
                continue
            result.append({
                "id": model_id,
                "label": str(item.get("display_name") or item.get("label") or model_id),
                "loaded": bool(item.get("loaded", False)),
            })
        return result

    base = _normalize_lm_native_url(server_url)
    payload = _http_json(f"{base}/api/v1/models", timeout=10.0)
    models = payload.get("models") or []
    result = []
    for item in models:
        if item.get("type") and item.get("type") != "llm":
            continue
        model_id = str(item.get("key") or item.get("id") or "")
        if not model_id:
            continue
        label = str(item.get("display_name") or model_id)
        loaded_instances = item.get("loaded_instances") or []
        capabilities = item.get("capabilities") if isinstance(item, dict) else {}
        reasoning = capabilities.get("reasoning") if isinstance(capabilities, dict) else None
        reasoning_options = []
        if isinstance(reasoning, dict):
            raw_options = reasoning.get("allowed_options") or []
            if isinstance(raw_options, list):
                reasoning_options = [str(option) for option in raw_options if str(option or "").strip()]
        result.append(
            {
                "id": model_id,
                "label": label,
                "loaded": bool(loaded_instances),
                "instance_id": str(loaded_instances[0].get("id")) if loaded_instances else "",
                "variants": [str(value) for value in (item.get("variants") or []) if str(value or "").strip()],
                "reasoning_options": reasoning_options,
            }
        )
    return result


def _lm_studio_reasoning_options(server_url: str, model: str) -> Optional[Set[str]]:
    model = str(model or "").strip()
    if not model:
        return None
    try:
        models = list_local_llm_models(PROVIDER_LM_STUDIO, server_url)
    except Exception:
        return None
    for item in models:
        item_id = str(item.get("id") or "").strip()
        instance_id = str(item.get("instance_id") or "").strip()
        variants = [str(value).strip() for value in (item.get("variants") or [])]
        if model not in {item_id, instance_id, *variants}:
            continue
        options = item.get("reasoning_options")
        if not isinstance(options, list):
            return set()
        return {str(option).strip().lower() for option in options if str(option or "").strip()}
    return None


def list_detected_model_ids(provider: str, server_url: str) -> List[str]:
    """Best-effort provider-specific model choices for ComfyUI's plain combo widget."""
    seen = set()
    choices: List[str] = []
    try:
        models = list_local_llm_models(provider, server_url)
    except Exception:
        models = []
    for item in models:
        model_id = str(item.get("id") or "").strip()
        if model_id and model_id not in seen:
            seen.add(model_id)
            choices.append(model_id)
    return choices or [""]


def _ollama_unload_best_effort(base: str, model: str) -> None:
    _http_json(
        f"{base}/api/generate",
        {"model": model, "prompt": "", "stream": False, "keep_alive": 0},
        method="POST",
        timeout=30.0,
    )


def _ollama_loaded_model_names(base: str) -> List[str]:
    payload = _http_json(f"{base}/api/ps", timeout=10.0)
    models = payload.get("models") or []
    names: List[str] = []
    for item in models:
        if not isinstance(item, dict):
            continue
        for key in ("model", "name"):
            value = str(item.get(key) or "").strip()
            if value and value not in names:
                names.append(value)
    return names


def _ollama_is_model_loaded(base: str, model: str) -> bool:
    model = str(model or "").strip()
    if not model:
        return False
    try:
        return model in _ollama_loaded_model_names(base)
    except Exception:
        return False


def _is_provider_model_loaded(provider: str, server_url: str, model: str) -> bool:
    provider = _normalize_provider(provider)
    model = str(model or "").strip()
    if not model:
        return False
    try:
        if provider == PROVIDER_OLLAMA:
            return _ollama_is_model_loaded(_normalize_ollama_url(server_url), model)
        if provider in OPENAI_COMPATIBLE_PROVIDERS:
            models = list_local_llm_models(provider, server_url)
            return any(item.get("id") == model for item in models)
        models = list_local_llm_models(PROVIDER_LM_STUDIO, _normalize_lm_native_url(server_url))
        return any(item.get("id") == model and item.get("loaded") for item in models)
    except Exception:
        return False


def _ollama_keepalive_best_effort(base: str, model: str, keep_alive: Any) -> Dict[str, Any]:
    payload = _http_json(
        f"{base}/api/chat",
        {"model": model, "messages": [], "stream": False, "keep_alive": keep_alive},
        method="POST",
        timeout=120.0,
    )
    return payload


def _lm_unload_best_effort(native_base: str, model: str) -> None:
    instance_id = model
    try:
        models = list_local_llm_models(PROVIDER_LM_STUDIO, native_base)
        for item in models:
            if item.get("id") == model and item.get("instance_id"):
                instance_id = str(item["instance_id"])
                break
            if item.get("id") == model and not item.get("loaded"):
                return
    except Exception:
        pass
    try:
        _http_json(
            f"{native_base}/api/v1/models/unload",
            {"instance_id": instance_id},
            method="POST",
            timeout=15.0,
        )
    except RuntimeError as exc:
        message = str(exc).lower()
        if "model_not_found" in message or "not loaded" in message:
            return
        raise


def _llama_cpp_unload(server_root: str, model: str) -> None:
    try:
        _http_json(
            f"{server_root}/models/unload",
            {"model": model},
            method="POST",
            timeout=20.0,
        )
    except RuntimeError as exc:
        message = str(exc)
        if "HTTP 404" in message or "HTTP 405" in message:
            raise RuntimeError(
                "This llama.cpp server does not expose /models/unload. "
                "Unload it from the server process or start llama.cpp with a build/configuration that supports model unload."
            ) from exc
        raise


def _vllm_sleep_key(server_root: str, model: str) -> str:
    return _llm_state_key(PROVIDER_VLLM, server_root, model)


def _vllm_sleep(server_root: str, model: str) -> None:
    _http_json(f"{server_root}/sleep?level=1", {}, method="POST", timeout=30.0)
    _SLEEPING_VLLM_KEYS.add(_vllm_sleep_key(server_root, model))


def _vllm_wake_if_needed(server_root: str, model: str) -> Dict[str, Any]:
    key = _vllm_sleep_key(server_root, model)
    if key not in _SLEEPING_VLLM_KEYS:
        return {"action": "none"}
    _http_json(f"{server_root}/wake_up", {}, method="POST", timeout=60.0)
    _SLEEPING_VLLM_KEYS.discard(key)
    return {"action": "wake_up"}


def unload_local_llm_model(provider: str, server_url: str, model: str) -> Dict[str, Any]:
    provider = _normalize_provider(provider)
    model = str(model or "").strip()
    if not model:
        raise RuntimeError("Select a local LLM model before unloading.")
    if _looks_like_shifted_model_value(model):
        raise RuntimeError(_shifted_model_error("unloading", model))
    if provider == PROVIDER_OLLAMA:
        base = _normalize_ollama_url(server_url)
        if _is_local_llm_active(provider, base, model):
            return _busy_unload_response(provider, model)
        _ollama_unload_best_effort(base, model)
        _clear_local_llm_warm(provider, base, model)
        return {"ok": True, "message": f"Unloaded Ollama model: {model}"}
    if provider == PROVIDER_LM_STUDIO:
        native_base = _normalize_lm_native_url(server_url)
        openai_base = _normalize_lm_openai_url(server_url)
        if (
            _is_local_llm_active(provider, native_base, model)
            or _is_local_llm_active(provider, openai_base, model)
        ):
            return _busy_unload_response(provider, model)
        _lm_unload_best_effort(native_base, model)
        _clear_local_llm_warm(provider, native_base, model)
        _clear_local_llm_warm(provider, openai_base, model)
        return {"ok": True, "message": f"Unloaded LM Studio model: {model}"}

    if provider == PROVIDER_LLAMA_CPP:
        server_root, openai_base = _normalize_openai_compatible_urls(provider, server_url)
        if (
            _is_local_llm_active(provider, server_root, model)
            or _is_local_llm_active(provider, openai_base, model)
        ):
            return _busy_unload_response(provider, model)
        _llama_cpp_unload(server_root, model)
        _clear_local_llm_warm(provider, server_root, model)
        _clear_local_llm_warm(provider, openai_base, model)
        return {"ok": True, "message": f"Requested llama.cpp unload for model: {model}"}

    if provider == PROVIDER_VLLM:
        server_root, openai_base = _normalize_openai_compatible_urls(provider, server_url)
        if (
            _is_local_llm_active(provider, server_root, model)
            or _is_local_llm_active(provider, openai_base, model)
        ):
            return _busy_unload_response(provider, model)
        try:
            _vllm_sleep(server_root, model)
        except RuntimeError as exc:
            raise RuntimeError(
                "vLLM sleep/unload requires the server to run with VLLM_SERVER_DEV_MODE=1 "
                "and --enable-sleep-mode. Details: "
                + str(exc)
            ) from exc
        _clear_local_llm_warm(provider, server_root, model)
        _clear_local_llm_warm(provider, openai_base, model)
        return {"ok": True, "message": f"Put vLLM model to sleep: {model}"}

    if provider == PROVIDER_CUSTOM:
        _normalize_openai_compatible_urls(provider, server_url)
        return {
            "ok": False,
            "message": (
                "Custom local OpenAI-compatible servers do not share a standard unload API. "
                "Use the server's own console or management endpoint to unload the model."
            ),
            "manual_unavailable": True,
        }

    raise RuntimeError("Provider must be Ollama, LM Studio, llama.cpp, vLLM, or Custom.")


async def _handle_list_models(request):
    try:
        payload = await request.json()
        provider = payload.get("provider", PROVIDER_OLLAMA)
        server_url = payload.get("server_url", "")
        models = list_local_llm_models(provider, server_url)
        return _json_response({"models": models})
    except Exception as exc:
        return _json_response({"models": [], "error": str(exc)}, status=400)


async def _handle_unload_model(request):
    try:
        payload = await request.json()
        provider = payload.get("provider", PROVIDER_OLLAMA)
        server_url = payload.get("server_url", "")
        model = payload.get("model", "")
        result = unload_local_llm_model(provider, server_url, model)
        status = 200 if result.get("ok") else 409
        return _json_response(result, status=status)
    except Exception as exc:
        return _json_response({"ok": False, "error": str(exc)}, status=400)


async def _handle_stop_model(request):
    try:
        payload = await request.json()
        provider = payload.get("provider", PROVIDER_OLLAMA)
        server_url = payload.get("server_url", "")
        model = payload.get("model", "")
        result = stop_local_llm_generation(provider, server_url, model)
        status = 200 if result.get("ok") else 409
        return _json_response(result, status=status)
    except Exception as exc:
        return _json_response({"ok": False, "error": str(exc)}, status=400)


if PromptServer is not None:
    PromptServer.instance.routes.post("/deno/local_llm/models")(_handle_list_models)
    PromptServer.instance.routes.post("/deno/local_llm/stop")(_handle_stop_model)
    PromptServer.instance.routes.post("/deno/local_llm/unload")(_handle_unload_model)


class DenoLocalLLMRefiner:
    DESCRIPTION = (
        "Call a local Ollama, LM Studio, llama.cpp, vLLM, or Custom model from ComfyUI and help rewrite or review prompt text.\n\n"
        "An optional IMAGE input can be attached to the local model call. "
        "Use a vision-capable local model for image review.\n\n"
        "Designed for prompt-batcher workflows: use the in-node Prompt field or connect STRING into Prompt, "
        "and this node processes the whole prompt batch in one execution so the local LLM can stay "
        "loaded until the batch is complete.\n\n"
        "Only localhost / 127.0.0.1 servers are allowed."
    )

    @classmethod
    def INPUT_TYPES(cls):
        ollama_model_choices = list_detected_model_ids(PROVIDER_OLLAMA, OLLAMA_DEFAULT_SERVER)
        lm_studio_model_choices = list_detected_model_ids(PROVIDER_LM_STUDIO, LM_STUDIO_DEFAULT_SERVER)
        return {
            "required": {
                "provider": (PROVIDERS, {"default": PROVIDER_OLLAMA}),
                "ollama_model": (ollama_model_choices, {"default": ollama_model_choices[0]}),
                "lm_studio_model": (lm_studio_model_choices, {"default": lm_studio_model_choices[0]}),
                "custom_server_url": (
                    "STRING",
                    {
                        "default": LEGACY_CUSTOM_SERVER_DEFAULT,
                    },
                ),
                "custom_model": ("STRING", {"default": ""}),
                "system_prompt": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                    },
                ),
                "thinking": ("BOOLEAN", {"default": False}),
                "seed": ("INT", {"default": 1, "min": 0, "max": 0xFFFFFFFF, "step": 1}),
                "seed_mode": (SEED_MODE_OPTIONS, {"default": SEED_MODE_FIXED}),
                "model_memory": (MODEL_MEMORY_OPTIONS, {"default": MEMORY_UNLOAD_AFTER_RUN}),
                "keep_minutes": ("INT", {"default": 5, "min": 1, "max": 240, "step": 1}),
                "comfy_vram_policy": (COMFY_VRAM_POLICY_OPTIONS, {"default": COMFY_VRAM_AUTO}),
                "prompt": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                    },
                ),
            },
            "optional": {
                "image": ("IMAGE",),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    INPUT_IS_LIST = True
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("result",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "refine"
    CATEGORY = "Deno/LLM"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return _local_llm_cache_key(kwargs)

    @classmethod
    def VALIDATE_INPUTS(
        cls,
        provider=None,
        ollama_model=None,
        lm_studio_model=None,
        custom_server_url=None,
        custom_model=None,
        seed_mode=None,
        model_memory=None,
        comfy_vram_policy=None,
    ):
        raw_provider_value = str(_extract_scalar(provider, PROVIDER_OLLAMA) or "").strip()
        if raw_provider_value not in PROVIDERS and raw_provider_value != LEGACY_PROVIDER_CUSTOM:
            return "Provider must be Ollama, LM Studio, llama.cpp, vLLM, or Custom."
        provider_value = _normalize_provider(raw_provider_value)
        for result in (
            validate_combo_choice("seed_mode", seed_mode, SEED_MODE_OPTIONS, aliases={"random": SEED_MODE_RANDOMIZE}),
            validate_combo_choice("model_memory", model_memory, MODEL_MEMORY_OPTIONS, aliases=MODEL_MEMORY_ALIASES),
            validate_combo_choice(
                "comfy_vram_policy",
                comfy_vram_policy,
                COMFY_VRAM_POLICY_OPTIONS,
                aliases=COMFY_VRAM_POLICY_ALIASES,
            ),
        ):
            if result is not True:
                return result
        ollama_value = str(_extract_scalar(ollama_model, "") or "").strip()
        lm_studio_value = str(_extract_scalar(lm_studio_model, "") or "").strip()
        custom_model_value = str(_extract_scalar(custom_model, "") or "").strip()
        custom_server_value = str(_extract_scalar(custom_server_url, "") or "").strip()

        if provider_value == PROVIDER_OLLAMA and _is_missing_saved_model_display(ollama_value):
            return _missing_saved_model_error(PROVIDER_OLLAMA, ollama_value)
        if provider_value == PROVIDER_LM_STUDIO and _is_missing_saved_model_display(lm_studio_value):
            return _missing_saved_model_error(PROVIDER_LM_STUDIO, lm_studio_value)
        if provider_value == PROVIDER_OLLAMA and (not ollama_value or _looks_like_shifted_model_value(ollama_value)):
            return "Ollama Model must be a real model name. Refresh models if the value looks shifted."
        if provider_value == PROVIDER_LM_STUDIO and (not lm_studio_value or _looks_like_shifted_model_value(lm_studio_value)):
            return "LM Studio Model must be a real model name. Refresh models if the value looks shifted."
        if provider_value in OPENAI_COMPATIBLE_PROVIDERS:
            if not custom_model_value or _looks_like_shifted_model_value(custom_model_value):
                return f"{provider_value} Model must be a real local model name."
            try:
                _normalize_openai_compatible_urls(provider_value, custom_server_value)
            except RuntimeError as exc:
                return str(exc)
        return True

    def refine(
        self,
        provider,
        ollama_model,
        lm_studio_model,
        custom_server_url,
        custom_model,
        system_prompt,
        thinking,
        seed,
        seed_mode,
        model_memory,
        keep_minutes,
        comfy_vram_policy=COMFY_VRAM_AUTO,
        prompt="",
        image=None,
        unique_id=None,
    ):
        provider_value = _normalize_provider(str(_extract_scalar(provider, PROVIDER_OLLAMA)))
        ollama_model_value = str(_extract_scalar(ollama_model, "")).strip()
        lm_studio_model_value = str(_extract_scalar(lm_studio_model, "")).strip()
        custom_server_value = str(_extract_scalar(custom_server_url, "")).strip()
        custom_model_value = str(_extract_scalar(custom_model, "")).strip()

        if provider_value == PROVIDER_OLLAMA and _is_missing_saved_model_display(ollama_model_value):
            raise RuntimeError(_missing_saved_model_error(PROVIDER_OLLAMA, ollama_model_value))
        if provider_value == PROVIDER_LM_STUDIO and _is_missing_saved_model_display(lm_studio_model_value):
            raise RuntimeError(_missing_saved_model_error(PROVIDER_LM_STUDIO, lm_studio_model_value))

        # Migration guard for old saved nodes where the removed server_url/model widgets
        # could be restored by widget order before the node is recreated.
        if provider_value == PROVIDER_OLLAMA and _looks_like_url(ollama_model_value) and lm_studio_model_value:
            ollama_model_value = lm_studio_model_value
        if provider_value == PROVIDER_LM_STUDIO and (
            not lm_studio_model_value or _looks_like_url(lm_studio_model_value)
        ) and ollama_model_value and not _looks_like_url(ollama_model_value):
            lm_studio_model_value = ollama_model_value

        if provider_value == PROVIDER_LM_STUDIO:
            server_value = LM_STUDIO_DEFAULT_SERVER
            model_value = lm_studio_model_value
        elif provider_value in OPENAI_COMPATIBLE_PROVIDERS:
            server_value = custom_server_value or _default_openai_compatible_server(provider_value)
            model_value = custom_model_value
        else:
            server_value = OLLAMA_DEFAULT_SERVER
            model_value = ollama_model_value
        system_value = str(_extract_scalar(system_prompt, "") or "")
        thinking_value = _safe_bool(thinking, False)
        seed_value = _safe_int(seed, 1, 0, 0xFFFFFFFF)
        seed_mode_value = _normalize_seed_mode(seed_mode)
        memory_value = _normalize_model_memory(model_memory)
        keep_minutes_value = _safe_int(keep_minutes, 5, 1, 240)
        comfy_vram_policy_value = _normalize_comfy_vram_policy(comfy_vram_policy)
        node_id = str(_extract_scalar(unique_id, "") or "")
        prompts = _flatten_prompts(prompt)
        image_attachments = _prepare_image_attachments(image)

        if not model_value:
            raise RuntimeError("Select or type a local LLM model name before running this node.")
        if provider_value in OPENAI_COMPATIBLE_PROVIDERS:
            if _looks_like_shifted_model_value(model_value):
                raise RuntimeError(f"{provider_value} Model must be a real local model name.")
            _normalize_openai_compatible_urls(provider_value, server_value)
        results: List[str] = []
        thinking_results: List[str] = []
        post_run_unload_warnings: List[str] = []
        total = len(prompts)

        _send_progress({
            "node_id": node_id,
            "status": "running",
            "provider": provider_value,
            "model": model_value,
            "index": 0,
            "total": total,
            "answer": "",
            "thinking": "",
        })

        try:
            local_llm_swap_info = _unload_other_warm_local_llms(
                provider=provider_value,
                server_url=server_value,
                model=model_value,
                node_id=node_id,
            )

            comfy_vram_info = _prepare_comfy_vram_before_llm(
                provider=provider_value,
                server_url=server_value,
                model=model_value,
                model_memory=memory_value,
                keep_minutes=keep_minutes_value,
                comfy_vram_policy=comfy_vram_policy_value,
                node_id=node_id,
            )

            for index, prompt in enumerate(prompts):
                current_seed = _seed_for_index(seed_value, seed_mode_value, index)
                is_last = index == total - 1
                active_key = _mark_local_llm_active(provider_value, server_value, model_value)
                try:
                    answer, thought, raw = self._run_single(
                        provider=provider_value,
                        server_url=server_value,
                        model=model_value,
                        system_prompt=system_value,
                        prompt=prompt,
                        thinking=thinking_value,
                        seed=current_seed,
                        model_memory=memory_value,
                        keep_minutes=keep_minutes_value,
                        image_attachments=image_attachments,
                        is_last=is_last,
                        node_id=node_id,
                        index=index + 1,
                        total=total,
                    )
                finally:
                    _clear_local_llm_active(active_key)
                _mark_local_llm_warm(provider_value, server_value, model_value, memory_value, keep_minutes_value)
                post_run_unload = raw.get("post_run_unload") if isinstance(raw, dict) else None
                post_run_unload_warning = _post_run_unload_warning(provider_value, post_run_unload)
                if post_run_unload_warning:
                    post_run_unload_warnings.append(post_run_unload_warning)
                answer, thought = _split_thinking_tags(answer, thought)
                answer = _extract_final_prompt_block(answer, require=_requires_final_prompt_block(system_value))
                if thinking_value:
                    if not str(thought or "").strip():
                        raise RuntimeError(
                            f"{provider_value} returned a final answer but no Thinking/reasoning content. "
                            "Use a model/server that exposes reasoning output, or turn Thinking off."
                        )
                    _raise_if_thinking_only_result(answer, thought)
                results.append(answer)
                thinking_results.append(thought)
        except Exception as exc:
            _send_progress({
                "node_id": node_id,
                "status": "error",
                "provider": provider_value,
                "model": model_value,
                "index": len(results),
                "total": total,
                "answer": "",
                "thinking": "",
                "error": str(exc),
            })
            raise

        if memory_value == MEMORY_UNLOAD_AFTER_RUN:
            _clear_local_llm_warm(provider_value, server_value, model_value)

        final_thinking = thinking_results[-1] if thinking_results else ""
        if post_run_unload_warnings:
            warning_text = "\n".join(post_run_unload_warnings)
            final_thinking = f"{final_thinking}\n\n{warning_text}".strip() if final_thinking else warning_text
            if thinking_results:
                thinking_results[-1] = final_thinking

        _send_progress({
            "node_id": node_id,
            "status": "done, unload warning" if post_run_unload_warnings else "done",
            "provider": provider_value,
            "model": model_value,
            "index": total,
            "total": total,
            "answer": results[-1] if results else "",
            "thinking": final_thinking,
            "comfy_vram": comfy_vram_info,
            "local_llm_swap": local_llm_swap_info,
            "unload_warning": "\n".join(post_run_unload_warnings),
        })

        return {
            "ui": {
                "text": results,
                "thinking": thinking_results,
            },
            "result": (results,),
        }

    def _run_single(
        self,
        provider: str,
        server_url: str,
        model: str,
        system_prompt: str,
        prompt: str,
        thinking: bool,
        seed: int,
        model_memory: str,
        keep_minutes: int,
        image_attachments: List[Dict[str, Any]],
        is_last: bool,
        node_id: str,
        index: int,
        total: int,
    ) -> Tuple[str, str, Dict[str, Any]]:
        if provider == PROVIDER_LM_STUDIO:
            return self._run_lm_studio(
                server_url,
                model,
                system_prompt,
                prompt,
                thinking,
                seed,
                model_memory,
                keep_minutes,
                image_attachments,
                is_last,
                node_id,
                index,
                total,
            )
        if provider in OPENAI_COMPATIBLE_PROVIDERS:
            return self._run_openai_compatible(
                provider,
                server_url,
                model,
                system_prompt,
                prompt,
                thinking,
                seed,
                model_memory,
                keep_minutes,
                image_attachments,
                is_last,
                node_id,
                index,
                total,
            )
        return self._run_ollama(
            server_url,
            model,
            system_prompt,
            prompt,
            thinking,
            seed,
            model_memory,
            keep_minutes,
            image_attachments,
            is_last,
            node_id,
            index,
            total,
        )

    def _run_ollama(
        self,
        server_url: str,
        model: str,
        system_prompt: str,
        prompt: str,
        thinking: bool,
        seed: int,
        model_memory: str,
        keep_minutes: int,
        image_attachments: List[Dict[str, Any]],
        is_last: bool,
        node_id: str,
        index: int,
        total: int,
    ) -> Tuple[str, str, Dict[str, Any]]:
        base = _normalize_ollama_url(server_url)
        memory_value = _normalize_model_memory(model_memory)
        keep_minutes_value = max(1, int(keep_minutes))
        messages = []
        if system_prompt.strip():
            messages.append({"role": "system", "content": system_prompt})
        user_message: Dict[str, Any] = {"role": "user", "content": prompt}
        if image_attachments:
            user_message["images"] = [attachment["base64"] for attachment in image_attachments]
        messages.append(user_message)

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "think": thinking,
            "options": {"seed": int(seed)},
            "keep_alive": _ollama_keep_alive(memory_value, keep_minutes_value, is_last),
        }
        answer_parts: List[str] = []
        thinking_parts: List[str] = []
        final_meta: Dict[str, Any] = {}
        last_emit = 0.0
        cancel_key = _llm_state_key(PROVIDER_OLLAMA, base, model)

        for chunk in _http_stream_json_lines(f"{base}/api/chat", payload, cancel_key=cancel_key):
            if chunk.get("error"):
                detail = str(chunk.get("error"))
                if _looks_like_model_unavailable_error(detail):
                    raise RuntimeError(_model_unavailable_message(model, detail))
                raise RuntimeError(detail)
            message = chunk.get("message") or {}
            content = str(message.get("content") or "")
            thought = str(message.get("thinking") or "")
            if content:
                answer_parts.append(content)
            if thought:
                thinking_parts.append(thought)
            if chunk.get("done"):
                final_meta = {
                    key: chunk.get(key)
                    for key in (
                        "model",
                        "done_reason",
                        "total_duration",
                        "load_duration",
                        "prompt_eval_count",
                        "eval_count",
                    )
                    if key in chunk
                }
            now = time.monotonic()
            if now - last_emit > 0.12 or content or thought:
                last_emit = now
                _send_progress({
                    "node_id": node_id,
                    "status": "running",
                    "provider": PROVIDER_OLLAMA,
                    "model": model,
                    "index": index,
                    "total": total,
                    "answer": "".join(answer_parts),
                    "thinking": "".join(thinking_parts),
                })

        answer = "".join(answer_parts).strip()
        thought = "".join(thinking_parts).strip()
        raw = {
            "provider": PROVIDER_OLLAMA,
            "model": model,
            "seed": seed,
            "model_memory": memory_value,
            "keep_minutes": keep_minutes_value,
            "keep_alive": payload["keep_alive"],
            "meta": final_meta,
        }
        raw["post_keepalive"] = _ensure_ollama_model_stays_loaded(
            base=base,
            model=model,
            keep_alive=payload["keep_alive"],
            node_id=node_id,
            index=index,
            total=total,
        )
        if image_attachments:
            raw["images"] = _image_attachment_metadata(image_attachments)
            raw["image"] = raw["images"][0]
        return answer, thought, raw

    def _run_openai_compatible(
        self,
        provider: str,
        server_url: str,
        model: str,
        system_prompt: str,
        prompt: str,
        thinking: bool,
        seed: int,
        model_memory: str,
        keep_minutes: int,
        image_attachments: List[Dict[str, Any]],
        is_last: bool,
        node_id: str,
        index: int,
        total: int,
    ) -> Tuple[str, str, Dict[str, Any]]:
        provider = _normalize_provider(provider)
        server_root, openai_base = _normalize_openai_compatible_urls(provider, server_url)
        memory_value = _normalize_model_memory(model_memory)
        keep_minutes_value = max(1, int(keep_minutes))
        wake_info: Dict[str, Any] = {"action": "none"}
        if provider == PROVIDER_VLLM:
            wake_info = _vllm_wake_if_needed(server_root, model)

        messages: List[Dict[str, Any]] = []
        if system_prompt.strip():
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": _openai_user_content(prompt, image_attachments)})
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": True,
            "seed": int(seed),
        }
        answer_parts: List[str] = []
        thinking_parts: List[str] = []
        final_meta: Dict[str, Any] = {}
        diagnostic_meta: Optional[Dict[str, Any]] = None
        post_run_unload: Dict[str, Any] = {"action": "none"}
        last_emit = 0.0
        cancel_key = _llm_state_key(provider, openai_base, model)

        def raise_image_hint(exc: RuntimeError) -> None:
            message = str(exc)
            lowered = message.lower()
            if image_attachments and any(marker in lowered for marker in ("image", "vision", "multimodal", "image_url", "content part")):
                raise RuntimeError(
                    f"{provider} did not accept the connected IMAGE input. "
                    "Use a vision-capable local model/server, or disconnect IMAGE. "
                    f"Details: {message}"
                ) from exc
            raise exc

        try:
            try:
                for _event_name, chunk in _http_stream_sse(f"{openai_base}/chat/completions", payload, cancel_key=cancel_key):
                    if chunk.get("error"):
                        error = chunk.get("error")
                        if isinstance(error, dict):
                            detail = str(error.get("message") or error.get("type") or error)
                        else:
                            detail = str(error)
                        if _looks_like_model_unavailable_error(detail):
                            raise RuntimeError(_model_unavailable_message(model, detail))
                        raise RuntimeError(detail)
                    content, thought = _extract_lm_delta(chunk)
                    if content:
                        answer_parts.append(content)
                    if thought:
                        thinking_parts.append(thought)
                    if chunk.get("choices"):
                        final_meta = chunk
                    now = time.monotonic()
                    if now - last_emit > 0.12 or content or thought:
                        last_emit = now
                        _send_progress({
                            "node_id": node_id,
                            "status": "running",
                            "provider": provider,
                            "model": model,
                            "index": index,
                            "total": total,
                            "answer": "".join(answer_parts),
                            "thinking": "".join(thinking_parts),
                        })
            except RuntimeError as exc:
                raise_image_hint(exc)

            answer = "".join(answer_parts).strip()
            thought = "".join(thinking_parts).strip()
            if not answer and not thought:
                diagnostic_payload = dict(payload)
                diagnostic_payload["stream"] = False
                try:
                    diagnostic_meta = _http_json(
                        f"{openai_base}/chat/completions",
                        diagnostic_payload,
                        method="POST",
                        timeout=120.0,
                    )
                except RuntimeError as exc:
                    raise_image_hint(exc)
                answer, thought = _extract_lm_non_stream(diagnostic_meta)
                if not answer and not thought:
                    raise RuntimeError(
                        f"{provider} ended the OpenAI-compatible response without final text. "
                        "Check the selected local model, context length, and server log."
                    )
        finally:
            if _should_unload_after_run(memory_value, is_last):
                post_run_unload = self._openai_compatible_unload_after_run(provider, server_root, model)

        raw = {
            "provider": provider,
            "model": model,
            "seed": seed,
            "model_memory": memory_value,
            "keep_minutes": keep_minutes_value,
            "api": "OpenAI-compatible /v1/chat/completions",
            "server_root": server_root,
            "openai_base": openai_base,
            "thinking_requested": bool(thinking),
            "wake": wake_info,
            "post_run_unload": post_run_unload,
            "meta": final_meta,
        }
        if diagnostic_meta is not None:
            raw["diagnostic"] = diagnostic_meta
        if image_attachments:
            raw["images"] = _image_attachment_metadata(image_attachments)
            raw["image"] = raw["images"][0]
        return answer, thought, raw

    def _openai_compatible_unload_after_run(self, provider: str, server_root: str, model: str) -> Dict[str, Any]:
        try:
            if provider == PROVIDER_LLAMA_CPP:
                _llama_cpp_unload(server_root, model)
                return {"action": "llama.cpp /models/unload"}
            if provider == PROVIDER_VLLM:
                _vllm_sleep(server_root, model)
                return {"action": "vLLM /sleep?level=1"}
            return {
                "action": "unsupported",
                "message": (
                    "Custom local OpenAI-compatible servers do not share a standard unload API. "
                    "Use the server's own console or management endpoint to unload the model."
                ),
            }
        except Exception as exc:
            return {"action": "failed", "message": str(exc)}

    def _run_lm_studio(
        self,
        server_url: str,
        model: str,
        system_prompt: str,
        prompt: str,
        thinking: bool,
        seed: int,
        model_memory: str,
        keep_minutes: int,
        image_attachments: List[Dict[str, Any]],
        is_last: bool,
        node_id: str,
        index: int,
        total: int,
    ) -> Tuple[str, str, Dict[str, Any]]:
        native_base = _normalize_lm_native_url(server_url)
        openai_base = _normalize_lm_openai_url(server_url)
        memory_value = _normalize_model_memory(model_memory)
        keep_minutes_value = max(1, int(keep_minutes))
        payload: Dict[str, Any] = {
            "model": model,
            "stream": True,
            "input": _lm_native_input(prompt, image_attachments),
            "store": False,
        }
        if thinking:
            payload["reasoning"] = "on"
        else:
            reasoning_options = _lm_studio_reasoning_options(native_base, model)
            if reasoning_options and "off" in reasoning_options:
                payload["reasoning"] = "off"
        if system_prompt.strip():
            payload["system_prompt"] = system_prompt

        answer_parts: List[str] = []
        thinking_parts: List[str] = []
        final_meta: Dict[str, Any] = {}
        last_emit = 0.0
        # The active key still uses the OpenAI-style base saved in workflows,
        # while the real request uses LM Studio's native chat endpoint.
        cancel_key = _llm_state_key(PROVIDER_LM_STUDIO, openai_base, model)

        for event_name, chunk in _http_stream_sse(f"{native_base}/api/v1/chat", payload, cancel_key=cancel_key):
            if chunk.get("error"):
                error = chunk.get("error")
                if isinstance(error, dict):
                    detail = str(error.get("message") or error)
                else:
                    detail = str(error)
                if _looks_like_model_unavailable_error(detail):
                    raise RuntimeError(_model_unavailable_message(model, detail))
                raise RuntimeError(detail)
            event_type = str(chunk.get("type") or event_name or "")
            content = str(chunk.get("content") or "") if event_type == "message.delta" else ""
            thought = str(chunk.get("content") or "") if event_type == "reasoning.delta" else ""
            if content:
                answer_parts.append(content)
            if thought and thinking:
                thinking_parts.append(thought)
            if event_type == "chat.end":
                final_meta = chunk
            now = time.monotonic()
            if now - last_emit > 0.12 or content or thought:
                last_emit = now
                _send_progress({
                    "node_id": node_id,
                    "status": "running",
                    "provider": PROVIDER_LM_STUDIO,
                    "model": model,
                    "index": index,
                    "total": total,
                    "answer": "".join(answer_parts),
                    "thinking": "".join(thinking_parts),
                })

        diagnostic_meta: Optional[Dict[str, Any]] = None
        try:
            answer = "".join(answer_parts).strip()
            thought = "".join(thinking_parts).strip()
            if not answer and not thought and final_meta:
                answer, thought = _extract_lm_native_final(final_meta, thinking)
            if not answer and not thought:
                answer, thought, diagnostic_meta = _recover_lm_native_empty_stream(
                    native_base,
                    payload,
                    thinking,
                )
        finally:
            if _should_unload_after_run(memory_value, is_last):
                self._lm_unload_best_effort(native_base, model)

        raw = {
            "provider": PROVIDER_LM_STUDIO,
            "model": model,
            "seed": seed,
            "model_memory": memory_value,
            "keep_minutes": keep_minutes_value,
            "reasoning": payload.get("reasoning", "off"),
            "api": "LM Studio /api/v1/chat",
            "meta": final_meta,
        }
        if diagnostic_meta is not None:
            raw["diagnostic"] = diagnostic_meta
        if image_attachments:
            raw["images"] = _image_attachment_metadata(image_attachments)
            raw["image"] = raw["images"][0]
        return answer, thought, raw

    def _lm_unload_best_effort(self, native_base: str, model: str) -> None:
        try:
            _lm_unload_best_effort(native_base, model)
        except Exception:
            pass


class DenoAIReviewGate:
    DESCRIPTION = (
        "Review generated media before Save nodes and pass only approved results.\n\n"
        "Connect a Local LLM or ComfyUI TextGenerate review result into Review, "
        "then connect IMAGE or AUDIO through this reviewer before Save nodes. "
        "OK/PASS/APPROVE passes through; FAIL/REJECT/BAD quietly blocks downstream "
        "execution. Unclear reviews are blocked."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "review": ("STRING", {"forceInput": True}),
                "review_mode": (["Review", "Pass"], {"default": "Review"}),
                "approve_once": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "image": ("IMAGE",),
                "audio": ("AUDIO",),
                "reviewer_state": ("STRING", {"default": ""}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE", "AUDIO")
    RETURN_NAMES = ("image", "audio")
    SEARCH_ALIASES = [
        "local llm reviewer",
        "reviewer",
        "save reviewer",
        "quality reviewer",
        "ai reviewer",
        "llm reviewer",
        "gemma4 reviewer",
        "media reviewer",
    ]
    FUNCTION = "gate"
    OUTPUT_NODE = True
    CATEGORY = "Deno/LLM"

    @classmethod
    def VALIDATE_INPUTS(cls, review_mode=None):
        return validate_combo_choice(
            "review_mode",
            review_mode,
            ["Review", "Pass"],
            aliases={"Legacy Review": "Review"},
        )

    def gate(
        self,
        review,
        review_mode="Review",
        approve_once=False,
        image=None,
        audio=None,
        pass_words="OK, PASS, APPROVE, APPROVED",
        reject_words="FAIL, REJECT, BAD",
        unclear_result="Reject",
        unique_id=None,
        reviewer_state="",
    ):
        normalized_mode = str(review_mode or "Review").strip()
        if normalized_mode == "Pass" or bool(approve_once):
            if bool(approve_once) and image is None:
                image = _load_reviewer_snapshot_image(reviewer_state, unique_id)
            return self._gate_result(
                passed=True,
                verdict="OK",
                reason="Manual pass." if normalized_mode == "Pass" else "Approved once.",
                image=image,
                audio=audio,
                source="Manual pass" if normalized_mode == "Pass" else "Approve once",
                preview_image=image,
                unique_id=unique_id,
                approve_once_consumed=bool(approve_once),
            )

        passed, verdict, reason = _judge_review_text(
            review=review,
            pass_words=pass_words,
            reject_words=reject_words,
            unclear_result=unclear_result,
        )
        return self._gate_result(
            passed=passed,
            verdict=verdict,
            reason=reason,
            image=image,
            audio=audio,
            source="Text review",
            preview_image=image,
            unique_id=unique_id,
        )

    def _gate_result(
        self,
        *,
        passed: bool,
        verdict: str,
        reason: str,
        image=None,
        audio=None,
        source: str = "Review",
        review_text: str = "",
        passed_count: Optional[int] = None,
        blocked_count: Optional[int] = None,
        preview_image=None,
        unique_id=None,
        approve_once_consumed: bool = False,
    ):
        blocker = ExecutionBlocker(None)
        ui_info: Dict[str, Any] = {
            "passed": bool(passed),
            "verdict": str(verdict or ("OK" if passed else "FAIL")),
            "reason": str(reason or ""),
            "source": str(source or "Review"),
        }
        if review_text:
            ui_info["review"] = str(review_text)
        if passed_count is not None:
            ui_info["passed_count"] = int(passed_count)
        if blocked_count is not None:
            ui_info["blocked_count"] = int(blocked_count)
        if approve_once_consumed:
            ui_info["approve_once_consumed"] = True
        preview_meta = _save_reviewer_preview_image(preview_image if preview_image is not None else image, unique_id)
        if preview_meta:
            ui_info["preview_image"] = preview_meta
        snapshot_meta = _save_reviewer_snapshot_image(preview_image if preview_image is not None else image, unique_id)
        if snapshot_meta:
            ui_info["snapshot_image"] = snapshot_meta

        if passed:
            image_out = image if image is not None else blocker
            audio_out = audio if audio is not None else blocker
            return {
                "ui": {"deno_llm_gate": [ui_info]},
                "result": (image_out, audio_out),
            }

        return {
            "ui": {"deno_llm_gate": [ui_info]},
            "result": (blocker, blocker),
        }


class DenoPromptText:
    DESCRIPTION = (
        "A small multiline STRING output node for connecting system prompts, user prompts, "
        "or prompt templates into DENO prompt-helper nodes."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                    },
                ),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "build"
    CATEGORY = "Deno/Prompt"

    def build(self, text: str):
        return (str(text or ""),)
