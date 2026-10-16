"""Shared translation helpers for DENO ComfyUI nodes.

This module is intentionally ComfyUI-free so the Translator node and Ideogram
Director can share one implementation and tests can import it directly.
Network access happens only when a caller explicitly invokes translate_text().
"""

from __future__ import annotations

from collections import OrderedDict
import ipaddress
import json
import math
import os
import re
import socket
import ssl
import threading
import time
import urllib.parse

import urllib3


SUNDANESE_CODE = "s" + "u"


LANGS = (
    "en", "ko", "ja", "zh-CN", "zh-TW", "es", "fr", "de", "pt", "ru", "it",
    "af", "sq", "am", "ar", "hy", "az", "eu", "be", "bn", "bs", "bg",
    "ca", "ceb", "ny", "co", "hr", "cs", "da", "nl", "eo", "et", "tl",
    "fi", "fy", "gl", "ka", "el", "gu", "ht", "ha", "haw", "iw", "hi",
    "hmn", "hu", "is", "ig", "id", "ga", "jw", "kn", "kk", "km", "ku",
    "ky", "lo", "la", "lv", "lt", "lb", "mk", "mg", "ms", "ml", "mt",
    "mi", "mr", "mn", "my", "ne", "no", "or", "ps", "fa", "pl", "pa",
    "ro", "sm", "gd", "sr", "st", "sn", "sd", "si", "sk", "sl", "so",
    SUNDANESE_CODE, "sw", "sv", "tg", "ta", "te", "th", "tr", "uk", "ur", "ug",
    "uz", "vi", "cy", "xh", "yi", "yo", "zu",
)

AUTO_DISPLAY = "자동 감지"
ORIGINAL_DISPLAY = "No translation (keep as written)"
DIRECTOR_ENGLISH_DISPLAY = "English"
ORIGINAL_ALIASES = frozenset({
    "",
    "Original",
    "Off",
    "No translation",
    "No translation (keep as written)",
    "Original (as written)",
})

LANG_DISPLAY = {
    "en": "English",
    "ko": "한국어",
    "ja": "日本語",
    "zh-CN": "中文 (简体)",
    "zh-TW": "中文 (繁體)",
    "es": "Español",
    "fr": "Français",
    "de": "Deutsch",
    "pt": "Português",
    "ru": "Русский",
    "it": "Italiano",
    "af": "Afrikaans",
    "sq": "Shqip",
    "am": "አማርኛ",
    "ar": "العربية",
    "hy": "Հայերեն",
    "az": "Azərbaycanca",
    "eu": "Euskara",
    "be": "Беларуская",
    "bn": "বাংলা",
    "bs": "Bosanski",
    "bg": "Български",
    "ca": "Català",
    "ceb": "Cebuano",
    "ny": "Chichewa",
    "co": "Corsu",
    "hr": "Hrvatski",
    "cs": "Čeština",
    "da": "Dansk",
    "nl": "Nederlands",
    "eo": "Esperanto",
    "et": "Eesti",
    "tl": "Filipino",
    "fi": "Suomi",
    "fy": "Frysk",
    "gl": "Galego",
    "ka": "ქართული",
    "el": "Ελληνικά",
    "gu": "ગુજરાતી",
    "ht": "Kreyol ayisyen",
    "ha": "Hausa",
    "haw": "Hawaiian",
    "iw": "עברית",
    "hi": "हिन्दी",
    "hmn": "Hmoob",
    "hu": "Magyar",
    "is": "Íslenska",
    "ig": "Igbo",
    "id": "Bahasa Indonesia",
    "ga": "Gaeilge",
    "jw": "Basa Jawa",
    "kn": "ಕನ್ನಡ",
    "kk": "Қазақша",
    "km": "ខ្មែរ",
    "ku": "Kurdî",
    "ky": "Кыргызча",
    "lo": "ລາວ",
    "la": "Latina",
    "lv": "Latviešu",
    "lt": "Lietuvių",
    "lb": "Lëtzebuergesch",
    "mk": "Македонски",
    "mg": "Malagasy",
    "ms": "Bahasa Melayu",
    "ml": "മലയാളം",
    "mt": "Malti",
    "mi": "Māori",
    "mr": "मराठी",
    "mn": "Монгол",
    "my": "မြန်မာ",
    "ne": "नेपाली",
    "no": "Norsk",
    "or": "ଓଡ଼ିଆ",
    "ps": "پښتو",
    "fa": "فارسی",
    "pl": "Polski",
    "pa": "ਪੰਜਾਬੀ",
    "ro": "Română",
    "sm": "Samoan",
    "gd": "Gàidhlig",
    "sr": "Српски",
    "st": "Sesotho",
    "sn": "Shona",
    "sd": "سنڌي",
    "si": "සිංහල",
    "sk": "Slovenčina",
    "sl": "Slovenščina",
    "so": "Soomaali",
    SUNDANESE_CODE: "Basa Sunda",
    "sw": "Kiswahili",
    "sv": "Svenska",
    "tg": "Тоҷикӣ",
    "ta": "தமிழ்",
    "te": "తెలుగు",
    "th": "ไทย",
    "tr": "Türkçe",
    "uk": "Українська",
    "ur": "اردو",
    "ug": "ئۇيغۇرچە",
    "uz": "Oʻzbekcha",
    "vi": "Tiếng Việt",
    "cy": "Cymraeg",
    "xh": "isiXhosa",
    "yi": "ייִדיש",
    "yo": "Yorùbá",
    "zu": "isiZulu",
}

