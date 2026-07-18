from __future__ import annotations


TASK_TYPE_DEFAULT = "default"
TASK_TYPE_T2I = "t2i"
TASK_TYPE_T2V = "t2v"
TASK_TYPE_I2I = "i2i"
TASK_TYPE_R2I = "r2i"
TASK_TYPE_I2V = "i2v"
TASK_TYPE_V2V = "v2v"
TASK_TYPE_R2V = "r2v"
TASK_TYPE_VI2V = "vi2v"
TASK_TYPE_RV2V = "rv2v"
TASK_TYPE_ADS2V = "ads2v"
TASK_TYPE_VRC2V = "vrc2v"
TASK_TYPE_MV2V = "mv2v"
TASK_TYPE_CUSTOM_LEGACY = "custom"

TASK_TYPE_LABELS = {
    TASK_TYPE_DEFAULT: "Default",
    TASK_TYPE_T2I: "Text to Image",
    TASK_TYPE_T2V: "Text to Video",
    TASK_TYPE_I2I: "Image Edit",
    TASK_TYPE_R2I: "Subject to Image",
    TASK_TYPE_I2V: "Image to Video",
    TASK_TYPE_V2V: "Video Edit",
    TASK_TYPE_R2V: "Subject to Video",
    TASK_TYPE_VI2V: "Video Propagation",
    TASK_TYPE_RV2V: "Reference Video Edit",
    TASK_TYPE_ADS2V: "Ads Insertion",
    TASK_TYPE_VRC2V: "Video Reference Control",
    TASK_TYPE_MV2V: "Motion / Style Edit",
}
TASK_LABEL_TO_TYPE = {label: task_type for task_type, label in TASK_TYPE_LABELS.items()}
TASK_TYPES = list(TASK_TYPE_LABELS.values())

SYSTEM_PROMPTS = {
    TASK_TYPE_DEFAULT: "You are a helpful assistant.",
    TASK_TYPE_T2I: "You are a helpful assistant specialized in text-to-image generation.",
    TASK_TYPE_T2V: "You are a helpful assistant specialized in text-to-video generation.",
    TASK_TYPE_I2I: "You are a helpful assistant specialized in image editing.",
    TASK_TYPE_R2I: "You are a helpful assistant specialized in subject-to-image generation.",
    TASK_TYPE_I2V: "You are a helpful assistant specialized in image-to-video generation.",
    TASK_TYPE_V2V: "You are a helpful assistant specialized in video editing.",
    TASK_TYPE_R2V: "You are a helpful assistant specialized in subject-to-video generation.",
    TASK_TYPE_VI2V: "You are a helpful assistant specialized in video editing on content propagation.",
    TASK_TYPE_RV2V: "You are a helpful assistant specialized in video editing with reference.",
    TASK_TYPE_ADS2V: "You are a helpful assistant specialized in ads insertion.",
    TASK_TYPE_VRC2V: (
        "You are a helpful assistant for editing. "
        "You may need to adjust the subject's action or position."
    ),
    TASK_TYPE_MV2V: (
        "You are a helpful assistant for editing. "
        "You might need to adjust the video's style, lighting, colors, "
        "textures, and the subject's pose or action."
    ),
}

NEGATIVE_PRESET_OFFICIAL = "Official Wan2.2"
NEGATIVE_PRESET_EMPTY = "Empty"
NEGATIVE_PRESET_CUSTOM = "Custom"
NEGATIVE_PRESET_OFFICIAL_CUSTOM = "Official Wan2.2 + Custom"
NEGATIVE_PRESETS = [
    NEGATIVE_PRESET_OFFICIAL,
    NEGATIVE_PRESET_EMPTY,
]

_KNOWN_TASK_TYPE_VALUES = frozenset(
    [*TASK_TYPES, *SYSTEM_PROMPTS.keys(), TASK_TYPE_CUSTOM_LEGACY, "Custom System Prompt"]
)
_KNOWN_NEGATIVE_PRESET_VALUES = frozenset(
    [*NEGATIVE_PRESETS, NEGATIVE_PRESET_CUSTOM, NEGATIVE_PRESET_OFFICIAL_CUSTOM]
)

OFFICIAL_WAN22_NEGATIVE_PROMPT = (
    "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，"
    "最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，"
    "画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，"
    "杂乱的背景，三条腿，背景人很多，倒着走"
)

REFERENCE_IMAGE_HINT = (
    "Use reference images in order as image0, image1, image2, and so on. "
    "Describe exactly what should be taken from each reference image."
)

DEFAULT_POSITIVE_PROMPT = (
    "Replace the jacket with the shirt from image0. "
    "Keep camera motion, face, lighting, and background unchanged."
)


def _encode_text(clip, text: str):
    if clip is None:
        raise RuntimeError(
            "ERROR: clip input is invalid: None\n\n"
            "Connect a valid Wan/Bernini T5 text encoder / CLIP output before using this node."
        )
    tokens = clip.tokenize(text or "")
    return clip.encode_from_tokens_scheduled(tokens)


def _join_prompt_parts(*parts: str) -> str:
    return " ".join(str(part).strip() for part in parts if str(part or "").strip())


