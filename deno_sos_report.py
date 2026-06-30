import configparser
import importlib.metadata
import json
import os
import platform
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse


_ROUTE_REGISTERED = False
_PACKAGE_NAMES = (
    "torch",
    "torchvision",
    "xformers",
    "numpy",
    "transformers",
    "diffusers",
    "safetensors",
    "huggingface_hub",
)
_MAX_TEXT_CHARS = 80000
_MAX_LOG_LINES = 120
_MAX_CUSTOM_NODES = 120
_DEFAULT_JSON_SECTION_CHARS = 8000
_WORKFLOW_JSON_SECTION_CHARS = 40000
_LOG_SECTION_CHARS = 8000
_CUSTOM_NODES_SECTION_CHARS = 14000
_GIT_REF_RE = re.compile(r"refs/(?:heads|tags|remotes)/[A-Za-z0-9._/-]+")
_GIT_COMMIT_RE = re.compile(r"[0-9a-fA-F]{7,40}")
_LANGUAGE_TAG_RE = re.compile(r"[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8}){0,5}")
_SENSITIVE_KEY_MARKERS = (
    "apikey",
    "apitoken",
    "token",
    "accesstoken",
    "refreshtoken",
    "authtoken",
    "authorization",
    "credential",
    "clientsecret",
    "secretkey",
    "secret",
    "password",
    "passwd",
    "pwd",
    "privatekey",
    "accesskey",
    "cookie",
    "session",
    "jwt",
)

_ERROR_EVENT_TEXT_KEYS = (
    "received_at",
    "prompt_id",
    "node_id",
    "node_type",
    "exception_type",
    "exception_message",
)

_SECRET_KEY_SEPARATOR = r"(?:[_\-.]|%5f|%2d|%2e)?"
_SECRET_KEY_CHARS = r"A-Z0-9_.\-\[\]"
_SECRET_KEY_SOURCE = (
    rf"API{_SECRET_KEY_SEPARATOR}KEY|API{_SECRET_KEY_SEPARATOR}TOKEN|"
    rf"ACCESS{_SECRET_KEY_SEPARATOR}KEY|ACCESS{_SECRET_KEY_SEPARATOR}TOKEN|"
    rf"REFRESH{_SECRET_KEY_SEPARATOR}TOKEN|AUTHORIZATION|"
    rf"AUTH{_SECRET_KEY_SEPARATOR}TOKEN|AUTH|"
    rf"CLIENT{_SECRET_KEY_SEPARATOR}SECRET|SECRET{_SECRET_KEY_SEPARATOR}KEY|"
    rf"PRIVATE{_SECRET_KEY_SEPARATOR}KEY|CREDENTIAL|COOKIE|"
    rf"SESSION(?:{_SECRET_KEY_SEPARATOR}ID)?|JWT|"
    r"TOKEN(?![A-Z0-9])|SECRET(?![A-Z0-9])|PASSWORD|PASSWD|PWD"
)
_SECRET_KEY_PATTERN = rf"[{_SECRET_KEY_CHARS}]*(?:{_SECRET_KEY_SOURCE})[{_SECRET_KEY_CHARS}]*"
_SENSITIVE_ASSIGNMENT_RE = re.compile(
    rf"(?i)((?<![{_SECRET_KEY_CHARS}])(?:export\s+|set\s+)?"
    rf"(?:\\?[\"'])?{_SECRET_KEY_PATTERN}(?:\\?[\"'])?\s*[:=]\s*)"
)
_NAME_VALUE_FIRST_RE = re.compile(
    r"(?is)"
    r"((?:\\?[\"'])(?:name|key)(?:\\?[\"']\s*:\s*\\?[\"'])"
    r"([^\"'\r\n]+)(?:\\?[\"'])\s*,\s*"
    r"(?:\\?[\"'])value(?:\\?[\"']\s*:\s*\\?[\"']))"
    r"(?:(?:bearer|basic|token)\s+)?(?!\*\*\*)[^\"'\r\n]*(\\?[\"'])"
)
_VALUE_NAME_FIRST_RE = re.compile(
    r"(?is)"
    r"((?:\\?[\"'])value(?:\\?[\"']\s*:\s*\\?[\"']))"
    r"(?:(?:bearer|basic|token)\s+)?(?!\*\*\*)[^\"'\r\n]*(\\?[\"']"
    r"\s*,\s*\\?[\"'](?:name|key)\\?[\"']\s*:\s*\\?[\"']"
    r"([^\"'\r\n]+)\\?[\"'])"
)
_YAMLISH_NAME_VALUE_RE = re.compile(
    r"(?im)^([ \t]*(?:name|key)\s*:\s*([^\r\n]+)\r?\n"
    r"[ \t]*value\s*:\s*)[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*"
)
_YAMLISH_VALUE_NAME_RE = re.compile(
    r"(?im)^([ \t]*value\s*:\s*)[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*"
    r"(\r?\n[ \t]*(?:name|key)\s*:\s*([^\r\n]+))"
)

_SAFE_SYSTEM_STATS_KEYS = (
    "comfyui_version",
    "python_version",
    "pytorch_version",
    "ram_total",
    "ram_free",
    "os",
    "platform",
)

_SAFE_DEVICE_STATS_KEYS = (
    "name",
    "type",
    "index",
    "vram_total",
    "vram_free",
    "torch_vram_total",
    "torch_vram_free",
)

