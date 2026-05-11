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

    def build(
        self,
        clip,
        positive_prompt: str,
        language: str,
        frame_rate: int,
        show_negative_prompt: bool,
        negative_prompt: str,
    ):
        positive = _encode_text(clip, positive_prompt)
        negative = _encode_text(clip, negative_prompt)

        frame_rate = int(frame_rate)
        positive = node_helpers.conditioning_set_values(positive, {"frame_rate": frame_rate})
        negative = node_helpers.conditioning_set_values(negative, {"frame_rate": frame_rate})

        return (positive, negative, frame_rate)