SOURCE_LANGUAGE_CHOICES = (AUTO_DISPLAY,) + tuple(LANG_DISPLAY[code] for code in LANGS)
TARGET_LANGUAGE_CHOICES = tuple(LANG_DISPLAY[code] for code in LANGS)
DIRECTOR_OUTPUT_CHOICES = (ORIGINAL_DISPLAY, DIRECTOR_ENGLISH_DISPLAY)

TRANSLATION_ENGINE_GOOGLE = "Google"
TRANSLATION_ENGINE_MYMEMORY = "MyMemory"
TRANSLATION_ENGINE_LIBRETRANSLATE = "LibreTranslate"
TRANSLATION_ENGINE_LIBRETRANSLATE_CUSTOM = "LibreTranslate Custom URL"
TRANSLATION_ENGINE_CHOICES = (
    TRANSLATION_ENGINE_GOOGLE,
    TRANSLATION_ENGINE_MYMEMORY,
    TRANSLATION_ENGINE_LIBRETRANSLATE,
    TRANSLATION_ENGINE_LIBRETRANSLATE_CUSTOM,
)
TRANSLATION_ENGINE_DEFAULT = TRANSLATION_ENGINE_GOOGLE
LIBRETRANSLATE_DEFAULT_URL = "https://libretranslate.com"

_DISPLAY_TO_CODE = {display: code for code, display in LANG_DISPLAY.items()}
_CACHE: OrderedDict[tuple[str, str, str, str, str], str] = OrderedDict()
_CACHE_LIMIT = 512
_CACHE_LOCK = threading.Lock()
_last_call = [0.0]
_CALL_LOCK = threading.Lock()
_USER_AGENT = (
    "deno-comfyui-translate/1 "
    "(+https://github.com/Deno2026/comfyui-deno-custom-nodes)"
)
_MAX_TRANSLATION_RESPONSE_BYTES = 2 * 1024 * 1024
_MAX_TRANSLATION_TIMEOUT_SECONDS = 30.0
_TRANSLATION_ALLOWED_ORIGINS_ENV = "DENO_TRANSLATION_ALLOWED_ORIGINS"
_BUILTIN_TRANSLATION_ORIGINS = frozenset({
    ("https", "translate.googleapis.com", 443),
    ("https", "api.mymemory.translated.net", 443),
    ("https", "libretranslate.com", 443),
})