_SENSITIVE_PATTERNS = (
    (
        re.compile(r"\b([a-z][a-z0-9+.-]*://)(?:[^/\s:@]*:)?[^/\s@]*@", re.IGNORECASE),
        r"\1***@",
    ),
    (
        re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"),
        "github_pat_***",
    ),
    (
        re.compile(r"\bgh[a-z]_[A-Za-z0-9_]{20,}\b"),
        "gh*_***",
    ),
    (
        re.compile(r"\bhf_[A-Za-z0-9]{20,}\b"),
        "hf_***",
    ),
    (
        re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b"),
        "sk-***",
    ),
    (
        re.compile(
            r"(?im)(^|[ \t])\b(authorization)\s*[:=]\s*[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*"
        ),
        r"\1\2: ***",
    ),
    (
        re.compile(
            r"(?im)\b(authorization)\s*[:=]\s*(?:(?:bearer|basic)\s+)?[\"'][^\"'\r\n]*[\"']"
        ),
        r"\1: ***",
    ),
    (
        re.compile(
            r"(?i)\b(authorization)\s*:\s*(?:(?:bearer|basic)\s+)?[^\s,\"']+"
        ),
        r"\1: ***",
    ),
    (
        re.compile(
            r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{16,}\b"
        ),
        r"\1 ***",
    ),
    (
        re.compile(
            r"(?is)(\b(?:private\s+key|secret\s+key)\s*[:=]\s*)?-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----.*?-----END [A-Z0-9 ]*PRIVATE KEY-----"
        ),
        r"\1***",
    ),
    (
        re.compile(
            r"(?is)-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----.*?-----END [A-Z0-9 ]*PRIVATE KEY-----"
        ),
        "***",
    ),
    (
        re.compile(
            r"(?im)\b((?:api|access|refresh|auth)\s+(?:key|token)|client\s+secret|secret\s+key|private\s+key|session\s+id|bearer\s+token|api\s+password)\s*[:=]\s*(?:(?!\\n)[^\r\n])*(?:\r?\n[ \t]+[^\r\n]*)*"
        ),
        r"\1: ***",
    ),
    (
        re.compile(
            r"(?im)\b(set-cookie|cookie)\s*:\s*[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*"
        ),
        r"\1: ***",
    ),
    (
        re.compile(
            rf"(?i)(\\?[\"'])({_SECRET_KEY_PATTERN})(\\?[\"']\s*:\s*\\?[\"'])(?:(?:bearer|basic)\s+)?(?!\*\*\*)[^\"'\r\n]*(\\?[\"'])"
        ),
        r"\1\2\3***\4",
    ),
    (
        re.compile(
            rf"(?i)([\[(]\s*\\?[\"']{_SECRET_KEY_PATTERN}\\?[\"']\s*,\s*(?:\\?[\"']))(?:(?:bearer|basic|token)\s+)?(?!\*\*\*)[^\"'\r\n]*(\\?[\"'])"
        ),
        r"\1***\2",
    ),
    (
        re.compile(
            rf"(?i)(\[\s*\\?[\"']{_SECRET_KEY_PATTERN}\\?[\"']\s*\]\s*[:=]\s*)(?:(?:bearer|basic|token)\s+)?(?!\*\*\*)[^\r\n,;&]+"
        ),
        r"\1***",
    ),
    (
        re.compile(
            rf"(?is)((?:\\?[\"'])(?:name|key)(?:\\?[\"']\s*:\s*\\?[\"']){_SECRET_KEY_PATTERN}(?:\\?[\"'])\s*,\s*(?:\\?[\"'])value(?:\\?[\"']\s*:\s*\\?[\"']))(?:(?:bearer|basic|token)\s+)?(?!\*\*\*)[^\"'\r\n]*(\\?[\"'])"
        ),
        r"\1***\2",
    ),
    (
        re.compile(
            rf"(?is)((?:\\?[\"'])value(?:\\?[\"']\s*:\s*\\?[\"']))(?:(?:bearer|basic|token)\s+)?(?!\*\*\*)[^\"'\r\n]*(\\?[\"']\s*,\s*\\?[\"'](?:name|key)\\?[\"']\s*:\s*\\?[\"']{_SECRET_KEY_PATTERN}\\?[\"'])"
        ),
        r"\1***\2",
    ),
    (
        re.compile(
            r"(?im)\b([A-Z0-9_-]*(?:COOKIE|SESSION(?:[_-]?ID)?)[A-Z0-9_-]*)\s*[:=]\s*[^\r\n]*"
        ),
        r"\1=***",
    ),
    (
        re.compile(
            rf"(?im)^(\s*\\?[\"']{_SECRET_KEY_PATTERN}\\?[\"']\s*:\s*)(?![ \t]*\\?[\"'])[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*"
        ),
        r'\1"***"',
    ),
    (
        re.compile(
            rf"(?im)(\\?[\"']{_SECRET_KEY_PATTERN}\\?[\"']\s*:\s*)(?![ \t]*\\?[\"'])[^\r\n]*"
        ),
        r'\1"***"',
    ),
    (
        re.compile(
            rf"(?im)\b((?:export\s+|set\s+)?{_SECRET_KEY_PATTERN}\s*[:=]\s*)(?![ \t]*(?:[\"']|\*\*\*))(?:(?!\s+(?:export\s+|set\s+)?{_SECRET_KEY_PATTERN}\s*[:=]|\s+https?://|\s+(?:bearer|basic)\s+)[^\r\n])*(?:\r?\n[ \t]+[^\r\n]*)*"
        ),
        r"\1***",
    ),
    (
        re.compile(
            rf"(?i)(\\?[\"'])({_SECRET_KEY_PATTERN})(\\?[\"']\s*:\s*)\[[^\r\n\]]*\]"
        ),
        r'\1\2\3"***"',
    ),
    (
        re.compile(
            rf"(?is)(\\?[\"'])({_SECRET_KEY_PATTERN})(\\?[\"']\s*:\s*)(?:\{{[\s\S]*?\}}|\[[\s\S]*?\])"
        ),
        r'\1\2\3"***"',
    ),
    (
        re.compile(
            rf"(?im)\b({_SECRET_KEY_PATTERN})\s*[:=]\s*\[[^\r\n\]]*\]"
        ),
        r"\1=***",
    ),
    (
        re.compile(
            rf"(?i)\b({_SECRET_KEY_PATTERN})\s*[:=]\s*(['\"])(?:(?:bearer|basic)\s+)?(?!\*\*\*)[\s\S]*?\2"
        ),
        r"\1=***",
    ),
    (
        re.compile(
            rf"(?i)([?&][^=&\s]*(?:{_SECRET_KEY_SOURCE})[^=&\s]*=)[^&\s]+"
        ),
        r"\1***",
    ),
    (
        re.compile(
            rf"(?i)(\\?[\"'])({_SECRET_KEY_PATTERN})(\\?[\"']\s*:\s*\\?[\"'])(?:(?:bearer|basic)\s+)?(?!\*\*\*)[^\"'\r\n]*(\\?[\"'])"
        ),
        r"\1\2\3***\4",
    ),
    (
        re.compile(
            r"(?im)\b([A-Z0-9_-]*(?:CLIENT[_-]?SECRET|SECRET[_-]?KEY|PRIVATE[_-]?KEY|PASSWORD|PASSWD|PWD)[A-Z0-9_-]*)\s*:(?!\s*[\"']?\*\*\*)\s*[^\r\n]*"
        ),
        r"\1=***",
    ),
    (
        re.compile(
            rf"(?im)^(\s*(?:export\s+|set\s+)?{_SECRET_KEY_PATTERN}\s*:\s*)(?![ \t]*(?:[\"']|\*\*\*))[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*"
        ),
        r"\1***",
    ),
    (
        re.compile(
            rf"(?i)\b({_SECRET_KEY_PATTERN})\s*[:=]\s*(?:(?:bearer|basic)\s+)?['\"]?(?!\*\*\*)[^'\"\s,;&]+"
        ),
        r"\1=***",
    ),
)