def _system_prompt_for_task(task_type: str, custom_system_prompt: str) -> str:
    task_type = _normalize_task_type(task_type)
    return SYSTEM_PROMPTS.get(task_type, SYSTEM_PROMPTS[TASK_TYPE_DEFAULT])


def _normalize_task_type(task_type: str) -> str:
    value = str(task_type or "").strip()
    if value in SYSTEM_PROMPTS:
        return value
    if value in {TASK_TYPE_CUSTOM_LEGACY, "Custom System Prompt"}:
        return TASK_TYPE_DEFAULT
    return TASK_LABEL_TO_TYPE.get(value, TASK_TYPE_DEFAULT)


def _build_positive_prompt(
    task_type: str,
    positive_prompt: str,
    reference_prompt_helper: bool,
    custom_system_prompt: str,
) -> str:
    normalized_task_type = _normalize_task_type(task_type)
    system_prompt = _system_prompt_for_task(normalized_task_type, custom_system_prompt)
    helper = REFERENCE_IMAGE_HINT if reference_prompt_helper and normalized_task_type in {TASK_TYPE_R2V, TASK_TYPE_RV2V} else ""
    return _join_prompt_parts(system_prompt, helper, positive_prompt)


def _build_negative_prompt(negative_preset: str, negative_prompt: str) -> str:
    custom = str(negative_prompt or "").strip()
    if custom:
        if negative_preset == NEGATIVE_PRESET_OFFICIAL_CUSTOM and OFFICIAL_WAN22_NEGATIVE_PROMPT not in custom:
            return _join_prompt_parts(OFFICIAL_WAN22_NEGATIVE_PROMPT, custom)
        return custom

    if negative_preset == NEGATIVE_PRESET_EMPTY:
        return ""
    if negative_preset in {NEGATIVE_PRESET_CUSTOM, NEGATIVE_PRESET_OFFICIAL_CUSTOM, NEGATIVE_PRESET_OFFICIAL}:
        return OFFICIAL_WAN22_NEGATIVE_PROMPT
    return OFFICIAL_WAN22_NEGATIVE_PROMPT


class DenoBerniniPromptGuide:
    DESCRIPTION = (
        "KJ-style Bernini prompt helper for ComfyUI.\n\n"
        "This node does not implement Bernini conditioning by itself. It only prepares "
        "the positive and negative text conditioning that you connect into KJ/ComfyUI's "
        "Bernini Conditioning workflow.\n\n"
        "- Choose the System Prompt mode at the top. The node prepends the same short system prompt "
        "prefix shown in KJ's Bernini prompt table.\n"
        "- Write prompts like you are instructing a chatbot: `Replace the jacket with the "
        "shirt from image0. Keep the camera motion, face, background, lighting, and shadows unchanged.`\n"
        "- Reference modes automatically add a short image0/image1/image2 naming hint internally.\n"
        "- Negative Preset fills the visible negative prompt box. Edit that box directly; the edited text is what gets encoded.\n\n"
        "Bernini visual conditioning still requires a ComfyUI/KJ backend that supports Bernini context latents."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP",),
                "task_type": (TASK_TYPES, {"default": TASK_TYPE_LABELS[TASK_TYPE_RV2V]}),
                "positive_prompt": (
                    "STRING",
                    {
                        "default": DEFAULT_POSITIVE_PROMPT,
                        "multiline": True,
                        "dynamicPrompts": True,
                    },
                ),
                "reference_prompt_helper": ("BOOLEAN", {"default": True}),
                "negative_preset": (NEGATIVE_PRESETS, {"default": NEGATIVE_PRESET_OFFICIAL}),
                "show_negative_prompt": ("BOOLEAN", {"default": True}),
                "negative_prompt": (
                    "STRING",
                    {
                        "default": OFFICIAL_WAN22_NEGATIVE_PROMPT,
                        "multiline": True,
                        "dynamicPrompts": True,
                    },
                ),
            }
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "build"
    CATEGORY = "Deno/Bernini"

    @classmethod
    def VALIDATE_INPUTS(cls, task_type=None, negative_preset=None):
        if task_type is not None and str(task_type).strip() not in _KNOWN_TASK_TYPE_VALUES:
            return f"Unknown Bernini System Prompt mode: {task_type}"
        if negative_preset is not None and str(negative_preset).strip() not in _KNOWN_NEGATIVE_PRESET_VALUES:
            return f"Unknown Bernini Negative Preset: {negative_preset}"
        return True

    def build(
        self,
        clip,
        task_type: str,
        positive_prompt: str,
        reference_prompt_helper: bool,
        negative_preset: str,
        show_negative_prompt: bool,
        negative_prompt: str,
        custom_system_prompt: str = "",
    ):
        final_positive = _build_positive_prompt(
            task_type=task_type,
            positive_prompt=positive_prompt,
            reference_prompt_helper=bool(reference_prompt_helper),
            custom_system_prompt=custom_system_prompt,
        )
        final_negative = _build_negative_prompt(
            negative_preset=negative_preset,
            negative_prompt=negative_prompt,
        )
        return (_encode_text(clip, final_positive), _encode_text(clip, final_negative))