def code_for_display(name: str | None) -> str:
    """Return a gtx language code for a user-facing label or code."""
    value = (name or "").strip()
    if not value:
        return ""
    if value == AUTO_DISPLAY:
        return "auto"
    if value in ORIGINAL_ALIASES:
        return ""
    if value in LANGS or value == "auto":
        return value
    return _DISPLAY_TO_CODE.get(value, value)


def display_for_code(code: str | None) -> str:
    """Return a user-facing autonym for a language code."""
    value = (code or "").strip()
    if value == "auto":
        return AUTO_DISPLAY
    return LANG_DISPLAY.get(value, value)


def normalize_translation_engine(engine: str | None) -> str:
    if engine is not None and not isinstance(engine, str):
        raise ValueError("Translation engine must be one of the listed engine names")
    value = (engine or "").strip()
    lowered = value.lower().replace("_", " ").replace("-", " ")
    aliases = {
        "": TRANSLATION_ENGINE_DEFAULT,
        "google": TRANSLATION_ENGINE_GOOGLE,
        "google translate": TRANSLATION_ENGINE_GOOGLE,
        "gtx": TRANSLATION_ENGINE_GOOGLE,
        "mymemory": TRANSLATION_ENGINE_MYMEMORY,
        "my memory": TRANSLATION_ENGINE_MYMEMORY,
        "libretranslate": TRANSLATION_ENGINE_LIBRETRANSLATE,
        "libre translate": TRANSLATION_ENGINE_LIBRETRANSLATE,
        "libretranslate custom url": TRANSLATION_ENGINE_LIBRETRANSLATE_CUSTOM,
        "libre translate custom url": TRANSLATION_ENGINE_LIBRETRANSLATE_CUSTOM,
        "custom libretranslate": TRANSLATION_ENGINE_LIBRETRANSLATE_CUSTOM,
    }
    if value in TRANSLATION_ENGINE_CHOICES:
        return value
    if lowered in aliases:
        return aliases[lowered]
    raise ValueError("Unknown translation engine; choose one of the listed engines")


def translation_failure_reason(engine: str | None, exc: Exception | None = None) -> str:
    engine = normalize_translation_engine(engine)
    if engine == TRANSLATION_ENGINE_GOOGLE:
        return (
            "Google Translate can be blocked or rate-limited by your network/region; "
            "this is not a DENO node error."
        )
    if engine == TRANSLATION_ENGINE_MYMEMORY:
        return "MyMemory did not respond or rejected the request; try LibreTranslate or Google."
    if engine == TRANSLATION_ENGINE_LIBRETRANSLATE_CUSTOM:
        return "The custom LibreTranslate server did not respond; check the URL or choose another engine."
    return "LibreTranslate did not respond or rejected the request; try another engine or a custom URL."


def short_exception_message(exc: Exception | None, limit: int = 180) -> str:
    if exc is None:
        return ""
    msg = str(exc).strip()
    if not msg:
        msg = type(exc).__name__
    msg = " ".join(msg.split())
    return msg[:limit]


def _cache_get(key):
    with _CACHE_LOCK:
        if key not in _CACHE:
            return None
        value = _CACHE.pop(key)
        _CACHE[key] = value
        return value


def _cache_set(key, value):
    with _CACHE_LOCK:
        _CACHE[key] = value
        while len(_CACHE) > _CACHE_LIMIT:
            _CACHE.popitem(last=False)


