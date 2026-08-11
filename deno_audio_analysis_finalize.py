"""Finalize structured Gemma audio analysis and release only its CLIP model."""

from __future__ import annotations

import inspect
import re
from typing import Any

try:
    import comfy.model_management as comfy_model_management
except ImportError:  # ComfyUI is optional while importing this module in focused tests.
    comfy_model_management = None


MODEL_AFTER_RUN_CHOICES = ("Unload after run", "Keep loaded")

AUDIO_ANALYSIS_HEADINGS = (
    "AUDIO_CLASS",
    "VOCAL_PRESENCE",
    "MAJOR_SOUND_SOURCES",
    "ENERGY_AND_RHYTHM",
    "TIMED_ACOUSTIC_EVENTS",
    "PERFORMANCE_CUES",
    "UNCERTAINTIES",
)

_THINK_END = "</think>"
_THINK_START_PATTERN = re.compile(r"<think>", re.IGNORECASE)
_THINK_END_PATTERN = re.compile(re.escape(_THINK_END), re.IGNORECASE)
_CODE_FENCE_LINE = re.compile(r"^\s*```(?:[\w.+-]+)?\s*$")
_HEADING_LINE = re.compile(
    r"^\s*(?:#{1,6}\s*)?(?:[-+*]\s+)?"
    r"(?P<open>\*\*|__)?"
    r"(?P<heading>" + "|".join(AUDIO_ANALYSIS_HEADINGS) + r")"
    r"(?P<colon_before>\s*:)?"
    r"(?P<close>\*\*|__)?"
    r"(?P<colon_after>\s*:)?"
    r"\s*(?P<value>.*?)\s*$",
    re.IGNORECASE,
)


def _strip_reasoning_prefix(analysis: str) -> str:
    """Drop everything through the last case-insensitive closing think tag."""

    openings = list(_THINK_START_PATTERN.finditer(analysis))
    closings = list(_THINK_END_PATTERN.finditer(analysis))
    if openings and (not closings or openings[-1].start() > closings[-1].start()):
        raise RuntimeError(
            "Gemma audio analysis ended inside an unfinished <think> block. "
            "Run Text Generate again with Thinking disabled."
        )
    if not closings:
        return analysis
    return analysis[closings[-1].end() :]


def _parse_heading_line(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if len(stripped) >= 4:
        for wrapper in ("**", "__"):
            if stripped.startswith(wrapper) and stripped.endswith(wrapper):
                stripped = stripped[len(wrapper) : -len(wrapper)].strip()
                break

    match = _HEADING_LINE.fullmatch(stripped)
    if match is None:
        return None

    inline_value = match.group("value")
    has_separator = bool(match.group("colon_before") or match.group("colon_after"))
    if inline_value and not has_separator:
        return None

    heading = match.group("heading").upper()
    return heading, inline_value.strip()


def _normalize_value(lines: list[str]) -> str:
    normalized = [line.rstrip() for line in lines]
    while normalized and not normalized[0].strip():
        normalized.pop(0)
    while normalized and not normalized[-1].strip():
        normalized.pop()
    return "\n".join(normalized)


def _sanitize_analysis(analysis: str) -> str:
    """Return only recognized audio-analysis fields in their canonical order."""

    if not isinstance(analysis, str):
        raise TypeError("analysis must be a STRING value.")

    source = _strip_reasoning_prefix(analysis).replace("\r\n", "\n").replace("\r", "\n")
    fields: dict[str, list[str]] = {}
    active_heading: str | None = None

    for line in source.split("\n"):
        if _CODE_FENCE_LINE.fullmatch(line):
            active_heading = None
            continue
        heading_line = _parse_heading_line(line)
        if heading_line is not None:
            active_heading, inline_value = heading_line
            fields[active_heading] = [inline_value] if inline_value else []
            continue
        if active_heading is not None:
            if not line.strip():
                if any(part.strip() for part in fields[active_heading]):
                    active_heading = None
                continue
            fields[active_heading].append(line)

    blocks = []
    has_value = False
    for heading in AUDIO_ANALYSIS_HEADINGS:
        if heading not in fields:
            continue
        value = _normalize_value(fields[heading])
        has_value = has_value or bool(value)
        blocks.append(f"{heading}: {value}" if value else f"{heading}:")
    if not blocks or not has_value:
        raise RuntimeError(
            "Gemma audio analysis did not return any usable supported fields. "
            "Use the documented seven-field Text Generate prompt and run it again."
        )
    return "\n".join(blocks)


def _unload_clip_patcher(clip: Any) -> None:
    patcher = getattr(clip, "patcher", None)
    if patcher is None:
        raise RuntimeError(
            "Cannot unload the Audio Analysis CLIP model because the CLIP input "
            "has no clip.patcher."
        )
    if comfy_model_management is None:
        raise RuntimeError(
            "Cannot unload clip.patcher because ComfyUI model management is unavailable."
        )

    unload_model_and_clones = getattr(comfy_model_management, "unload_model_and_clones", None)
    soft_empty_cache = getattr(comfy_model_management, "soft_empty_cache", None)
    if not callable(unload_model_and_clones) or not callable(soft_empty_cache):
        raise RuntimeError(
            "Targeted Gemma CLIP unload requires ComfyUI 0.23.0 or newer. "
            "Update ComfyUI and run the workflow again."
        )

    try:
        parameters = inspect.signature(unload_model_and_clones).parameters
        accepts_keyword_options = any(
            parameter.kind is inspect.Parameter.VAR_KEYWORD
            for parameter in parameters.values()
        )
        if "all_devices" in parameters or accepts_keyword_options:
            unload_model_and_clones(patcher, all_devices=True)
        else:
            unload_model_and_clones(patcher)
    finally:
        soft_empty_cache(force=True)


class DenoAudioAnalysisFinalize:
    """Sanitize Gemma audio analysis and optionally release its CLIP patcher."""

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("audio_context",)
    FUNCTION = "finalize"
    CATEGORY = "Deno/Audio"
    DESCRIPTION = (
        "Keeps only the structured audio-analysis fields needed by a beginner audio-reference workflow "
        "and can unload the analysis CLIP model after use."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "analysis": ("STRING", {"forceInput": True}),
                "clip": ("CLIP",),
                "model_after_run": (
                    list(MODEL_AFTER_RUN_CHOICES),
                    {"default": "Unload after run"},
                ),
            }
        }

    def finalize(
        self,
        analysis: str,
        clip: Any,
        model_after_run: str = "Unload after run",
    ) -> tuple[str]:
        if model_after_run not in MODEL_AFTER_RUN_CHOICES:
            raise ValueError(f"Unsupported model-after-run choice: {model_after_run!r}")

        try:
            return (_sanitize_analysis(analysis),)
        finally:
            if model_after_run == "Unload after run":
                _unload_clip_patcher(clip)
