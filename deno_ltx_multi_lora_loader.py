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


def _normalize_lora_key(key) -> str:
    if isinstance(key, str):
        return key
    if isinstance(key, tuple):
        return " ".join(str(part) for part in key)
    return str(key)


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


class DenoLTXMultiLoraLoader:
    DESCRIPTION = (
        "Stack multiple LTX LoRAs in one node with quick add/remove UX.\n"
        "Each slot controls overall, video, and audio strength in a compact Power LoRA Loader style UI.\n"
        "Save per-slot trigger words and notes, then copy trigger words from the node UI.\n"
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
            required[_slot_key("strength", index)] = (
                "FLOAT",
                {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01},
            )
            required[_slot_key("audio", index)] = (
                "FLOAT",
                {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.01},
            )
            required[_slot_key("video", index)] = (
                "FLOAT",
                {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.01},
            )

        for index in range(1, MAX_LORA_SLOTS + 1):
            required[_slot_key("trigger", index)] = ("STRING", {"default": "", "multiline": False})
            required[_slot_key("description", index)] = ("STRING", {"default": "", "multiline": True})

        # clip is OPTIONAL: load_multi_lora already fully handles clip=None
        # (model-only LoRA stacks, common for LTX). Declaring it required
        # forced a CLIP wire and made ComfyUI reject prompts that have none.
        # Only sockets are model + clip, so slot order (model=0, clip=1) is
        # unchanged -> existing saved workflows keep working.
        return {"required": required, "optional": {"clip": ("CLIP",)}}

    RETURN_TYPES = ("MODEL", "CLIP")
    RETURN_NAMES = ("model", "clip")
    FUNCTION = "load_multi_lora"
    CATEGORY = "Deno/LTX"

    def _apply_av_scaling(self, loaded, audio_scale: float, video_scale: float):
        if abs(audio_scale - 1.0) < 1e-9 and abs(video_scale - 1.0) < 1e-9:
            return loaded

        keys_to_delete = []

        for key, value in list(loaded.items()):
            key_str = _normalize_lora_key(key)
            if "audio_to_video_attn" in key_str:
                multiplier = audio_scale
            elif "video_to_audio_attn" in key_str:
                multiplier = video_scale
            elif "audio_attn" in key_str or "audio_ff.net" in key_str:
                multiplier = audio_scale
            elif "attn" in key_str or "ff.net" in key_str:
                multiplier = video_scale
            else:
                multiplier = 1.0

            if abs(multiplier) < 1e-9:
                keys_to_delete.append(key)
                continue

            if abs(multiplier - 1.0) < 1e-9:
                continue

            if hasattr(value, "weights"):
                weights_list = list(value.weights)
                alpha = weights_list[2]
                if alpha is None:
                    # ComfyUI's LoRAAdapter.calculate_weight treats alpha=None
                    # as an effective scale of 1.0, but a numeric alpha as
                    # alpha / rank. Seeding alpha with rank * multiplier makes
                    # it resolve back to exactly `multiplier` (not the
                    # rank-times-too-weak multiplier / rank).
                    try:
                        rank = int(weights_list[1].shape[0])
                    except Exception:
                        rank = 1
                    weights_list[2] = rank * multiplier
                else:
                    weights_list[2] = alpha * multiplier
                value.weights = tuple(weights_list)

        for key in keys_to_delete:
            loaded.pop(key, None)
        return loaded

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
                return f"LTX LoRA slot {index} is enabled but not installed: {lora_name}"

            error = _validate_range(kwargs, _slot_key("strength", index), f"LTX LoRA slot {index} strength", -10.0, 10.0)
            if error:
                return error
            error = _validate_range(kwargs, _slot_key("video", index), f"LTX LoRA slot {index} video strength", 0.0, 2.0)
            if error:
                return error
            error = _validate_range(kwargs, _slot_key("audio", index), f"LTX LoRA slot {index} audio strength", 0.0, 2.0)
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

            audio_scale = float(kwargs.get(_slot_key("audio", index), 1.0))
            video_scale = float(kwargs.get(_slot_key("video", index), 1.0))
            loaded = self._apply_av_scaling(loaded, audio_scale=audio_scale, video_scale=video_scale)

            strength = float(kwargs.get(_slot_key("strength", index), 1.0))
            if current_model is not None:
                patched_model = current_model.clone()
                patched_model.add_patches(loaded, strength)
                current_model = patched_model
            if current_clip is not None:
                patched_clip = current_clip.clone()
                patched_clip.add_patches(loaded, strength)
                current_clip = patched_clip

        return (current_model, current_clip)