def register_deno_sos_routes():
    global _ROUTE_REGISTERED
    if _ROUTE_REGISTERED:
        return

    try:
        from aiohttp import web
        from server import PromptServer
    except Exception:
        return

    routes = getattr(getattr(PromptServer, "instance", None), "routes", None)
    if routes is None:
        return

    @routes.post("/deno/sos/report")
    async def deno_sos_report(request):
        if not _is_same_origin_request(request):
            return web.json_response({
                "ok": False,
                "report": "",
                "filename": _report_filename(),
                "warnings": ["request origin is not allowed"],
            }, status=403)

        try:
            payload = await request.json()
            if not isinstance(payload, dict):
                payload = {}
        except Exception:
            payload = {}

        try:
            report, warnings = build_sos_prompt(payload)
            return web.json_response({
                "ok": True,
                "report": report,
                "filename": _report_filename(),
                "warnings": [_redact_text(warning) for warning in warnings],
            })
        except Exception as exc:
            fallback = _redact_text(_fallback_prompt(exc))
            return web.json_response({
                "ok": False,
                "report": fallback,
                "filename": _report_filename(),
                "warnings": [_redact_text(f"report builder failed: {type(exc).__name__}: {exc}")],
            })

    _ROUTE_REGISTERED = True


def build_sos_prompt(payload=None):
    payload = payload if isinstance(payload, dict) else {}
    warnings = []
    context = _collect_context(payload, warnings)
    safe_warnings = [_redact_text(warning) for warning in warnings]
    report = _format_diagnostic_report(context, safe_warnings)
    prompt = "\n".join([
        "나는 ComfyUI 초보입니다.",
        "아래는 내 PC에서 읽기 전용 진단 도구가 만든 현재 상태입니다.",
        "",
        "목표:",
        "- 원인을 1~3개로 좁혀주세요.",
        "- Windows PowerShell 기준으로 설명해주세요.",
        "- 명령어가 필요하면 아래의 실제 python.exe 경로를 그대로 사용해주세요.",
        "- 패키지 설치, 저장소 업데이트, 삭제, 초기화, 재설치 전에는 위험도를 먼저 설명해주세요.",
        "- <내 경로로 바꾸세요> 같은 표현은 쓰지 말고, 바로 복사 가능한 형태로 써주세요.",
        "- 답변 언어는 사용자가 별도로 요청한 언어 또는 이 LLM 계정/앱의 선호 응답 언어를 우선 사용해주세요.",
        "- 별도 언어 요청이나 선호 설정을 알 수 없으면 아래 브라우저 언어 정보를 참고해 자연스러운 언어로 답해주세요.",
        "- 에러 메시지, traceback, 경로, 패키지명, 노드명, 명령어는 번역하지 말고 원문 그대로 유지해주세요.",
        "",
        "[진단 리포트 시작]",
        report,
        "[진단 리포트 끝]",
        "",
    ])
    return _limit_text(_redact_text(prompt), _MAX_TEXT_CHARS), safe_warnings


