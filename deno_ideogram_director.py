"""(Deno) Ideogram Director

A closed "edit -> regenerate" loop node for Ideogram 4's structured JSON caption.
Edit the caption (bboxes / descriptions / style) on top of the generated result,
output a valid Ideogram caption to the positive CLIPTextEncode, then regenerate.

Design spec: docs/IDEOGRAM_DIRECTOR_SPEC.md (v2).

The JSON-assembly logic is kept as pure functions (no ComfyUI imports) so it can be
unit-tested standalone (see test_build.py). ComfyUI-coupled parts (the save route)
are guarded behind a try/except import so this module stays importable for static
checks and unit tests outside a running ComfyUI.
"""

import json
import hashlib
import re

try:
    from . import deno_translate_engine as translate_engine
except Exception:  # pragma: no cover - direct import during local tests
    import deno_translate_engine as translate_engine

# ComfyUI is only importable inside a running ComfyUI process. Guard the imports so
# this module stays importable for `python -m py_compile` and the standalone tests.
try:
    import os
    import shutil
    import folder_paths
    from server import PromptServer
    from aiohttp import web
    _HAS_COMFY = True
except Exception:  # pragma: no cover - exercised only outside ComfyUI
    _HAS_COMFY = False

_OUTPUT_LANGUAGE_CHOICES = list(translate_engine.DIRECTOR_OUTPUT_CHOICES)
LEGACY_VIEW_ORIGINAL_DISPLAY = "Original (as written)"
VIEW_LANGUAGE_DEFAULT = translate_engine.DIRECTOR_ENGLISH_DISPLAY
_VIEW_LANGUAGE_CHOICES = list(translate_engine.TARGET_LANGUAGE_CHOICES)
_TRANSLATION_ENGINE_CHOICES = list(translate_engine.TRANSLATION_ENGINE_CHOICES)
PENDING_EVENT = "deno-ideogram-director-pending"
PENDING_MESSAGE = (
    "A new incoming JSON prompt is waiting. Choose Apply and Replace or Keep Current Board "
    "on the Ideogram Director node."
)
INVALID_IMPORT_MESSAGE = (
    "The incoming JSON prompt is not valid JSON. The LLM may have generated the wrong format. "
    "Please regenerate it, or keep the current board and run again."
)


# --------------------------------------------------------------------------- #
# Pure logic (no ComfyUI dependency) — unit-tested by test_build.py            #
# --------------------------------------------------------------------------- #

def _parse_caption_data(s):
    """caption_data (socketless JSON) -> (boxes: list[dict], style_palette: list[str])."""
    if not s:
        return [], []
    try:
        d = json.loads(s)
    except (ValueError, TypeError):
        return [], []
    if not isinstance(d, dict):
        return [], []
    boxes = d.get("boxes")
    boxes = boxes if isinstance(boxes, list) else []
    palette = d.get("stylePalette")
    palette = palette if isinstance(palette, list) else []
    return boxes, palette


def _norm_bbox(b):
    """Normalized {x,y,w,h} (0-1 fractions) -> [ymin, xmin, ymax, xmax] on a 0-1000 grid."""
    def c(v):
        try:
            return max(0, min(1000, round(float(v) * 1000)))
        except (TypeError, ValueError):
            return 0
    x, y = b.get("x", 0.0), b.get("y", 0.0)
    w, h = b.get("w", 0.0), b.get("h", 0.0)
    ymin, xmin = c(y), c(x)
    ymax, xmax = c((y or 0) + (h or 0)), c((x or 0) + (w or 0))
    if ymin > ymax:
        ymin, ymax = ymax, ymin
    if xmin > xmax:
        xmin, xmax = xmax, xmin
    return [ymin, xmin, ymax, xmax]


def _palette(colors, cap):
    """Drop empties, uppercase, cap length. Accepts list (or dict.values from autogrow UI)."""
    if isinstance(colors, dict):
        colors = list(colors.values())
    out = []
    for col in (colors or []):
        if isinstance(col, str) and col.strip():
            out.append(col.strip().upper())
    return out[:cap]


def _caption_to_boxes(cap):
    """Imported caption dict -> editor box list (used for the bbox output when import wins)."""
    cd = (cap or {}).get("compositional_deconstruction") or {}
    boxes = []
    for el in (cd.get("elements") or []):
        if not isinstance(el, dict):
            continue
        box = {
            "type": "text" if el.get("type") == "text" else "obj",
            "text": el.get("text", "") or "",
            "desc": el.get("desc", "") or "",
            "palette": list(el.get("color_palette") or []),
        }
        bb = el.get("bbox")
        if isinstance(bb, (list, tuple)) and len(bb) == 4:
            ymin, xmin, ymax, xmax = bb
            if ymin > ymax:
                ymin, ymax = ymax, ymin
            if xmin > xmax:
                xmin, xmax = xmax, xmin
            box.update(x=xmin / 1000.0, y=ymin / 1000.0,
                       w=(xmax - xmin) / 1000.0, h=(ymax - ymin) / 1000.0)
        else:  # unplaced placeholder (no real location)
            box.update(x=0.03, y=0.03, w=0.22, h=0.14, nobbox=True)
        boxes.append(box)
    return boxes


