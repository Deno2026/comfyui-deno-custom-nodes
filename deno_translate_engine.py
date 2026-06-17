"""Shared translation helpers for DENO ComfyUI nodes.

This module is intentionally ComfyUI-free so the Translator node and Ideogram
Director can share one implementation and tests can import it directly.
Network access happens only when a caller explicitly invokes translate_text().
"""

from __future__ import annotations

from collections import OrderedDict
import json
import re
import time
import urllib.parse
import urllib.request


LANGS = (
    "en", "ko", "ja", "zh-CN", "zh-TW", "es", "fr", "de", "pt", "ru", "it",
    "af", "sq", "am", "ar", "hy", "az", "eu", "be", "bn", "bs", "bg",
    "ca", "ceb", "ny", "co", "hr", "cs", "da", "nl", "eo", "et", "tl",
    "fi", "fy", "gl", "ka", "el", "gu", "ht", "ha", "haw", "iw", "hi",
    "hmn", "hu", "is", "ig", "id", "ga", "jw", "kn", "kk", "km", "ku",
    "ky", "lo", "la", "lv", "lt", "lb", "mk", "mg", "ms", "ml", "mt",
    "mi", "mr", "mn", "my", "ne", "no", "or", "ps", "fa", "pl", "pa",
    "ro", "sm", "gd", "sr", "st", "sn", "sd", "si", "sk", "sl", "so",
    "su", "sw", "sv", "tg", "ta", "te", "th", "tr", "uk", "ur", "ug",
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
    "su": "Basa Sunda",
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
_last_call = [0.0]
_USER_AGENT = (
    "deno-comfyui-translate/1 "
    "(+https://github.com/Deno2026/comfyui-deno-custom-nodes)"
)
_OPENER = urllib.request.build_opener()


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
    return aliases.get(lowered, TRANSLATION_ENGINE_DEFAULT)


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
    if key not in _CACHE:
        return None
    value = _CACHE.pop(key)
    _CACHE[key] = value
    return value


def _cache_set(key, value):
    _CACHE[key] = value
    while len(_CACHE) > _CACHE_LIMIT:
        _CACHE.popitem(last=False)


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
    req = urllib.request.Request(
        "https://translate.googleapis.com/translate_a/single?" + query,
        headers={"User-Agent": _USER_AGENT},
    )
    with _OPENER.open(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _request_mymemory(text, src, tgt, timeout=10.0):
    query = urllib.parse.urlencode(
        {
            "q": text,
            "langpair": "%s|%s" % (src or "auto", tgt),
        }
    )
    req = urllib.request.Request(
        "https://api.mymemory.translated.net/get?" + query,
        headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
    )
    with _OPENER.open(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    response = data.get("responseData") if isinstance(data, dict) else None
    translated = response.get("translatedText") if isinstance(response, dict) else None
    if not isinstance(translated, str) or not translated:
        detail = data.get("responseDetails") if isinstance(data, dict) else ""
        raise RuntimeError("MyMemory returned no translated text: %s" % detail)
    return translated


def _normalize_libretranslate_endpoint(url, require_custom=False):
    raw = (url or "").strip()
    if not raw:
        if require_custom:
            raise ValueError("LibreTranslate Custom URL is empty")
        raw = LIBRETRANSLATE_DEFAULT_URL
    parsed = urllib.parse.urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("LibreTranslate URL must start with http:// or https://")
    host = (parsed.hostname or "").lower()
    is_local = host in {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme == "http" and not is_local:
        raise ValueError("Remote LibreTranslate Custom URL must use https://")
    if parsed.path.rstrip("/").endswith("/translate"):
        return raw
    return raw.rstrip("/") + "/translate"


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
    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={
            "User-Agent": _USER_AGENT,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with _OPENER.open(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
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
    if src_code == "auto" and tgt_code == "en" and all(ord(ch) < 128 for ch in text):
        return True
    return False


def translate_text(
    text: str,
    src: str,
    tgt: str,
    timeout=10.0,
    engine=None,
    libretranslate_url="",
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
    libretranslate_url = (libretranslate_url or "").strip()
    if should_skip_translation(text, src_code, tgt_code):
        return text
    key = (engine_name, libretranslate_url, src_code, tgt_code, text)
    cached = _cache_get(key)
    if cached is not None:
        return cached

    last_exc = None
    for attempt in range(3):
        gap = time.monotonic() - _last_call[0]
        if gap < 0.15:
            time.sleep(0.15 - gap)
        try:
            _last_call[0] = time.monotonic()
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
            engine=engine,
            libretranslate_url=libretranslate_url,
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