def _collect_context(payload, warnings):
    package_dir = Path(__file__).resolve().parent
    comfy_root = _guess_comfy_root(package_dir)
    custom_nodes_dir = comfy_root / "custom_nodes" if comfy_root else None
    include_workflow = payload.get("include_workflow") is True
    workflow = payload.get("workflow") if include_workflow and isinstance(payload.get("workflow"), dict) else None

    return {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S %z"),
        "frontend": _frontend_snapshot(payload),
        "paths": _path_snapshot(package_dir, comfy_root, custom_nodes_dir),
        "python": _python_snapshot(),
        "os": _os_snapshot(),
        "packages": _package_versions(warnings),
        "comfy": _comfy_snapshot(payload),
        "last_error": _error_event_summary(payload.get("last_error")),
        "history_errors": _history_errors(payload.get("history_errors", payload.get("history"))),
        "logs": _recent_logs(warnings) if include_workflow else "",
        "logs_omitted_for_privacy": not include_workflow,
        "custom_nodes": _custom_nodes_snapshot(custom_nodes_dir, warnings),
        "missing_nodes": _missing_node_candidates(workflow),
        "workflow": workflow if include_workflow else None,
        "include_workflow": include_workflow,
    }


def _format_diagnostic_report(context, warnings):
    lines = []
    lines.append("## 요약")
    lines.append(f"- 생성 시각: {context['generated_at']}")
    lines.append(f"- ComfyUI 주소: {context['frontend'].get('origin') or '(unknown)'}")
    lines.append(f"- 브라우저 언어: {_format_browser_languages(context['frontend'])}")
    lines.append(f"- 워크플로우 JSON 포함: {'예' if context['include_workflow'] else '아니오'}")
    lines.append("")

    lines.append("## 경로")
    for key, value in context["paths"].items():
        lines.append(f"- {key}: {value or '(unknown)'}")
    lines.append("")

    lines.append("## Python 환경")
    python_info = context["python"]
    lines.append(f"- python.exe: {python_info['executable']}")
    lines.append(f"- 판별: {python_info['kind']}")
    lines.append(f"- 판별 근거: {python_info['evidence']}")
    lines.append(f"- Python 버전: {python_info['version']}")
    lines.append(f"- sys.prefix: {python_info['prefix']}")
    lines.append(f"- sys.base_prefix: {python_info['base_prefix']}")
    lines.append(f"- VIRTUAL_ENV: {python_info['virtual_env'] or '(none)'}")
    lines.append(f"- CONDA_PREFIX: {python_info['conda_prefix'] or '(none)'}")
    lines.append("")

    lines.append("## OS")
    for key, value in context["os"].items():
        lines.append(f"- {key}: {value}")
    lines.append("")

    lines.append("## 주요 패키지 버전")
    for name, version in context["packages"].items():
        lines.append(f"- {name}: {version}")
    lines.append("")

    lines.append("## 최근 실행 에러")
    last_error = context.get("last_error") or {}
    if last_error:
        _append_json_block(lines, "frontend execution_error", last_error)
    else:
        lines.append("(프론트엔드가 받은 execution_error 이벤트 없음)")
    lines.append("")

    history_errors = context.get("history_errors") or []
    lines.append("## 최근 history 에러")
    if history_errors:
        _append_json_block(lines, "history errors", history_errors)
    else:
        lines.append("(최근 history 에러를 찾지 못함)")
    lines.append("")

    if context.get("workflow") is not None:
        _append_json_block(lines, "현재 workflow JSON", context["workflow"], _WORKFLOW_JSON_SECTION_CHARS)

    lines.append("## missing node 후보")
    missing_nodes = context.get("missing_nodes") or []
    if missing_nodes:
        for item in missing_nodes:
            lines.append(f"- {item}")
    else:
        lines.append("(현재 워크플로우 기준 missing node 후보 없음 또는 워크플로우 미포함)")
    lines.append("")

    lines.append("## ComfyUI 상태")
    _append_json_block(lines, "system_stats", context["comfy"].get("system_stats"))
    _append_json_block(lines, "queue", context["comfy"].get("queue"))
    _append_json_block(lines, "경로 후보", context["comfy"].get("paths"))

    lines.append("## custom_nodes 목록")
    custom_nodes = context.get("custom_nodes") or []
    if custom_nodes:
        custom_lines = []
        for item in custom_nodes:
            details = []
            if item.get("remote"):
                details.append(f"remote={item['remote']}")
            if item.get("branch"):
                details.append(f"branch={item['branch']}")
            if item.get("commit"):
                details.append(f"commit={item['commit']}")
            suffix = f" ({', '.join(details)})" if details else ""
            custom_lines.append(f"- {item['name']}{suffix}")
        lines.append(_limit_section_text(
            _redact_text("\n".join(custom_lines)),
            _CUSTOM_NODES_SECTION_CHARS,
            "custom_nodes",
        ))
    else:
        lines.append("(custom_nodes 목록을 읽지 못함)")
    lines.append("")

    lines.append("## 최근 로그 마지막 부분")
    if context.get("logs_omitted_for_privacy"):
        lines.append("(워크플로우 포함 OFF: 로그는 프롬프트나 워크플로우 텍스트를 담을 수 있어 제외했습니다.)")
    elif context.get("logs"):
        lines.append("```text")
        lines.append(_limit_section_text(_redact_text(context["logs"]), _LOG_SECTION_CHARS, "recent logs"))
        lines.append("```")
    else:
        lines.append("(ComfyUI logger buffer를 읽지 못했거나 비어 있음)")
    lines.append("")

    if warnings:
        lines.append("## 진단 도구 경고")
        for warning in warnings:
            lines.append(f"- {warning}")
        lines.append("")

    return "\n".join(lines)


