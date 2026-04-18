from comfy_extras.nodes_lt import LTXVAddGuide, get_noise_mask
import torch


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
            "multi_input": ("IMAGE",),
            "num_images": ("INT", {"default": 1, "min": 0, "max": 50, "step": 1}),
            "insert_mode": (["frames", "seconds"], {"default": "frames"}),
            "frame_rate": ("INT", {"default": 24, "min": 1, "max": 120, "step": 1}),
            "strength_sync": ("BOOLEAN", {"default": True}),
        }

        optional = {}
        for index in range(1, 51):
            optional[f"insert_frame_{index}"] = ("INT", {"default": 0, "min": -9999, "max": 9999, "step": 1})
            optional[f"insert_second_{index}"] = ("FLOAT", {"default": 0.0, "min": 0.0, "max": 9999.0, "step": 0.1})
            optional[f"strength_{index}"] = ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01})

        return {"required": required, "optional": optional}
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
        **kwargs,
    ):
        scale_factors = vae.downscale_index_formula
        # Keep parity with Comfy's LTXVAddGuide base behavior:
        # avoid cloning a large latent tensor up-front because append_keyframe
        # already returns new tensors via concatenation.
        latent_image = latent["samples"]
        noise_mask = get_noise_mask(latent)

        _, _, latent_length, latent_height, latent_width = latent_image.shape
        batch_size = int(multi_input.shape[0]) if multi_input is not None else 0
        effective_count = max(0, min(int(num_images), batch_size))

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
            conditioning_frame_idx, latent_idx = LTXVAddGuide.get_latent_index(
                positive, latent_length, len(encoded_image), frame_index, scale_factors
            )
            assert latent_idx + encoded_latent.shape[2] <= latent_length, "Conditioning frames exceed latent length."

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

        return (positive, negative, {"samples": latent_image, "noise_mask": noise_mask})
