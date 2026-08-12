import inspect

from comfy_extras.nodes_lt import LTXVAddGuide
import torch

try:
    from comfy_extras.nodes_lt import get_noise_mask
except ImportError:
    # Older/custom Comfy builds may not expose get_noise_mask.
    # Keep import-time compatibility so the node and tests still load.
    def get_noise_mask(latent):
        if isinstance(latent, dict):
            return latent.get("noise_mask")
        return None

try:
    from comfy_extras.nodes_lt import _append_guide_attention_entry
except ImportError:
    # ComfyUI versions from before per-guide attention metadata remain supported.
    _append_guide_attention_entry = None


def _get_latent_index(conditioning, latent_length, guide_length, frame_idx, scale_factors, latent_shape):
    """Use the current Comfy signature without dropping compatibility with older cores."""
    try:
        parameters = inspect.signature(LTXVAddGuide.get_latent_index).parameters
    except (TypeError, ValueError):
        parameters = {}
    if "latent_shape" in parameters:
        return LTXVAddGuide.get_latent_index(
            conditioning,
            latent_length,
            guide_length,
            frame_idx,
            scale_factors,
            latent_shape=latent_shape,
        )
    return LTXVAddGuide.get_latent_index(
        conditioning,
        latent_length,
        guide_length,
        frame_idx,
        scale_factors,
    )


def _append_attention_entry(positive, negative, encoded_latent, strength):
    if _append_guide_attention_entry is None:
        return positive, negative
    latent_shape = list(encoded_latent.shape[2:])
    pre_filter_count = encoded_latent.shape[2] * encoded_latent.shape[3] * encoded_latent.shape[4]
    return _append_guide_attention_entry(
        positive,
        negative,
        pre_filter_count,
        latent_shape,
        strength=strength,
        attention_mask=None,
    )


class DenoLTXSequencer:
    DESCRIPTION = (
        "LTX sequencer with batch guide input and Deno sync-friendly widget layout.\n"
        "Strength values can be synced or left independent in the frontend.\n"
        "YouTube: https://www.youtube.com/@Denoise-AI"
    )
    CATEGORY = "Deno/LTX"
    FUNCTION = "execute"
    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "LATENT")
    RETURN_NAMES = ("positive", "negative", "latent")

    @classmethod
    def INPUT_TYPES(cls):
        required = {
            "positive": ("CONDITIONING",),
            "negative": ("CONDITIONING",),
            "vae": ("VAE",),
            "latent": ("LATENT",),
            "multi_input": ("IMAGE", {"lazy": True}),
            "num_images": ("INT", {"default": 1, "min": 0, "max": 50, "step": 1}),
            "insert_mode": (["frames", "seconds"], {"default": "frames"}),
            "frame_rate": ("INT", {"default": 24, "min": 1, "max": 120, "step": 1}),
            "strength_sync": ("BOOLEAN", {"default": True}),
            "bypass": ("BOOLEAN", {"default": False}),
        }

        optional = {}
        for index in range(1, 51):
            optional[f"insert_frame_{index}"] = ("INT", {"default": 0, "min": -9999, "max": 9999, "step": 1})
            optional[f"insert_second_{index}"] = ("FLOAT", {"default": 0.0, "min": 0.0, "max": 9999.0, "step": 0.1})
            optional[f"strength_{index}"] = ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01})

        return {"required": required, "optional": optional}

    @classmethod
    def check_lazy_status(cls, bypass, num_images, multi_input=None, **kwargs):
        if not bypass and int(num_images) > 0 and multi_input is None:
            return ["multi_input"]
        return []

    @classmethod
    def execute(
        cls,
        positive,
        negative,
        vae,
        latent,
        multi_input,
        num_images,
        insert_mode,
        frame_rate,
        strength_sync,
        bypass,
        **kwargs,
    ):
        if bypass:
            return (positive, negative, latent)

        requested_count = max(0, int(num_images))
        if requested_count <= 0:
            return (positive, negative, latent)
        if multi_input is None:
            raise ValueError("multi_input is required when LTX Sequencer guides are active.")

        batch_size = int(multi_input.shape[0])
        effective_count = min(requested_count, batch_size)
        if effective_count <= 0:
            return (positive, negative, latent)

        scale_factors = vae.downscale_index_formula
        # Keep parity with Comfy's LTXVAddGuide base behavior:
        # avoid cloning a large latent tensor up-front because append_keyframe
        # already returns new tensors via concatenation.
        latent_image = latent["samples"]
        noise_mask = get_noise_mask(latent)

        _, _, _, latent_height, latent_width = latent_image.shape
        applied_count = 0

        for index in range(1, effective_count + 1):
            image = multi_input[index - 1:index]
            frame_index = None
            if insert_mode == "frames":
                raw_frame_index = kwargs.get(f"insert_frame_{index}")
                if raw_frame_index not in (None, ""):
                    try:
                        frame_index = int(raw_frame_index)
                    except (TypeError, ValueError):
                        frame_index = None
            else:
                insert_seconds = kwargs.get(f"insert_second_{index}")
                if insert_seconds is not None:
                    try:
                        frame_index = int(float(insert_seconds) * frame_rate)
                    except (TypeError, ValueError):
                        frame_index = None

            if frame_index is None:
                continue

            raw_strength = kwargs.get(f"strength_{index}", 1.0)
            try:
                strength = float(raw_strength)
            except (TypeError, ValueError):
                strength = 1.0
            # Strength 0 means "do nothing": skip expensive VAE encode + keyframe append.
            if strength <= 0.0:
                continue
            if strength > 1.0:
                strength = 1.0

            encoded_image, encoded_latent = LTXVAddGuide.encode(vae, latent_width, latent_height, image, scale_factors)
            current_latent_length = latent_image.shape[2]
            conditioning_frame_idx, latent_idx = _get_latent_index(
                positive,
                current_latent_length,
                len(encoded_image),
                frame_index,
                scale_factors,
                latent_image.shape,
            )
            if latent_idx + encoded_latent.shape[2] > current_latent_length:
                raise ValueError(
                    "Conditioning frames exceed latent length: "
                    f"latent_idx={latent_idx}, "
                    f"encoded_len={encoded_latent.shape[2]}, "
                    f"latent_len={current_latent_length}."
                )

            positive, negative, latent_image, noise_mask = LTXVAddGuide.append_keyframe(
                positive,
                negative,
                conditioning_frame_idx,
                latent_image,
                noise_mask,
                encoded_latent,
                strength,
                scale_factors,
            )
            positive, negative = _append_attention_entry(
                positive,
                negative,
                encoded_latent,
                strength,
            )
            applied_count += 1

        if applied_count == 0:
            return (positive, negative, latent)
        return (positive, negative, {"samples": latent_image, "noise_mask": noise_mask})
