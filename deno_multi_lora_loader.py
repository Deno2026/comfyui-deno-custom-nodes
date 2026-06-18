from __future__ import annotations

from typing import Dict, List, Tuple

import comfy.lora
import comfy.lora_convert
import comfy.utils
import folder_paths


MAX_LORA_SLOTS = 8
LORA_NONE_OPTION = "__none__"


def _add_unique(items: List[str], value: str) -> None:
    if value and value not in items:
        items.append(value)


def _get_lora_options() -> List[str]:
    options: List[str] = [LORA_NONE_OPTION]
    try:
        discovered = folder_paths.get_filename_list("loras")
    except Exception:
        discovered = []

    for item in discovered:
        _add_unique(options, item)
    return options


def _slot_key(prefix: str, index: int) -> str:
    return f"{prefix}_{index}"


def _as_slot_count(value) -> int:
    try:
        return int(value)
    except Exception:
        return 1


def _is_slot_enabled(value) -> bool:
    if isinstance(value, str):
        return value.strip().lower() not in {"false", "0", "off", "no"}
    return bool(value)


def _validate_range(kwargs, key: str, label: str, minimum: float, maximum: float):
    try:
        value = float(kwargs.get(key, 1.0))
    except Exception:
        return f"{label} must be a number."
    if value < minimum or value > maximum:
        return f"{label} must be between {minimum:g} and {maximum:g}."
    return None


class DenoMultiLoraLoader:
    DESCRIPTION = (
        "Stack multiple LoRAs in one compact node for general ComfyUI model + CLIP workflows.\n"
        "Each slot has enable/disable, model strength, CLIP strength, reorder/remove controls, trigger words, and notes.\n"
        "Use the LTX Multi LoRA Loader instead when you need LTX video/audio strength controls.\n"
        "YouTube: https://www.youtube.com/@Denoise-AI"
    )

    @classmethod
    def INPUT_TYPES(cls):
        required: Dict[str, Tuple] = {
            "model": ("MODEL",),
            "active_loras": ("INT", {"default": 1, "min": 0, "max": MAX_LORA_SLOTS, "step": 1}),
        }

        lora_options = _get_lora_options()
        for index in range(1, MAX_LORA_SLOTS + 1):
            required[_slot_key("enabled", index)] = ("BOOLEAN", {"default": True})
            required[_slot_key("lora", index)] = (lora_options, {"default": LORA_NONE_OPTION})
            required[_slot_key("model_strength", index)] = (
                "FLOAT",
                {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01},
            )
            required[_slot_key("clip_strength", index)] = (
                "FLOAT",
                {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01},
            )

        for index in range(1, MAX_LORA_SLOTS + 1):
            required[_slot_key("trigger", index)] = ("STRING", {"default": "", "multiline": False})
            required[_slot_key("description", index)] = ("STRING", {"default": "", "multiline": True})

        return {"required": required, "optional": {"clip": ("CLIP",)}}

    RETURN_TYPES = ("MODEL", "CLIP")
    RETURN_NAMES = ("model", "clip")
    FUNCTION = "load_multi_lora"
    CATEGORY = "Deno/LoRA"

    def _resolve_slot_count(self, active_loras: int) -> int:
        return max(0, min(int(active_loras), MAX_LORA_SLOTS))

    @classmethod
    def VALIDATE_INPUTS(cls, active_loras: int = 1, **kwargs):
        slot_count = _as_slot_count(active_loras)
        if slot_count < 0 or slot_count > MAX_LORA_SLOTS:
            return f"active_loras must be between 0 and {MAX_LORA_SLOTS}."

        available = set(_get_lora_options())
        for index in range(1, slot_count + 1):
            if not _is_slot_enabled(kwargs.get(_slot_key("enabled", index), True)):
                continue

            lora_name = str(kwargs.get(_slot_key("lora", index), LORA_NONE_OPTION))
            if lora_name and lora_name != LORA_NONE_OPTION and lora_name not in available:
                return f"LoRA slot {index} is enabled but not installed: {lora_name}"

            error = _validate_range(
                kwargs,
                _slot_key("model_strength", index),
                f"LoRA slot {index} model strength",
                -10.0,
                10.0,
            )
            if error:
                return error
            error = _validate_range(
                kwargs,
                _slot_key("clip_strength", index),
                f"LoRA slot {index} CLIP strength",
                -10.0,
                10.0,
            )
            if error:
                return error
        return True

    def _load_lora_dict(self, lora_name: str):
        if not lora_name or lora_name == LORA_NONE_OPTION:
            return None

        lora_path = folder_paths.get_full_path("loras", lora_name)
        if not lora_path:
            raise FileNotFoundError(f"LoRA not found in models/loras: {lora_name}")
        return comfy.utils.load_torch_file(lora_path, safe_load=True)

    def load_multi_lora(self, model, clip=None, active_loras: int = 1, **kwargs):
        slot_count = self._resolve_slot_count(active_loras)
        current_model = model
        current_clip = clip

        for index in range(1, slot_count + 1):
            slot_enabled = bool(kwargs.get(_slot_key("enabled", index), True))
            if not slot_enabled:
                continue

            lora_name = str(kwargs.get(_slot_key("lora", index), LORA_NONE_OPTION))
            lora_sd = self._load_lora_dict(lora_name)
            if lora_sd is None:
                continue

            key_map = {}
            if current_model is not None:
                key_map = comfy.lora.model_lora_keys_unet(current_model.model, key_map)
            if current_clip is not None:
                key_map = comfy.lora.model_lora_keys_clip(current_clip.cond_stage_model, key_map)

            lora_converted = comfy.lora_convert.convert_lora(lora_sd)
            loaded = comfy.lora.load_lora(lora_converted, key_map)

            model_strength = float(kwargs.get(_slot_key("model_strength", index), 1.0))
            clip_strength = float(kwargs.get(_slot_key("clip_strength", index), 1.0))

            if current_model is not None and abs(model_strength) > 1e-9:
                patched_model = current_model.clone()
                patched_model.add_patches(loaded, model_strength)
                current_model = patched_model

            if current_clip is not None and abs(clip_strength) > 1e-9:
                patched_clip = current_clip.clone()
                patched_clip.add_patches(loaded, clip_strength)
                current_clip = patched_clip

        return (current_model, current_clip)