def _frontend_snapshot(payload):
    frontend = _safe_mapping(payload.get("frontend"))
    languages = frontend.get("languages")
    if not isinstance(languages, list):
        languages = []
    return {
        "origin": _safe_frontend_origin(frontend.get("origin") or frontend.get("url") or ""),
        "language": _safe_language_tag(frontend.get("language")),
        "languages": [_safe_language_tag(item) for item in languages if _safe_language_tag(item)],
    }


def _safe_frontend_origin(value):
    try:
        parsed = urlparse(str(value or "").strip())
    except Exception:
        return ""
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


def _safe_language_tag(value):
    value = str(value or "").strip()
    if len(value) > 48:
        return ""
    return value if _LANGUAGE_TAG_RE.fullmatch(value) else ""


def _format_browser_languages(frontend):
    primary = str(frontend.get("language") or "").strip()
    languages = [str(item).strip() for item in frontend.get("languages") or [] if str(item).strip()]
    values = []
    if primary:
        values.append(primary)
    for item in languages:
        if item not in values:
            values.append(item)
    return ", ".join(values) if values else "(unknown)"


def _path_snapshot(package_dir, comfy_root, custom_nodes_dir):
    return {
        "DENO package": str(package_dir),
        "ComfyUI root 추정": str(comfy_root) if comfy_root else "",
        "custom_nodes": str(custom_nodes_dir) if custom_nodes_dir else "",
        "현재 작업 폴더": str(Path.cwd()),
    }


def _python_snapshot():
    executable = Path(sys.executable)
    exe_parent = executable.parent
    pth_files = sorted(exe_parent.glob("python*._pth"))
    is_venv = sys.prefix != getattr(sys, "base_prefix", sys.prefix)
    virtual_env = os.environ.get("VIRTUAL_ENV", "")
    conda_prefix = os.environ.get("CONDA_PREFIX", "")
    exe_lower = str(executable).lower()

    evidence = []
    kind = "system/unknown"
    if conda_prefix:
        kind = "conda"
        evidence.append("CONDA_PREFIX is set")
    elif virtual_env or is_venv:
        kind = "venv"
        if virtual_env:
            evidence.append("VIRTUAL_ENV is set")
        if is_venv:
            evidence.append("sys.prefix differs from sys.base_prefix")
    elif "python_embeded" in exe_lower or "python_embedded" in exe_lower or pth_files:
        kind = "embedded/portable"
        if "python_embeded" in exe_lower or "python_embedded" in exe_lower:
            evidence.append("python executable path contains python_embeded/python_embedded")
        if pth_files:
            evidence.append("python*._pth file exists next to python.exe")
    else:
        evidence.append("no venv/conda/embedded marker found")

    return {
        "executable": str(executable),
        "kind": kind,
        "evidence": "; ".join(evidence),
        "version": sys.version.replace("\n", " "),
        "prefix": sys.prefix,
        "base_prefix": getattr(sys, "base_prefix", ""),
        "virtual_env": virtual_env,
        "conda_prefix": conda_prefix,
    }


def _os_snapshot():
    return {
        "platform": platform.platform(),
        "system": platform.system(),
        "release": platform.release(),
        "version": platform.version(),
        "machine": platform.machine(),
    }