def _translation_url_parts(url, *, allow_query=False):
    """Validate syntax without DNS or network access.

    Local self-hosted services are limited to literal loopback addresses and
    localhost (which is pinned to 127.0.0.1 when connecting).
    """
    if not isinstance(url, str):
        raise ValueError("Translation URL must be a string")
    if any(ord(char) < 32 or ord(char) == 127 for char in url) or "\\" in url:
        raise ValueError("Translation URL must not contain control characters or backslashes")
    raw = url.strip()
    if any(char.isspace() for char in raw):
        raise ValueError("Translation URL must not contain whitespace")
    try:
        parsed = urllib.parse.urlsplit(raw)
        host = parsed.hostname or ""
        port = parsed.port
    except ValueError as exc:
        raise ValueError("Translation URL has an invalid host or port") from exc
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or not host:
        raise ValueError("Translation URL must start with http:// or https://")
    if "@" in parsed.netloc or parsed.username is not None or parsed.password is not None:
        raise ValueError("Translation URL must not contain credentials")
    if "#" in raw or (not allow_query and "?" in raw):
        raise ValueError("Translation service URL must not contain a query or fragment")
    if port is not None and not 1 <= port <= 65535:
        raise ValueError("Translation URL has an invalid port")
    try:
        host = host.encode("idna").decode("ascii").lower()
    except UnicodeError as exc:
        raise ValueError("Translation URL has an invalid hostname") from exc
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
        if len(host) > 253 or any(
            not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
            for label in host.rstrip(".").split(".")
        ):
            raise ValueError("Translation URL has an invalid hostname")
    is_local = host == "localhost" or (
        address is not None
        and ((address.version == 4 and address.is_loopback) or str(address) == "::1")
    )
    if parsed.scheme == "http" and not is_local:
        raise ValueError("Remote translation URL must use https://")
    if address is not None and not is_local and not _is_public_translation_address(address):
        raise ValueError("Translation URL must use a public address or loopback")
    authority = "[%s]" % host if ":" in host else host
    if port is not None:
        authority += ":%s" % port
    return parsed._replace(netloc=authority), host, is_local


def _is_public_translation_address(address):
    # IPv6 transition addresses can hide another destination inside the IP.
    if isinstance(address, ipaddress.IPv6Address) and (
        address.ipv4_mapped is not None or address.sixtofour is not None or address.teredo is not None
    ):
        return False
    return (
        address.is_global
        and not address.is_multicast
        and not address.is_reserved
        and str(address) != "168.63.129.16"  # Azure platform/metadata virtual address.
    )


def _translation_origin(parsed):
    return parsed.scheme, parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80)


def _require_custom_translation_origin(parsed):
    """Only the host process can approve custom destinations, never a workflow."""
    allowed = os.environ.get(_TRANSLATION_ALLOWED_ORIGINS_ENV, "")
    for entry in re.split(r"[;,]", allowed):
        if not entry.strip():
            continue
        try:
            approved, _host, _is_local = _translation_url_parts(entry)
            if approved.path not in {"", "/"}:
                raise ValueError("Expected an origin without a path")
        except ValueError as exc:
            raise ValueError("%s contains an invalid origin" % _TRANSLATION_ALLOWED_ORIGINS_ENV) from exc
        if _translation_origin(approved) == _translation_origin(parsed):
            return
    raise ValueError(
        "Custom translation origin is not approved in %s" % _TRANSLATION_ALLOWED_ORIGINS_ENV
    )


def _translation_connection_addresses(host, port):
    if host == "localhost":
        return ("127.0.0.1",)
    try:
        return (str(ipaddress.ip_address(host)),)
    except ValueError:
        pass
    records = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    addresses = []
    for _family, _socktype, _proto, _canonname, sockaddr in records:
        address = ipaddress.ip_address(sockaddr[0])
        if not _is_public_translation_address(address):
            raise ValueError("Translation hostname must resolve only to public addresses")
        if str(address) not in addresses:
            addresses.append(str(address))
    if not addresses:
        raise ValueError("Translation hostname did not resolve to a public address")
    return tuple(addresses)


