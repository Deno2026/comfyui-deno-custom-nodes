from __future__ import annotations

import node_helpers


LANGUAGE_AUTO = "Auto"
LANGUAGE_KOREAN = "Korean"
LANGUAGE_ENGLISH = "English"
LANGUAGE_JAPANESE = "Japanese"
LANGUAGE_CHINESE = "Chinese"

LANGUAGES = [
    LANGUAGE_AUTO,
    LANGUAGE_KOREAN,
    LANGUAGE_ENGLISH,
    LANGUAGE_JAPANESE,
    LANGUAGE_CHINESE,
]


def _normalize_language(language) -> str:
    value = str(language or LANGUAGE_AUTO)
    return value if value in LANGUAGES else LANGUAGE_AUTO


def _normalize_frame_rate(frame_rate) -> int:
    try:
        value = int(float(frame_rate))
    except (TypeError, ValueError):
        value = 25
    return max(1, min(value, 1000))


def _normalize_boolean(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    text = str(value or "").strip().lower()
    if text in {"", "false", "0", "off", "no"}:
        return False
    if text in {"true", "1", "on", "yes"}:
        return True
    return bool(text)


def _encode_text(clip, text: str):
    if clip is None:
        raise RuntimeError(
            "ERROR: clip input is invalid: None\n\n"
            "Connect a valid LTX text encoder / CLIP output before using this node."
        )
    tokens = clip.tokenize(text or "")
    return clip.encode_from_tokens_scheduled(tokens)


class DenoLTXPromptGuide:
    DESCRIPTION = (
        "Combines CLIP text encoding and LTXV frame-rate conditioning into one LTX prompt node.\n"
        "The UI estimates quoted dialogue duration for planning only.\n"
        "YouTube: https://www.youtube.com/@Denoise-AI"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP",),
                "positive_prompt": (
                    "STRING",
                    {
                        "default": '"\uc548\ub155\ud558\uc138\uc694 \ub9cc\ub098\uc11c \ubc18\uac11\uc2b5\ub2c8\ub2e4"',
                        "multiline": True,
                        "dynamicPrompts": True,
                    },
                ),
                "language": (LANGUAGES, {"default": LANGUAGE_AUTO}),
                "frame_rate": ("INT", {"default": 25, "min": 1, "max": 1000, "step": 1}),
                "show_negative_prompt": ("BOOLEAN", {"default": False}),
                "negative_prompt": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "dynamicPrompts": True,
                    },
                ),
            }
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "INT")
    RETURN_NAMES = ("positive", "negative", "frame_rate")
    FUNCTION = "build"
    CATEGORY = "Deno/LTX"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def build(
        self,
        clip,
        positive_prompt: str,
        language: str,
        frame_rate: int,
        show_negative_prompt: bool,
        negative_prompt: str,
    ):
        if isinstance(show_negative_prompt, str) and not str(negative_prompt or "").strip():
            negative_prompt = show_negative_prompt
        language = _normalize_language(language)
        frame_rate = _normalize_frame_rate(frame_rate)
        show_negative_prompt = _normalize_boolean(show_negative_prompt)
        negative_prompt = str(negative_prompt or "")

        positive = _encode_text(clip, positive_prompt)
        negative = _encode_text(clip, negative_prompt)

        positive = node_helpers.conditioning_set_values(positive, {"frame_rate": frame_rate})
        negative = node_helpers.conditioning_set_values(negative, {"frame_rate": frame_rate})

        return (positive, negative, frame_rate)