def _package_versions(warnings):
    versions = {}
    for name in _PACKAGE_NAMES:
        try:
            versions[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            versions[name] = "(not installed)"
        except Exception as exc:
            versions[name] = "(unknown)"
            warnings.append(f"{name} version read failed: {type(exc).__name__}: {exc}")
    return versions


def _comfy_snapshot(payload):
    paths = {}
    try:
        import folder_paths

        for attr in ("base_path", "models_dir", "input_directory", "output_directory", "temp_directory"):
            value = getattr(folder_paths, attr, None)
            if value:
                paths[attr] = str(value)
    except Exception:
        pass

    return {
        "system_stats": _system_stats_summary(payload.get("system_stats")),
        "queue": _queue_summary(payload.get("queue")),
        "paths": paths,
    }


def _system_stats_summary(value):
    if not isinstance(value, dict):
        return None

    system = value.get("system") if isinstance(value.get("system"), dict) else {}
    devices = value.get("devices") if isinstance(value.get("devices"), list) else []

    safe = {
        "system": {},
        "devices": [],
    }
    for key in _SAFE_SYSTEM_STATS_KEYS:
        stat_value = _safe_stats_value(system.get(key))
        if stat_value is not None:
            safe["system"][key] = stat_value

    for device in devices[:8]:
        if not isinstance(device, dict):
            continue
        safe_device = {}
        for key in _SAFE_DEVICE_STATS_KEYS:
            stat_value = _safe_stats_value(device.get(key))
            if stat_value is not None:
                safe_device[key] = stat_value
        if safe_device:
            safe["devices"].append(safe_device)

    return safe


def _safe_stats_value(value):
    if isinstance(value, str):
        return _redact_text(value)
    if isinstance(value, (int, float, bool)):
        return value
    return None


def _queue_summary(queue):
    if not isinstance(queue, dict):
        return None

    running = queue.get("queue_running") if isinstance(queue.get("queue_running"), list) else []
    pending = queue.get("queue_pending") if isinstance(queue.get("queue_pending"), list) else []
    return {
        "running_count": len(running),
        "pending_count": len(pending),
        "running": [_queue_item_summary(item) for item in running[:3]],
        "pending": [_queue_item_summary(item) for item in pending[:5]],
    }


def _queue_item_summary(item):
    if isinstance(item, (list, tuple)):
        return {
            "number": _safe_queue_scalar(item[0]) if len(item) > 0 else None,
            "prompt_id": str(_safe_queue_scalar(item[1]) or "") if len(item) > 1 else "",
        }
    if isinstance(item, dict):
        return {
            "number": _safe_queue_scalar(item.get("number")),
            "prompt_id": str(_safe_queue_scalar(item.get("prompt_id") or item.get("id")) or ""),
        }
    return {}


def _safe_queue_scalar(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return ""


def _recent_logs(warnings):
    try:
        import app.logger

        entries = list(app.logger.get_logs())
    except Exception as exc:
        warnings.append(f"ComfyUI logger buffer read failed: {type(exc).__name__}: {exc}")
        return ""

    lines = []
    for entry in entries[-_MAX_LOG_LINES:]:
        if isinstance(entry, dict):
            timestamp = str(entry.get("t", "")).strip()
            message = str(entry.get("m", "")).rstrip()
            lines.append(f"{timestamp} {message}".strip())
        else:
            lines.append(str(entry).rstrip())
    return _limit_text("\n".join(lines), 16000)


def _custom_nodes_snapshot(custom_nodes_dir, warnings):
    if not custom_nodes_dir or not custom_nodes_dir.exists():
        warnings.append(f"custom_nodes folder not found: {custom_nodes_dir}")
        return []

    items = []
    try:
        children = sorted((p for p in custom_nodes_dir.iterdir() if p.is_dir()), key=lambda p: p.name.lower())
    except Exception as exc:
        warnings.append(f"custom_nodes folder read failed: {type(exc).__name__}: {exc}")
        return []

    for path in children[:_MAX_CUSTOM_NODES]:
        item = {"name": path.name}
        item.update(_git_snapshot(path))
        items.append(item)
    if len(children) > _MAX_CUSTOM_NODES:
        warnings.append(f"custom_nodes list truncated at {_MAX_CUSTOM_NODES} of {len(children)} folders")
    return items


def _git_snapshot(repo_path):
    git_dir = _resolve_git_dir(repo_path)
    if not git_dir:
        return {}

    head_text = _read_text(git_dir / "HEAD").strip()
    branch = ""
    commit = ""
    if head_text.startswith("ref:"):
        ref = head_text.split(":", 1)[1].strip()
        if _is_allowed_git_ref(ref):
            branch = ref.split("/")[-1]
            ref_path = _safe_child_path(git_dir, ref)
            if ref_path:
                commit = _valid_commit(_read_text(ref_path).strip())
            if not commit:
                commit = _commit_from_packed_refs(git_dir, ref)
    elif _valid_commit(head_text):
        commit = head_text

    remote = _git_origin_url(git_dir)
    return {
        "remote": remote,
        "branch": branch,
        "commit": commit[:12] if commit else "",
    }


def _resolve_git_dir(repo_path):
    dot_git = repo_path / ".git"
    if dot_git.is_dir() and _is_safe_git_dir_candidate(repo_path, dot_git):
        return dot_git
    if dot_git.is_file():
        text = _read_text(dot_git).strip()
        if text.lower().startswith("gitdir:"):
            raw = text.split(":", 1)[1].strip()
            candidate = Path(raw)
            if not candidate.is_absolute():
                candidate = repo_path / candidate
            if _is_safe_git_dir_candidate(repo_path, candidate):
                return candidate
    return None


def _git_origin_url(git_dir):
    config_path = git_dir / "config"
    if not config_path.exists():
        return ""
    parser = configparser.RawConfigParser()
    try:
        parser.read(config_path, encoding="utf-8")
        section = 'remote "origin"'
        if parser.has_section(section):
            return parser.get(section, "url", fallback="")
    except Exception:
        return ""
    return ""


def _commit_from_packed_refs(git_dir, ref):
    if not _is_allowed_git_ref(ref):
        return ""
    packed = _read_text(git_dir / "packed-refs")
    for line in packed.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("^"):
            continue
        parts = line.split(" ", 1)
        if len(parts) == 2 and parts[1] == ref:
            return _valid_commit(parts[0])
    return ""


def _is_allowed_git_ref(ref):
    if not isinstance(ref, str):
        return False
    if "\\" in ref or ".." in ref or ref.startswith(("/", ".")):
        return False
    return _GIT_REF_RE.fullmatch(ref) is not None


def _safe_child_path(base, relative):
    try:
        base_path = Path(base).resolve()
        candidate = (base_path / relative).resolve()
        if candidate == base_path or candidate.is_relative_to(base_path):
            return candidate
    except Exception:
        return None
    return None


def _valid_commit(value):
    value = str(value or "").strip()
    return value if _GIT_COMMIT_RE.fullmatch(value) else ""


def _is_safe_git_dir_candidate(repo_path, git_dir):
    try:
        repo_resolved = Path(repo_path).resolve()
        git_resolved = Path(git_dir).resolve()
    except Exception:
        return False
    if not git_resolved.is_dir() or not (git_resolved / "HEAD").exists():
        return False
    if git_resolved.name == ".git" and git_resolved.parent == repo_resolved:
        return True
    return ".git" in {part.lower() for part in git_resolved.parts}


def _history_errors(history):
    errors = []
    if isinstance(history, list):
        for item in history[-5:]:
            summary = _error_event_summary(item)
            if summary:
                errors.append(summary)
        return errors
    if not isinstance(history, dict):
        return errors
    for prompt_id, item in list(history.items())[-8:]:
        status = item.get("status") if isinstance(item, dict) else None
        if not isinstance(status, dict):
            continue
        messages = status.get("messages") or []
        for message in messages:
            if not isinstance(message, (list, tuple)) or len(message) < 2:
                continue
            event_name, event_data = message[0], message[1]
            if event_name == "execution_error":
                summary = _error_event_summary(event_data, prompt_id=prompt_id)
                if summary:
                    errors.append(summary)
    return errors[-5:]


def _error_event_summary(value, prompt_id=None):
    data = _safe_mapping(value)
    result = {}

    if prompt_id is not None:
        scalar = _safe_event_scalar(prompt_id)
        if scalar:
            result["prompt_id"] = scalar

    for key in _ERROR_EVENT_TEXT_KEYS:
        if key == "prompt_id" and "prompt_id" in result:
            continue
        scalar = _safe_event_scalar(data.get(key))
        if scalar:
            result[key] = scalar

    frontend_origin = _safe_frontend_origin(
        data.get("frontend_origin") or data.get("frontend_url") or ""
    )
    if frontend_origin:
        result["frontend_origin"] = frontend_origin

    traceback = _safe_event_scalar_list(data.get("traceback"))
    if traceback:
        result["traceback"] = traceback

    executed = _safe_event_scalar_list(data.get("executed"))
    if executed:
        result["executed"] = executed

    return result


def _safe_event_scalar(value):
    if isinstance(value, (str, int, float, bool)):
        return _redact_text(str(value))
    return ""


def _safe_event_scalar_list(value, max_items=80):
    if not isinstance(value, list):
        scalar = _safe_event_scalar(value)
        return [scalar] if scalar else []

    result = []
    for item in value[-max_items:]:
        scalar = _safe_event_scalar(item)
        if scalar:
            result.append(scalar)
    return result


def _missing_node_candidates(workflow):
    if not isinstance(workflow, dict):
        return []
    try:
        import nodes

        known = set(getattr(nodes, "NODE_CLASS_MAPPINGS", {}).keys())
    except Exception:
        known = set()
    if not known:
        return []

    missing = []
    for node in workflow.get("nodes") or []:
        if not isinstance(node, dict):
            continue
        node_type = str(node.get("type") or node.get("class_type") or "").strip()
        if node_type and node_type not in known:
            missing.append(f"{node_type} (node id: {node.get('id', '?')})")
    return sorted(set(missing))


def _guess_comfy_root(package_dir):
    try:
        if package_dir.parent.name == "custom_nodes":
            return package_dir.parent.parent
        for parent in package_dir.parents:
            if (parent / "custom_nodes").is_dir() and (parent / "main.py").exists():
                return parent
    except Exception:
        return None
    return None


def _append_json_block(lines, title, value, max_chars=_DEFAULT_JSON_SECTION_CHARS):
    lines.append(f"### {title}")
    if value is None or value == "":
        lines.append("(없음)")
        lines.append("")
        return
    lines.append("```json")
    dumped = json.dumps(_redact_data(value), ensure_ascii=False, indent=2, default=str)
    lines.append(_limit_section_text(_redact_text(dumped), max_chars, title))
    lines.append("```")
    lines.append("")


def _safe_mapping(value):
    return value if isinstance(value, dict) else {}


def _read_text(path):
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""


def _limit_text(text, max_chars):
    text = str(text)
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n\n[... 진단 리포트가 길어서 일부가 잘렸습니다 ...]"


def _limit_section_text(text, max_chars, section_name):
    text = str(text)
    if len(text) <= max_chars:
        return text
    return (
        text[:max_chars]
        + f"\n\n[... {section_name} section truncated at {max_chars} characters ...]"
    )


def _collapse_sensitive_assignment_blocks(text):
    lines = str(text).splitlines(keepends=True)
    output = []
    index = 0

    while index < len(lines):
        line = lines[index]
        assignment = _find_sensitive_block_assignment(line)
        if assignment is None:
            output.append(line)
            index += 1
            continue

        _, rhs_start = assignment
        line_end = "\r\n" if line.endswith("\r\n") else "\n"
        output.append(line[:rhs_start] + "***" + line_end)
        index = _find_sensitive_assignment_block_end(lines, index, rhs_start)

    return "".join(output)


def _find_sensitive_block_assignment(line):
    search_from = 0
    while search_from < len(line):
        match = _SENSITIVE_ASSIGNMENT_RE.search(line, search_from)
        if not match:
            return None

        rhs_start = match.end()
        if line[rhs_start:].lstrip().startswith(("{", "[")):
            return match, rhs_start

        search_from = max(rhs_start, match.start() + 1)

    return None


def _find_sensitive_assignment_block_end(lines, start_index, start_offset):
    depth = 0
    opened = False
    in_quote = ""
    escaped = False

    for index in range(start_index, len(lines)):
        segment = lines[index][start_offset:] if index == start_index else lines[index]
        for char in segment:
            if in_quote:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == in_quote:
                    in_quote = ""
                continue

            if char in ("'", '"'):
                in_quote = char
            elif char in "{[":
                depth += 1
                opened = True
            elif char in "}]":
                depth -= 1

        if opened and depth <= 0:
            return index + 1

    return len(lines) if opened else start_index + 1


def _collapse_sensitive_line_continuations(text):
    lines = str(text).splitlines(keepends=True)
    output = []
    index = 0

    while index < len(lines):
        line = lines[index]
        match = _SENSITIVE_ASSIGNMENT_RE.search(line)
        if not match or not line[match.end():].rstrip("\r\n").rstrip().endswith("\\"):
            output.append(line)
            index += 1
            continue

        line_end = "\r\n" if line.endswith("\r\n") else "\n"
        output.append(line[:match.end()] + "***" + line_end)
        index += 1
        while index < len(lines):
            continuation = lines[index].rstrip("\r\n")
            index += 1
            if not continuation.rstrip().endswith("\\"):
                break

    return "".join(output)


def _redact_text(text):
    redacted = _collapse_sensitive_assignment_blocks(str(text))
    redacted = _collapse_sensitive_line_continuations(redacted)
    redacted = _redact_sensitive_name_value_records(redacted)
    for pattern, replacement in _SENSITIVE_PATTERNS:
        redacted = pattern.sub(replacement, redacted)
    return redacted


def _normalise_key(key):
    return re.sub(r"[^a-z0-9]", "", str(key).lower())


def _is_sensitive_key(key):
    normalised = _normalise_key(key)
    return any(marker in normalised for marker in _SENSITIVE_KEY_MARKERS)


def _is_sensitive_label(value):
    return _is_sensitive_key(str(value).strip().strip("\"'"))


def _redact_sensitive_name_value_records(text):
    def name_first(match):
        if not _is_sensitive_label(match.group(2)):
            return match.group(0)
        return f"{match.group(1)}***{match.group(3)}"

    def value_first(match):
        if not _is_sensitive_label(match.group(3)):
            return match.group(0)
        return f"{match.group(1)}***{match.group(2)}"

    def yamlish_name_first(match):
        if not _is_sensitive_label(match.group(2)):
            return match.group(0)
        return f"{match.group(1)}***"

    def yamlish_value_first(match):
        if not _is_sensitive_label(match.group(3)):
            return match.group(0)
        return f"{match.group(1)}***{match.group(2)}"

    redacted = _NAME_VALUE_FIRST_RE.sub(name_first, text)
    redacted = _VALUE_NAME_FIRST_RE.sub(value_first, redacted)
    redacted = _YAMLISH_NAME_VALUE_RE.sub(yamlish_name_first, redacted)
    return _YAMLISH_VALUE_NAME_RE.sub(yamlish_value_first, redacted)


def _redact_data(value):
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            if _is_sensitive_key(key):
                result[key] = "***"
            else:
                result[key] = _redact_data(item)
        return result
    if isinstance(value, list):
        return [_redact_data(item) for item in value]
    if isinstance(value, tuple):
        return [_redact_data(item) for item in value]
    if isinstance(value, str):
        return _redact_text(value)
    return value


def _is_same_origin_request(request):
    try:
        origin = str(request.headers.get("Origin") or "").strip()
        if not origin:
            return True
        if origin.lower() == "null":
            return False
        origin_host = urlparse(origin).netloc.lower()
        host = str(request.headers.get("Host") or "").lower()
        return bool(origin_host and host and origin_host == host)
    except Exception:
        return False


def _report_filename():
    return f"deno-comfyui-error-help-{time.strftime('%Y%m%d-%H%M%S')}.txt"


def _fallback_prompt(exc):
    return "\n".join([
        "나는 ComfyUI 초보입니다.",
        "DENO 에러 도움말 리포트 생성 중 문제가 생겼습니다.",
        "",
        "[진단 리포트 시작]",
        f"- report builder error: {type(exc).__name__}: {exc}",
        f"- python.exe: {sys.executable}",
        f"- Python: {sys.version.replace(chr(10), ' ')}",
        "[진단 리포트 끝]",
        "",
    ])