def _request_translation_json(url, *, timeout=10.0, method="GET", body=None):
    """Use validated, pinned IPs; never replay a request after a response."""
    parsed, host, _is_local = _translation_url_parts(url, allow_query=True)
    if _translation_origin(parsed) not in _BUILTIN_TRANSLATION_ORIGINS:
        _require_custom_translation_origin(parsed)
    try:
        seconds = float(timeout)
    except (TypeError, ValueError) as exc:
        raise ValueError("Translation timeout must be a finite positive number") from exc
    if not math.isfinite(seconds) or seconds <= 0:
        raise ValueError("Translation timeout must be a finite positive number")
    seconds = min(seconds, _MAX_TRANSLATION_TIMEOUT_SECONDS)
    deadline = time.monotonic() + seconds
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    # Validate every DNS answer before transmitting any text. Passing only a
    # numeric address to urllib3 prevents a later hostname lookup/rebinding.
    addresses = _translation_connection_addresses(host, port)
    headers = {
        "Host": parsed.netloc,
        "User-Agent": _USER_AGENT,
        "Accept": "application/json",
        "Accept-Encoding": "identity",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    path = urllib.parse.urlunsplit(("", "", parsed.path or "/", parsed.query, ""))
    pool = None
    response = None
    last_connection_error = None
    try:
        for address in addresses:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise urllib3.exceptions.ConnectTimeoutError(
                    "Translation connection timeout exhausted"
                ) from last_connection_error
            pool_options = {
                "host": address,
                "port": port,
                "timeout": urllib3.Timeout(
                    total=remaining, connect=min(remaining, 5.0), read=remaining,
                ),
                "retries": False,
            }
            if parsed.scheme == "https":
                pool = urllib3.HTTPSConnectionPool(
                    **pool_options,
                    cert_reqs=ssl.CERT_REQUIRED,
                    assert_hostname=host,
                    server_hostname=host,
                )
            else:
                pool = urllib3.HTTPConnectionPool(**pool_options)
            try:
                response = pool.urlopen(
                    method, path, body=body, headers=headers,
                    redirect=False, retries=False, preload_content=False,
                )
            except urllib3.exceptions.ConnectTimeoutError as exc:
                # Includes NewConnectionError: no HTTP request was delivered.
                # TLS, protocol, status and body errors must never try another IP.
                last_connection_error = exc
                pool.close()
                pool = None
                continue
            break
        if response is None:
            raise last_connection_error or RuntimeError("No validated translation address")
        if 300 <= response.status < 400:
            raise RuntimeError("Translation redirects are disabled; use the final service URL")
        if not 200 <= response.status < 300:
            raise RuntimeError("Translation service returned HTTP %s" % response.status)
        if response.headers.get("Content-Encoding", "identity").lower() != "identity":
            raise RuntimeError("Translation service returned an unsupported compressed response")
        length = response.headers.get("Content-Length")
        if length is not None and int(length) > _MAX_TRANSLATION_RESPONSE_BYTES:
            raise RuntimeError("Translation response exceeds the 2 MiB limit")
        data = response.read(_MAX_TRANSLATION_RESPONSE_BYTES + 1, decode_content=False)
        if len(data) > _MAX_TRANSLATION_RESPONSE_BYTES:
            raise RuntimeError("Translation response exceeds the 2 MiB limit")
        return json.loads(data.decode("utf-8"))
    finally:
        if response is not None:
            response.close()
        if pool is not None:
            pool.close()


def _request_gtx(text, src, tgt, timeout=10.0):
    query = urllib.parse.urlencode(
        {
            "client": "gtx",
            "sl": src,
            "tl": tgt,
            "dt": "t",
            "q": text,
        }
    )
    return _request_translation_json(
        "https://translate.googleapis.com/translate_a/single?" + query,
        timeout=timeout,
    )


def _request_mymemory(text, src, tgt, timeout=10.0):
    query = urllib.parse.urlencode(
        {
            "q": text,
            "langpair": "%s|%s" % (src or "auto", tgt),
        }
    )
    data = _request_translation_json(
        "https://api.mymemory.translated.net/get?" + query,
        timeout=timeout,
    )
    response = data.get("responseData") if isinstance(data, dict) else None
    translated = response.get("translatedText") if isinstance(response, dict) else None
    if not isinstance(translated, str) or not translated:
        detail = data.get("responseDetails") if isinstance(data, dict) else ""
        raise RuntimeError("MyMemory returned no translated text: %s" % detail)
    return translated


def _normalize_libretranslate_endpoint(url, require_custom=False):
    if url is not None and not isinstance(url, str):
        raise ValueError("Translation URL must be a string")
    raw = url or ""
    if not raw.strip():
        if require_custom:
            raise ValueError("LibreTranslate Custom URL is empty")
        raw = LIBRETRANSLATE_DEFAULT_URL
    parsed, _host, _is_local = _translation_url_parts(raw)
    if require_custom or _translation_origin(parsed) != ("https", "libretranslate.com", 443):
        _require_custom_translation_origin(parsed)
    path = parsed.path
    if not path.rstrip("/").endswith("/translate"):
        path = path.rstrip("/") + "/translate"
    return urllib.parse.urlunsplit(parsed._replace(path=path))


def _request_libretranslate(text, src, tgt, timeout=10.0, url=None, require_custom=False):
    endpoint = _normalize_libretranslate_endpoint(url, require_custom=require_custom)
    payload = json.dumps(
        {
            "q": text,
            "source": src or "auto",
            "target": tgt,
            "format": "text",
        }
    ).encode("utf-8")
    data = _request_translation_json(
        endpoint,
        body=payload,
        timeout=timeout,
        method="POST",
    )
    translated = data.get("translatedText") if isinstance(data, dict) else None
    if not isinstance(translated, str) or not translated:
        detail = data.get("error") if isinstance(data, dict) else ""
        raise RuntimeError("LibreTranslate returned no translated text: %s" % detail)
    return translated


def _request_translation(text, src, tgt, timeout=10.0, engine=None, libretranslate_url=""):
    engine = normalize_translation_engine(engine)
    if engine == TRANSLATION_ENGINE_MYMEMORY:
        return _request_mymemory(text, src, tgt, timeout=timeout)
    if engine == TRANSLATION_ENGINE_LIBRETRANSLATE:
        return _request_libretranslate(text, src, tgt, timeout=timeout)
    if engine == TRANSLATION_ENGINE_LIBRETRANSLATE_CUSTOM:
        return _request_libretranslate(
            text,
            src,
            tgt,
            timeout=timeout,
            url=libretranslate_url,
            require_custom=True,
        )
    data = _request_gtx(text, src, tgt, timeout=timeout)
    return "".join(seg[0] for seg in (data[0] or []) if seg and seg[0]) or text


def should_skip_translation(text: str, src: str, tgt: str) -> bool:
    if not isinstance(text, str) or not text.strip():
        return True
    src_code = code_for_display(src)
    tgt_code = code_for_display(tgt)
    if not tgt_code:
        return True
    if src_code and src_code != "auto" and src_code == tgt_code:
        return True
    if src_code == "auto" and tgt_code == "en" and all(
        ord(ch) < 128 for ch in _normalize_english_typography_for_detection(text)
    ):
        return True
    return False


def _normalize_english_typography_for_detection(text: str) -> str:
    """Map common smart punctuation to ASCII for language detection only."""
    return str(text).translate(str.maketrans({
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u2026": "...",
        "\u00a0": " ",
    }))


def translate_text(
    text: str,
    src: str,
    tgt: str,
    timeout=10.0,
    engine=None,
    libretranslate_url="",
    attempts=3,
) -> str:
    """Translate one string through the selected online translation endpoint.

    Raises after retries. Callers decide whether to fail or pass the original
    text through unchanged.
    """
    if not isinstance(text, str):
        text = "" if text is None else str(text)
    src_code = code_for_display(src) or "auto"
    tgt_code = code_for_display(tgt)
    engine_name = normalize_translation_engine(engine)
    libretranslate_url = libretranslate_url or ""
    if should_skip_translation(text, src_code, tgt_code):
        return text
    key = (engine_name, libretranslate_url, src_code, tgt_code, text)
    cached = _cache_get(key)
    if cached is not None:
        return cached

    try:
        attempt_count = max(1, min(3, int(attempts)))
    except (TypeError, ValueError):
        attempt_count = 3
    last_exc = None
    for attempt in range(attempt_count):
        # Only serialize the request spacing; network I/O can proceed concurrently.
        with _CALL_LOCK:
            gap = time.monotonic() - _last_call[0]
            if gap < 0.15:
                time.sleep(0.15 - gap)
            _last_call[0] = time.monotonic()
        try:
            translated = _request_translation(
                text,
                src_code,
                tgt_code,
                timeout=timeout,
                engine=engine_name,
                libretranslate_url=libretranslate_url,
            ) or text
            _cache_set(key, translated)
            return translated
        except Exception as exc:
            last_exc = exc
            time.sleep(0.5 * (attempt + 1))
    raise last_exc


def loads_caption(s):
    """Lenient caption parse: raw JSON -> fenced JSON -> first brace span."""
    if not s or not str(s).strip():
        return None
    txt = str(s).strip()
    candidates = [txt]
    match = re.search(r"```(?:json)?\s*(.*?)```", txt, re.DOTALL | re.IGNORECASE)
    if match:
        candidates.append(match.group(1).strip())
    first, last = txt.find("{"), txt.rfind("}")
    if first >= 0 and last > first:
        candidates.append(txt[first:last + 1])
    for candidate in candidates:
        try:
            value = json.loads(candidate)
            if isinstance(value, dict):
                return value
        except (TypeError, ValueError):
            continue
    return None


def translate_caption(obj, src, tgt, opts=None):
    """Translate human-language fields in an Ideogram caption.

    Element ``text`` values are literal words that should be rendered into the
    image, not descriptions. They stay unchanged unless the caller explicitly
    opts into ``translate_text_fields``.

    Returns (translated_dict, changed_field_count, sent_field_count).
    """
    opts = opts or {}
    translate_text_fields = bool(opts.get("translate_text_fields", False))
    engine = normalize_translation_engine(opts.get("engine"))
    libretranslate_url = opts.get("libretranslate_url") or ""
    timeout = opts.get("timeout", 10.0)
    attempts = opts.get("attempts", 3)
    changed = 0
    sent = 0

    def tr(value):
        nonlocal changed, sent
        if not isinstance(value, str) or not value.strip():
            return value
        if should_skip_translation(value, src, tgt):
            return value
        sent += 1
        out = translate_text(
            value,
            src,
            tgt,
            timeout=timeout,
            engine=engine,
            libretranslate_url=libretranslate_url,
            attempts=attempts,
        )
        if out != value:
            changed += 1
        return out

    out = dict(obj or {})
    if isinstance(out.get("high_level_description"), str):
        out["high_level_description"] = tr(out["high_level_description"])

    style = out.get("style_description")
    if isinstance(style, dict):
        style = dict(style)
        for key in ("aesthetics", "lighting", "medium", "photo", "art_style"):
            if isinstance(style.get(key), str):
                style[key] = tr(style[key])
        out["style_description"] = style

    comp = out.get("compositional_deconstruction")
    if isinstance(comp, dict):
        comp = dict(comp)
        if isinstance(comp.get("background"), str):
            comp["background"] = tr(comp["background"])
        elements = comp.get("elements")
        if isinstance(elements, list):
            next_elements = []
            for element in elements:
                if isinstance(element, dict):
                    element = dict(element)
                    if isinstance(element.get("desc"), str):
                        element["desc"] = tr(element["desc"])
                    if translate_text_fields and isinstance(element.get("text"), str):
                        element["text"] = tr(element["text"])
                next_elements.append(element)
            comp["elements"] = next_elements
        out["compositional_deconstruction"] = comp

    return out, changed, sent