def _first_text(source, keys):
    for key in keys:
        value = source.get(key) if isinstance(source, dict) else None
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _first_list(source, keys):
    for key in keys:
        value = source.get(key) if isinstance(source, dict) else None
        if isinstance(value, list):
            return value
    return None


def _coerce_caption_schema(cap):
    """Normalize common LLM shortcuts to the official Ideogram caption shape.

    The Director UI and backend should agree on one contract. Some local LLMs output compact
    helper JSON such as {"prompt": "...", "bg": "...", "elements": [...]}; accept that as input,
    but always pass the official schema forward.
    """
    if not isinstance(cap, dict):
        return None

    cd0 = cap.get("compositional_deconstruction")
    cd0 = cd0 if isinstance(cd0, dict) else {}
    style0 = cap.get("style_description")
    style0 = style0 if isinstance(style0, dict) else None

    out = {}
    aspect_ratio = _first_text(cap, ("aspect_ratio", "resolution", "size"))
    if aspect_ratio:
        out["aspect_ratio"] = aspect_ratio

    summary = _first_text(cap, (
        "high_level_description", "summary", "prompt", "description", "scene", "caption"
    ))
    if summary:
        out["high_level_description"] = summary

    if style0:
        out["style_description"] = dict(style0)

    background = _first_text(cd0, ("background", "bg", "setting", "scene_background"))
    if not background:
        background = _first_text(cap, ("background", "bg", "setting", "scene_background"))

    raw_elements = _first_list(cd0, ("elements", "objects", "items", "bboxes", "boxes"))
    if raw_elements is None:
        raw_elements = _first_list(cap, ("elements", "objects", "items", "bboxes", "boxes")) or []

    elements = []
    for raw in raw_elements:
        if not isinstance(raw, dict):
            continue
        etype = "text" if raw.get("type") == "text" else "obj"
        item = {"type": etype}
        bbox = raw.get("bbox")
        if not (isinstance(bbox, (list, tuple)) and len(bbox) == 4):
            for alias in ("box", "bounds", "rect"):
                value = raw.get(alias)
                if isinstance(value, (list, tuple)) and len(value) == 4:
                    bbox = value
                    break
        if isinstance(bbox, (list, tuple)) and len(bbox) == 4:
            ymin, xmin, ymax, xmax = list(bbox)
            try:
                if ymin > ymax:
                    ymin, ymax = ymax, ymin
                if xmin > xmax:
                    xmin, xmax = xmax, xmin
            except TypeError:
                pass
            item["bbox"] = [ymin, xmin, ymax, xmax]
        if etype == "text":
            item["text"] = raw.get("text", "") or ""
        desc = _first_text(raw, ("desc", "description", "label", "name", "prompt"))
        item["desc"] = desc
        palette = raw.get("color_palette", raw.get("palette"))
        if isinstance(palette, list):
            item["color_palette"] = palette
        elements.append(item)

    out["compositional_deconstruction"] = {
        "background": background,
        "elements": elements,
    }
    return out


def _ratio_from_dims(width, height):
    """Reduce pixel width:height to a clean 'W:H' string (fallback when no ratio given)."""
    try:
        w, h = int(width), int(height)
    except (TypeError, ValueError):
        return "1:1"
    if w <= 0 or h <= 0:
        return "1:1"
    from math import gcd
    g = gcd(w, h) or 1
    return "%d:%d" % (w // g, h // g)


def _assemble_caption(aspect_ratio, include_aspect_ratio, background, high_level_description,
                      style_mode, aesthetics, lighting, medium, photo, art_style,
                      boxes, style_palette):
    """Build the Ideogram 4 caption in the official caption_verifier shape (the format KJ's
    builder, ComfyUI's own example prompt, and the model's validator all use):
        {high_level_description, style_description?, compositional_deconstruction}

    Key order matters for quality — photo: aesthetics,lighting,photo,medium ;
    art: aesthetics,lighting,medium,art_style ; element: type,bbox,[text],desc,color_palette.

    `aspect_ratio` is OPTIONAL and OFF by default: the renderer takes the real shape from the
    latent (the node's width/height), so the caption doesn't need it. A/B testing showed it is
    safety-neutral, and the expert/validator format omits it. The toggle prepends it as the
    first key only for an LLM-generation pipeline that expects the magic-prompt contract.
    """
    caption = {}
    if include_aspect_ratio:
        caption["aspect_ratio"] = aspect_ratio or "1:1"   # first key when enabled
    if (high_level_description or "").strip():
        caption["high_level_description"] = high_level_description

    if style_mode in ("photo", "art"):
        sd = {"aesthetics": aesthetics, "lighting": lighting}
        if style_mode == "photo":
            sd["photo"] = photo
            sd["medium"] = medium
        else:
            sd["medium"] = medium
            sd["art_style"] = art_style
        pal = _palette(style_palette, 16)
        if pal:
            sd["color_palette"] = pal
        caption["style_description"] = sd

    elements = []
    for b in boxes:
        if not isinstance(b, dict):
            continue
        etype = "text" if b.get("type") == "text" else "obj"
        el = {"type": etype}                       # key order: type, bbox, [text], desc, color_palette
        if not b.get("nobbox"):
            el["bbox"] = _norm_bbox(b)
        if etype == "text":
            el["text"] = b.get("text", "") or ""
        el["desc"] = b.get("desc", "") or ""
        pal = _palette(b.get("palette"), 5)
        if pal:
            el["color_palette"] = pal
        elements.append(el)

    caption["compositional_deconstruction"] = {
        "background": background or "",
        "elements": elements,
    }
    return caption


def _normalize_view_language(view_language):
    code = translate_engine.code_for_display(view_language)
    if not code or code == "auto":
        return VIEW_LANGUAGE_DEFAULT
    display = translate_engine.display_for_code(code)
    if display in _VIEW_LANGUAGE_CHOICES:
        return display
    return VIEW_LANGUAGE_DEFAULT


def _translation_opts(translation_engine=None, libretranslate_url=""):
    return {
        "translate_text_fields": False,
        "engine": translate_engine.normalize_translation_engine(translation_engine),
        "libretranslate_url": libretranslate_url if isinstance(libretranslate_url, str) else "",
    }


def _prepare_caption_for_text_safe_translation(caption):
    caption_for_translation = json.loads(json.dumps(caption or {}, ensure_ascii=False))
    text_preserve = []
    try:
        elements = (
            caption_for_translation.get("compositional_deconstruction", {})
            .get("elements", [])
        )
        original_elements = (
            (caption or {})
            .get("compositional_deconstruction", {})
            .get("elements", [])
        )
        if isinstance(elements, list) and isinstance(original_elements, list):
            for idx, element in enumerate(elements):
                if not isinstance(element, dict) or str(element.get("type", "")).lower() != "text":
                    continue
                original = original_elements[idx] if idx < len(original_elements) else element
                if not isinstance(original, dict):
                    original = element
                preserve = {}
                text_value = original.get("text")
                desc_value = original.get("desc")
                if isinstance(text_value, str):
                    preserve["text"] = text_value
                # Some external/old captions put the literal rendered word in desc only.
                # Do not even send that field to the translation engine; restore it after.
                if not (isinstance(text_value, str) and text_value.strip()) and isinstance(desc_value, str):
                    preserve["desc"] = desc_value
                    element["desc"] = ""
                if preserve:
                    text_preserve.append((idx, preserve))
    except Exception:
        return caption, []
    return caption_for_translation, text_preserve


def _restore_caption_text_literals(caption, text_preserve):
    if not text_preserve:
        return caption
    try:
        translated_elements = (
            caption.get("compositional_deconstruction", {})
            .get("elements", [])
        )
        if isinstance(translated_elements, list):
            for idx, preserve in text_preserve:
                if idx < len(translated_elements) and isinstance(translated_elements[idx], dict):
                    translated_elements[idx].update(preserve)
    except Exception:
        pass
    return caption


def _translate_caption_text_safe(caption, source_language, target_code, translate_opts):
    caption_for_translation, text_preserve = _prepare_caption_for_text_safe_translation(caption)
    translated, changed, sent = translate_engine.translate_caption(
        caption_for_translation,
        source_language or "auto",
        target_code,
        translate_opts,
    )
    return _restore_caption_text_literals(translated, text_preserve), changed, sent


def _translate_caption_for_view(
    caption,
    source_language="auto",
    view_language=VIEW_LANGUAGE_DEFAULT,
    translation_engine=translate_engine.TRANSLATION_ENGINE_DEFAULT,
    libretranslate_url="",
):
    """Translate an Ideogram caption for the editor view.

    This is display/editing translation only. Literal TEXT element values stay untouched so signs,
    logos, poster words, and user-authored text do not change accidentally.
    """
    view_language = _normalize_view_language(view_language)
    target_code = translate_engine.code_for_display(view_language) or "en"
    translated, changed, sent = _translate_caption_text_safe(
        caption,
        source_language,
        target_code,
        _translation_opts(translation_engine, libretranslate_url),
    )
    return translated, changed, sent, translate_engine.display_for_code(target_code)


def _bbox_pixels(boxes, width, height):
    """boxes -> per-frame nested pixel dicts [[{x,y,width,height}, ...]] for BBOX consumers."""
    frame = []
    for b in boxes:
        if not isinstance(b, dict) or b.get("nobbox"):
            continue
        x, y = float(b.get("x", 0.0)), float(b.get("y", 0.0))
        w, h = float(b.get("w", 0.0)), float(b.get("h", 0.0))
        if w < 0:
            x += w
            w = -w
        if h < 0:
            y += h
            h = -h
        frame.append({"x": round(x * width), "y": round(y * height),
                      "width": round(w * width), "height": round(h * height)})
    return [frame] if frame else []


def _import_sig(s):
    """Change-detection signature of a wired import_json string (FNV-1a 32-bit over UTF-8 bytes
    of the stripped text). The frontend computes the IDENTICAL hash (fnv1a in the JS) so both
    sides agree on \"is this the same JSON that last seeded the editor?\"."""
    h = 0x811C9DC5
    for b in (s or "").strip().encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return format(h, "08x")


def _loads_caption(s):
    """Lenient caption parse for WIRED LLM output. Chat models often wrap JSON in ```json fences
    or stray chatter despite instructions; rejecting that would silently fall back to the editor
    state. Accept, in order: raw JSON → fenced block content → first '{' .. last '}' span.
    Returns the parsed dict or None. (The pass-through output is re-minified from the parsed dict,
    so fences/chatter never reach the image model.)"""
    if not s or not str(s).strip():
        return None
    txt = str(s).strip()
    candidates = [txt]
    m = re.search(r"```(?:json)?\s*(.*?)```", txt, re.DOTALL | re.IGNORECASE)
    if m:
        candidates.append(m.group(1).strip())
    i, j = txt.find("{"), txt.rfind("}")
    if i >= 0 and j > i:
        candidates.append(txt[i:j + 1])
    for c in candidates:
        try:
            v = json.loads(c)
            if isinstance(v, dict):
                return _coerce_caption_schema(v)
        except (ValueError, TypeError):
            continue
    return None


def _has_import_text(import_json):
    return isinstance(import_json, str) and bool(import_json.strip())


IMPORT_REVIEW = "Ask Before Replacing"
IMPORT_AUTO = "Always Replace"
IMPORT_MODE_CHOICES = (IMPORT_REVIEW, IMPORT_AUTO)


def _normalize_import_mode(value):
    value = (value or "").strip() if isinstance(value, str) else ""
    legacy = {
        "when empty": IMPORT_REVIEW,
        "empty": IMPORT_REVIEW,
        "fill empty": IMPORT_REVIEW,
        "fill empty board only": IMPORT_REVIEW,
        "ask": IMPORT_REVIEW,
        "ask before replace": IMPORT_REVIEW,
        "ask before replacing": IMPORT_REVIEW,
        "ask before replacing board": IMPORT_REVIEW,
        "review": IMPORT_REVIEW,
        "review first": IMPORT_REVIEW,
        "manual": IMPORT_REVIEW,
        "manual apply only": IMPORT_REVIEW,
        "use only when board is empty": IMPORT_REVIEW,
        "ignore": IMPORT_REVIEW,
        "off": IMPORT_REVIEW,
        "ignore input prompt": IMPORT_REVIEW,
        "auto": IMPORT_REVIEW,
        "auto replace": IMPORT_REVIEW,
        "replace": IMPORT_REVIEW,
        "always": IMPORT_AUTO,
        "always replace": IMPORT_AUTO,
        "always replace board": IMPORT_AUTO,
        "replace board automatically": IMPORT_AUTO,
    }
    return legacy.get(value.lower(), value if value in IMPORT_MODE_CHOICES else IMPORT_REVIEW)


def _should_block_for_invalid_import(caption_data, import_json, import_mode, board_has_content=None):
    if not _has_import_text(import_json) or _loads_caption(import_json) is not None:
        return False, ""
    sig = _import_sig(import_json)
    if board_has_content is None:
        board_has_content = _board_has_content(caption_data)
    if board_has_content and sig and _caption_data_import_sig(caption_data) == sig:
        return False, sig
    return True, sig


def _require_valid_import_json(import_json, caption_data="", import_mode=IMPORT_REVIEW, board_has_content=None):
    should_block, _sig = _should_block_for_invalid_import(
        caption_data, import_json, import_mode, board_has_content
    )
    if should_block:
        raise RuntimeError(INVALID_IMPORT_MESSAGE)


def _caption_data_has_boxes(caption_data):
    try:
        d = json.loads(caption_data) if caption_data else None
        if isinstance(d, dict):
            b = d.get("boxes")
            return isinstance(b, list) and len(b) > 0
    except (ValueError, TypeError):
        pass
    return False


def _caption_data_import_sig(caption_data):
    try:
        d = json.loads(caption_data) if caption_data else None
        if isinstance(d, dict):
            sig = d.get("importSig")
            if isinstance(sig, str) and sig:
                return sig
    except (ValueError, TypeError):
        pass
    return ""


def _board_has_content(caption_data, high_level_description="", background="", style_mode="none",
                       aesthetics="", lighting="", medium="", photo="", art_style=""):
    if _caption_data_has_boxes(caption_data):
        return True
    if any((v or "").strip() for v in (
        high_level_description, background, aesthetics, lighting, medium, photo, art_style
    )):
        return True
    return (style_mode or "none") != "none"


def _decide_import(caption_data, import_json, import_mode, board_has_content=None):
    """-> (imported dict | None, sig | None, use_import bool).

    Incoming JSON Prompt policy:
    - Ask Before Replacing: empty boards fill automatically; existing boards ask first.
    - Always Replace: a new connected caption owns the board/output, but the same caption that
      already seeded the board must not overwrite later manual bbox/description edits.
    """
    imported = _loads_caption(import_json)
    if imported is None:
        return None, _import_sig(import_json) if _has_import_text(import_json) else None, False
    mode = _normalize_import_mode(import_mode)
    sig = _import_sig(import_json)
    if board_has_content is None:
        board_has_content = _board_has_content(caption_data)
    same_saved_import = sig and _caption_data_import_sig(caption_data) == sig
    use_import = (not same_saved_import) and (
        mode == IMPORT_AUTO or (mode == IMPORT_REVIEW and not board_has_content)
    )
    return imported, sig, use_import


def _should_block_for_pending_import(caption_data, import_json, import_mode, board_has_content=None):
    imported, sig, use_import = _decide_import(caption_data, import_json, import_mode, board_has_content)
    if imported is None or use_import:
        return imported, sig, False
    mode = _normalize_import_mode(import_mode)
    if mode != IMPORT_REVIEW:
        return imported, sig, False
    return imported, sig, bool(sig and _caption_data_import_sig(caption_data) != sig)


def _send_pending_import(unique_id, sig, imported=None, raw_json="", invalid=False):
    if not _HAS_COMFY or not unique_id:
        return
    try:
        instance = getattr(PromptServer, "instance", None)
        sender = getattr(instance, "send_sync", None)
        if sender:
            payload = {
                "node": str(unique_id),
                "node_id": str(unique_id),
                "sig": sig,
                "json": raw_json if invalid else json.dumps(imported or {}, ensure_ascii=False, separators=(",", ":")),
                "invalid": bool(invalid),
                "message": INVALID_IMPORT_MESSAGE if invalid else PENDING_MESSAGE,
            }
            client_id = getattr(instance, "client_id", None)
            if client_id:
                sender(PENDING_EVENT, payload, client_id)
            # Browser tabs and disposable test clients can change faster than the server-side
            # current client id. Broadcast as well so the visible node can always show Apply/Keep.
            sender(PENDING_EVENT, payload)
    except Exception:
        pass


def build_outputs(width, height, seed, aspect_ratio, include_aspect_ratio,
                  background, high_level_description, style_mode,
                  aesthetics, lighting, medium, photo, art_style,
                  caption_data, import_json, import_mode):
    """Pure assembly used by the node's build(). -> (prompt, width, height, seed, bboxes).

    aspect_ratio POLICY (confirmed against the official repo, 2026-06-11): it is the authoring
    hint for whoever plans the bboxes, NOT renderer input — official magic_prompt.py strips it
    from the final caption and the official schema has no such top-level key. So BOTH paths emit
    it only when `include_aspect_ratio` is on (off by default): the assembled path simply doesn't
    add it, and the import pass-through pops it. Output is SINGLE-LINE MINIFIED — minification
    measurably lowers the model's safety-block rate (A/B: 1/6 minified vs 4/6 pretty-printed).
    """
    ar = (aspect_ratio or "").strip() or _ratio_from_dims(width, height)
    boxes, style_palette = _parse_caption_data(caption_data)

    board_content = _board_has_content(
        caption_data, high_level_description, background, style_mode,
        aesthetics, lighting, medium, photo, art_style,
    )
    _require_valid_import_json(import_json, caption_data, import_mode, board_content)
    imported, _sig, use_import = _decide_import(caption_data, import_json, import_mode, board_content)
    if use_import:
        # Pass the wired caption through as authored — EXCEPT aspect_ratio, which is the LLM's
        # planning metadata, not renderer input: the official magic_prompt.py strips it from the
        # final caption (strip_aspect_ratio_and_bboxes), the official caption schema has no such
        # key, and the real canvas comes from width/height (latent). The frontend still reads it
        # for resolution sync via the ui echo (which keeps the ORIGINAL dict). The
        # include_aspect_ratio toggle preserves it for pipelines that want the raw 3-key contract.
        caption = dict(imported)
        if not include_aspect_ratio:
            caption.pop("aspect_ratio", None)
        boxes = _caption_to_boxes(imported)
    else:
        caption = _assemble_caption(ar, include_aspect_ratio, background, high_level_description,
                                    style_mode, aesthetics, lighting, medium, photo, art_style,
                                    boxes, style_palette)

    # SINGLE-LINE MINIFIED JSON, non-ASCII preserved verbatim (minify lowers safety blocks).
    prompt = json.dumps(caption, ensure_ascii=False, separators=(",", ":"))
    bboxes = _bbox_pixels(boxes, width, height)
    return (prompt, int(width), int(height), int(seed), bboxes)


# --------------------------------------------------------------------------- #
# Node                                                                         #
# --------------------------------------------------------------------------- #

class DenoIdeogramDirector:
    """Edit Ideogram 4's structured JSON caption on top of the generated result and
    regenerate in a closed loop. Outputs a valid caption JSON for the positive
    CLIPTextEncode, plus width/height/seed and the drawn boxes as BBOX."""

    @classmethod
    def INPUT_TYPES(cls):
        # Socket model (ComfyUI frontend ≥1.17.5): every input — INCLUDING a widget-backed one — gets a
        # left-edge socket by default. This node is driven entirely by the on-canvas board, so the bare
        # widgets are hidden behind it; their default sockets would otherwise clutter the left edge and
        # snag the cursor. We therefore mark every UI-managed widget "socketless": True so NO socket is
        # created for it (declarative — replaces the old JS pruneInputs/relocation hacks). Only the two
        # inputs meant to be WIRED get sockets, and they sit at the top:
        #   • backdrop   — optional reference IMAGE shown under the boxes (never enters the prompt)
        #   • import_json — forceInput STRING: an upstream LLM / Prompt-Text caption JSON
        # This mirrors the proven KJ Ideogram-builder contract (forceInput for the wired JSON, socketless
        # for editor state). With no widget-sockets present, forceInput round-trips cleanly — the earlier
        # shift came from pruning widget-sockets at runtime, not from forceInput itself.
        SL = {"socketless": True}
        return {
            "required": {
                "width":  ("INT", {"default": 1024, "min": 64, "max": 16384, "step": 16, **SL}),
                "height": ("INT", {"default": 1024, "min": 64, "max": 16384, "step": 16, **SL}),
                "seed":   ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff,
                                   "control_after_generate": False, **SL}),
                "high_level_description": ("STRING", {"multiline": True, "default": "", **SL}),
                "background":             ("STRING", {"multiline": True, "default": "", **SL}),
                "style_mode": (["none", "photo", "art"], {"default": "none", **SL}),
                "aesthetics": ("STRING", {"default": "", **SL}),
                "lighting":   ("STRING", {"default": "", **SL}),
                "medium":     ("STRING", {"default": "", **SL}),
                "photo":      ("STRING", {"default": "", **SL}),
                "art_style":  ("STRING", {"default": "", **SL}),
            },
            "optional": {
                # Board-only layout backdrop: shown under the bboxes so you can trace over a
                # reference. It NEVER enters the caption JSON and has zero effect on generation.
                "backdrop":    ("IMAGE", {"tooltip": "Shown on the board as a layout backdrop to "
                                          "trace over — NOT used for generation (never enters the prompt)."}),
                # UI-managed state — real (optional) widgets so their values serialize and reach build();
                # socketless so they carry no left-edge socket. (NOT ComfyUI "hidden": that is server-
                # injected UNIQUE_ID/PROMPT/... and would never carry the editor's box state to build.)
                "import_mode":  (list(IMPORT_MODE_CHOICES), {"default": IMPORT_REVIEW, **SL}),
                "caption_data": ("STRING", {"default": "", **SL}),
                "seed_lock":    ("BOOLEAN", {"default": True, **SL}),
                "auto_save":    ("BOOLEAN", {"default": False, **SL}),
                "save_prefix":  ("STRING", {"default": "Ideogram_Director", **SL}),
                # 'W:H' string the resolution control derives from the chosen ratio + megapixels.
                # Emitted into the caption only when include_aspect_ratio is on. Appended last so
                # adding these never shifts older workflows' widget slots.
                "aspect_ratio": ("STRING", {"default": "1:1", **SL}),
                # Off by default = match the expert/validator (KJ / caption_verifier) format, which
                # omits aspect_ratio (the renderer gets the real shape from the latent). Turn on only
                # for an LLM-generation pipeline that expects the magic-prompt 3-key contract.
                "include_aspect_ratio": ("BOOLEAN", {"default": False, **SL}),
                # English Prompt mode. The board stays in the user's language; only the final
                # prompt emitted by this node is converted to model-ready English when enabled.
                "translate_output": (_OUTPUT_LANGUAGE_CHOICES, {
                    "default": translate_engine.DIRECTOR_ENGLISH_DISPLAY,
                    **SL,
                }),
                # Language translates the editable board text for the user's local reading/editing
                # comfort. The final output stays model-ready English; literal TEXT element values
                # are never translated by the helper.
                "view_language": (_VIEW_LANGUAGE_CHOICES, {
                    "default": VIEW_LANGUAGE_DEFAULT,
                    **SL,
                }),
                # Online translation engine used by both the Language view helper and the final
                # English output conversion. Google remains the default; the frontend exposes the
                # alternatives only when Google is unreachable or blocked for the user's network.
                "translation_engine": (_TRANSLATION_ENGINE_CHOICES, {
                    "default": translate_engine.TRANSLATION_ENGINE_DEFAULT,
                    **SL,
                }),
                "libretranslate_url": ("STRING", {"default": "", **SL}),
                # forceInput: import_json is meant to be WIRED (upstream LLM / Prompt-Text caption JSON),
                # so it is a real top input socket rather than a hidden widget. Declared LAST so NO widget
                # is serialized after it — a forceInput interleaved before widgets shifts their widgets_values
                # slots by one on reload (frontend 1.44). The frontend reads the wire (getImportJson) to seed
                # the board; the backend receives the value in build().
                "import_json": ("STRING", {"forceInput": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING", "INT", "INT", "INT", "BBOX")
    RETURN_NAMES = ("prompt", "width", "height", "seed", "bboxes")
    FUNCTION = "build"
    CATEGORY = "Deno/Ideogram"
    DESCRIPTION = ("Visual Ideogram 4 caption studio. Edit the structured JSON prompt "
                   "(boxes / descriptions / style) over the generated result and "
                   "regenerate in place. Wire 'prompt' into the positive CLIPTextEncode.")

    @classmethod
    def VALIDATE_INPUTS(
        cls,
        style_mode=None,
        import_mode=None,
        translate_output=None,
        view_language=None,
        translation_engine=None,
        libretranslate_url=None,
    ):
        # Listing import_mode here makes ComfyUI SKIP the strict combo-membership check for it.
        # Workflows saved across node updates can carry a stale/shifted value (e.g. "") in that slot;
        # rejecting the whole prompt for it ("Value not in list") bricks the node for those users.
        # build() coerces any unknown value back to the current default, so accepting it here is safe.
        return True

    def build(self, width, height, seed, high_level_description="", background="",
              style_mode="none", aesthetics="", lighting="", medium="", photo="", art_style="",
              backdrop=None, import_json="", import_mode=IMPORT_REVIEW,
              caption_data="", seed_lock=True, auto_save=False, save_prefix="Ideogram_Director",
              aspect_ratio="1:1", include_aspect_ratio=False,
              translate_output=translate_engine.DIRECTOR_ENGLISH_DISPLAY,
              view_language=VIEW_LANGUAGE_DEFAULT,
              translation_engine=translate_engine.TRANSLATION_ENGINE_DEFAULT,
              libretranslate_url="",
              unique_id=None):
        # `backdrop` (optional IMAGE) is shown on the board only; it never enters the caption JSON.
        import_mode = _normalize_import_mode(import_mode)
        if translate_output not in _OUTPUT_LANGUAGE_CHOICES:
            translate_output = translate_engine.ORIGINAL_DISPLAY
        view_language = _normalize_view_language(view_language)
        view_language_code = translate_engine.code_for_display(view_language)
        translation_engine = translate_engine.normalize_translation_engine(translation_engine)
        if not isinstance(libretranslate_url, str):
            libretranslate_url = ""
        if view_language_code and translate_output == translate_engine.ORIGINAL_DISPLAY:
            translate_output = translate_engine.DIRECTOR_ENGLISH_DISPLAY
        if not isinstance(caption_data, str):
            caption_data = ""
        if not isinstance(import_json, str):
            import_json = ""
        board_content = _board_has_content(
            caption_data, high_level_description, background, style_mode,
            aesthetics, lighting, medium, photo, art_style,
        )
        invalid_should_block, invalid_sig = _should_block_for_invalid_import(
            caption_data, import_json, import_mode, board_content
        )
        if invalid_should_block:
            _send_pending_import(unique_id, invalid_sig, raw_json=import_json, invalid=True)
            raise RuntimeError(INVALID_IMPORT_MESSAGE)
        pending_imported, pending_sig, should_block = _should_block_for_pending_import(
            caption_data, import_json, import_mode, board_content
        )
        if should_block:
            _send_pending_import(unique_id, pending_sig, pending_imported)
            raise RuntimeError(PENDING_MESSAGE)
        result = build_outputs(
            width, height, seed, aspect_ratio, include_aspect_ratio, background, high_level_description,
            style_mode, aesthetics, lighting, medium, photo, art_style,
            caption_data, import_json, import_mode,
        )
        translation_payload = None
        target_code = translate_engine.code_for_display(translate_output)
        if target_code:
            prompt, out_width, out_height, out_seed, out_bboxes = result
            target_display = translate_engine.display_for_code(target_code)
            source_code = view_language_code if view_language_code and view_language_code != target_code else "auto"
            translate_opts = _translation_opts(translation_engine, libretranslate_url)
            try:
                caption = translate_engine.loads_caption(prompt)
                if caption is not None:
                    translated, changed, sent = _translate_caption_text_safe(
                        caption,
                        source_code,
                        target_code,
                        translate_opts,
                    )
                    prompt = json.dumps(translated, ensure_ascii=False, separators=(",", ":"))
                    result = (prompt, out_width, out_height, out_seed, out_bboxes)
                    translation_payload = {
                        "ok": True,
                        "language": target_display,
                        "engine": translation_engine,
                        "status": (
                            "English prompt ready (%d field(s) sent). Box TEXT stayed exactly as typed."
                            % sent
                        ),
                    }
                else:
                    prompt = translate_engine.translate_text(
                        prompt,
                        source_code,
                        target_code,
                        engine=translation_engine,
                        libretranslate_url=libretranslate_url,
                    )
                    result = (prompt, out_width, out_height, out_seed, out_bboxes)
                    translation_payload = {
                        "ok": True,
                        "language": target_display,
                        "engine": translation_engine,
                        "status": "English prompt ready. Box TEXT stayed exactly as typed.",
                    }
            except Exception as exc:
                reason = translate_engine.translation_failure_reason(translation_engine, exc)
                translation_payload = {
                    "ok": False,
                    "language": target_display,
                    "engine": translation_engine,
                    "reason": reason,
                    "error_type": type(exc).__name__,
                    "status": (
                        "English prompt conversion unavailable (%s). %s Generation was stopped before using a non-English prompt."
                        % (type(exc).__name__, reason)
                    ),
                }
                raise RuntimeError(translation_payload["status"]) from exc
        # Live sync to the board: when a caption arrived on the import_json wire (e.g. a fresh LLM
        # result, which the frontend can never read off the wire by itself), echo it back through the
        # "executed" ui event. `used` describes this backend run's output path; the frontend still
        # re-checks the visible editor state and Incoming JSON Prompt mode before overwriting the board.
        imported, sig, used = _decide_import(caption_data, import_json, import_mode, board_content)
        ui = {}
        if imported is not None:
            payload = {"sig": sig, "used": bool(used),
                       "json": json.dumps(imported, ensure_ascii=False, separators=(",", ":"))}
            ui["idd_import"] = [payload]
        if translation_payload is not None:
            ui["idd_translate"] = [translation_payload]
        if ui:
            return {"ui": ui, "result": result}
        return result

    @classmethod
    def IS_CHANGED(cls, **kw):
        # Re-run whenever any edit / seed / toggle changes.
        kw.pop("backdrop", None)  # tensors aren't JSON-serializable; backdrop is board-display only
        return hashlib.sha256(json.dumps(kw, sort_keys=True, default=str).encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------- #
# Save route — copy a (Preview) result from temp into the output folder.       #
# Registered only inside ComfyUI.                                              #
# --------------------------------------------------------------------------- #

if _HAS_COMFY and getattr(PromptServer, "instance", None) is not None:

    @PromptServer.instance.routes.post("/deno/ideogram_director/translate_caption")
    async def _deno_ideogram_director_translate_caption(request):  # pragma: no cover - needs ComfyUI
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid json body"}, status=400)

        caption = data.get("caption")
        if not isinstance(caption, dict):
            return web.json_response({"error": "caption must be an object"}, status=400)

        target = data.get("target") or data.get("view_language") or VIEW_LANGUAGE_DEFAULT
        source = data.get("source") or "auto"
        translation_engine = translate_engine.normalize_translation_engine(
            data.get("engine") or data.get("translation_engine")
        )
        libretranslate_url = data.get("libretranslate_url") or ""
        if not isinstance(libretranslate_url, str):
            libretranslate_url = ""
        try:
            translated, changed, sent, display = _translate_caption_for_view(
                caption,
                source,
                target,
                translation_engine,
                libretranslate_url,
            )
        except Exception as exc:
            return web.json_response({
                "error": "translation failed",
                "error_type": type(exc).__name__,
                "engine": translation_engine,
                "reason": translate_engine.translation_failure_reason(translation_engine, exc),
                "message": translate_engine.short_exception_message(exc),
            }, status=502)

        return web.json_response({
            "caption": translated,
            "changed": changed,
            "sent": sent,
            "language": display,
            "engine": translation_engine,
        })

    @PromptServer.instance.routes.post("/deno/ideogram_director/save")
    async def _deno_ideogram_director_save(request):  # pragma: no cover - needs ComfyUI
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid json body"}, status=400)

        filename = data.get("filename") or ""
        subfolder = data.get("subfolder") or ""
        ftype = data.get("type") or "temp"
        prefix = data.get("prefix") or "Ideogram_Director"

        base = folder_paths.get_directory_by_type(ftype)
        if not base or not filename:
            return web.json_response({"error": "bad source"}, status=400)
        # guard against path traversal
        src = os.path.abspath(os.path.join(base, subfolder, filename))
        if not src.startswith(os.path.abspath(base)) or not os.path.isfile(src):
            return web.json_response({"error": "source not found"}, status=404)

        out_dir = folder_paths.get_output_directory()
        full_output_folder, fname, counter, subfolder_out, _ = \
            folder_paths.get_save_image_path(prefix, out_dir)
        ext = os.path.splitext(src)[1] or ".png"
        out_name = "%s_%05d%s" % (fname, counter, ext)
        dst = os.path.join(full_output_folder, out_name)
        try:
            shutil.copyfile(src, dst)
        except OSError as e:
            return web.json_response({"error": "copy failed: %s" % e}, status=500)
        return web.json_response({"saved": out_name, "subfolder": subfolder_out, "type": "output"})


NODE_CLASS_MAPPINGS = {"DenoIdeogramDirector": DenoIdeogramDirector}
NODE_DISPLAY_NAME_MAPPINGS = {"DenoIdeogramDirector": "(Deno) Ideogram Director"}
# Integration note: the repo __init__.py aggregates mappings + sets WEB_DIRECTORY="./web/js".
