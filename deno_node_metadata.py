"""Shared DENO node metadata for ComfyUI object_info and node help UI."""

from __future__ import annotations

import copy
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - Python < 3.11
    tomllib = None


PACKAGE_NAME = "deno-custom-nodes"


def get_current_version() -> str:
    pyproject_path = Path(__file__).with_name("pyproject.toml")
    if tomllib is None or not pyproject_path.exists():
        return "unknown"
    try:
        data = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))
        return str(data.get("project", {}).get("version") or "unknown")
    except Exception:
        return "unknown"


def _version_description_prefix() -> str:
    current = get_current_version()
    return (
        f"DENO Custom Nodes v{current}.\n"
        "The DENO info button checks Comfy Registry and marks this node when an update is available."
    )


def _with_version_prefix(description: str) -> str:
    description = str(description or "").strip()
    prefix = _version_description_prefix()
    if description.startswith("DENO Custom Nodes v"):
        return description
    return f"{prefix}\n\n{description}" if description else prefix


NODE_INPUT_TOOLTIPS = {
    "DenoResolutionSetup": {
        "mode": "Choose how the output size is decided: preset ratio, manual width/height, or the input image ratio.",
        "ratio_preset": "Target aspect ratio used in Preset Ratio mode.",
        "megapixels": "Target total image size in megapixels for automatic sizing modes.",
        "width": "Manual or fallback output width in pixels.",
        "height": "Manual or fallback output height in pixels.",
        "divisible_by": "Round the final size to a model-safe multiple such as 16 or 32.",
        "resize_method": "Choose crop-fill or fit/letterbox behavior when resizing an input image.",
        "interpolation": "Resize filter. Lanczos is the default quality choice.",
        "image": "Optional source image. If empty, the node creates a blank image at the selected size.",
    },
    "DenoMultiImageLoader": {
        "image_paths": "Selected image file list managed by the node UI.",
        "mode": "Choose how each image is resized before the batch output is built.",
        "ratio_preset": "Target aspect ratio used in Preset Ratio mode.",
        "megapixels": "Target total image size in megapixels for automatic sizing modes.",
        "width": "Manual or fallback output width in pixels.",
        "height": "Manual or fallback output height in pixels.",
        "divisible_by": "Round the final batch size to a model-safe multiple.",
        "interpolation": "Resize filter. Lanczos is the default quality choice.",
        "resize_method": "Choose crop-fill or fit/letterbox behavior for loaded images.",
    },
    "DenoAdvancedImageSourceLoader": {
        "image_paths": "Files, folders, absolute paths, or web URLs selected by the advanced source UI.",
        "mode": "Choose how images are resized for the batch output.",
        "ratio_preset": "Target aspect ratio used in Preset Ratio mode.",
        "megapixels": "Target total image size in megapixels for automatic sizing modes.",
        "width": "Manual or fallback output width in pixels.",
        "height": "Manual or fallback output height in pixels.",
        "divisible_by": "Round the final batch size to a model-safe multiple.",
        "interpolation": "Resize filter. Lanczos is the default quality choice.",
        "resize_method": "Choose crop-fill, fit, or advanced size handling for loaded images.",
        "recursive_folders": "Include image files found inside subfolders.",
        "list_output_mode": "Choose whether the image_list output keeps original sizes or matches the batch size.",
        "disabled_image_paths": "Saved skipped sources. Managed by the UI when you disable items.",
        "images": "Optional incoming images to merge with the selected file/path sources.",
    },
    "DenoLTXSequencer": {
        "positive": "Base positive LTX conditioning before guide images are inserted.",
        "negative": "Base negative LTX conditioning before guide images are inserted.",
        "vae": "VAE used to encode the guide/reference images into the LTX latent space.",
        "latent": "LTX latent timeline that receives the guide image keyframes.",
        "multi_input": "Batch of guide/reference images to insert into the LTX sequence.",
        "num_images": "How many images from the batch to use.",
        "insert_mode": "Choose whether insertion positions are entered as frame numbers or seconds.",
        "frame_rate": "Frame rate used to convert seconds into frame positions.",
        "strength_sync": "Keep guide strengths synced across sequencer nodes when the frontend sync tool is used.",
        "bypass": "Pass positive, negative, and latent through unchanged.",
    },
    "DenoLTX23PresetLoader": {
        "pipeline_mode": "Choose Checkpoint Style, KJ Style, or GGUF Style loading.",
        "checkpoint_name": "Full checkpoint file used by Checkpoint Style.",
        "diffusion_model_name": "LTX diffusion/transformer model used by KJ Style.",
        "gguf_unet_name": "GGUF LTX model used by GGUF Style.",
        "video_vae_name": "Video VAE for LTX video latents.",
        "audio_vae_name": "Audio VAE for LTX audio latents.",
        "text_encoder_name": "Gemma/text encoder file used to build the CLIP output.",
        "text_projection_name": "Text projection file used with KJ/GGUF style loading.",
        "clip_device": "Device choice for the text encoder. Default is recommended for most users.",
        "weight_dtype": "Weight dtype for KJ diffusion loading. Default is recommended for most users.",
    },
    "DenoLTXModelDownloader": {
        "model_root": "ComfyUI models root where the helper checks target files.",
        "presets_json": "Saved preset/package list for the helper panel. Advanced users can edit it manually.",
    },
    "DenoMultiLoraLoader": {
        "model": "Base diffusion model that enabled LoRAs are applied to.",
        "clip": "Optional base CLIP model. Connect it when your LoRAs also affect CLIP.",
        "active_loras": "Number of LoRA slots shown by the frontend UI.",
    },
    "DenoLTXMultiLoraLoader": {
        "model": "Base LTX model that enabled LoRAs are applied to.",
        "clip": "Optional CLIP model to pass through or patch when a LoRA affects CLIP.",
        "active_loras": "Number of LTX LoRA slots shown by the frontend UI.",
    },
    "DenoLTXPromptGuide": {
        "clip": "LTX text encoder/CLIP used to encode the prompts.",
        "positive_prompt": "Main editable LTX prompt text.",
        "language": "Language used only for the dialogue-duration estimate, not translation.",
        "frame_rate": "Frame-rate value added to the LTX conditioning and returned for downstream timing.",
        "show_negative_prompt": "Saved Show/Hide state for the negative prompt area.",
        "negative_prompt": "Editable negative prompt text.",
    },
    "DenoLTXTiledSpatialUpscaler": {
        "samples": "Video-only LTX latent to upscale. AV combined latents should be separated before this node.",
        "upscale_model": "LTX latent spatial upscaler model.",
        "vae": "LTX VAE used for the latent channel statistics around the upscaler.",
        "horizontal_tiles": "Frame width split count. 2 means left and right tiles.",
        "vertical_tiles": "Frame height split count. 3 means top, middle, and bottom tiles.",
        "overlap": "Overlap in input latent tokens. Larger values blend more context but use more time.",
        "blend_mode": "Overlap weighting curve. Hann is the recommended starting point.",
        "aggressive_memory_cleanup": "Run extra cleanup between tiles. This can be much slower, but may help fragmented VRAM or OOM cases.",
        "debug": "Print tile plan and shape diagnostics to the ComfyUI console.",
    },
    "DenoLTXAVStepFusedTiledSampler": {
        "noise": "Noise source used once for the global AV sampler trajectory.",
        "guider": "BasicGuider or CFGGuider for the LTX AV second pass.",
        "sampler": "ComfyUI sampler object. The node keeps the sampler update global.",
        "sigmas": "Sigma schedule for the low-denoise AV second-pass refinement.",
        "latent_image": "LTX AV nested latent containing video and audio. Video is tiled; audio is kept unchanged.",
        "horizontal_tiles": "Frame width split count. 2 means left and right tiles.",
        "vertical_tiles": "Frame height split count. 3 means top, middle, and bottom tiles.",
        "overlap": "Overlap in latent video tokens for each model-prediction tile.",
        "audio_mode": "Freeze keeps audio unchanged while still using it as context for video denoising.",
        "blend_mode": "Overlap weighting curve. Hann is the recommended starting point.",
        "aggressive_memory_cleanup": "Run extra cleanup between AV tile predictions. This can be much slower, but may help fragmented VRAM or OOM cases.",
        "debug": "Print AV hook calls, sigma labels, and tile diagnostics to the ComfyUI console.",
    },
    "DenoBerniniPromptGuide": {
        "clip": "Wan/Bernini text encoder or CLIP used to encode the prompts.",
        "task_type": "System Prompt mode for the Bernini/KJ-style instruction prefix.",
        "positive_prompt": "Editable instruction prompt. Write it like a clear chatbot instruction.",
        "reference_prompt_helper": "Adds a short image0/image1/image2 reference naming hint for reference modes.",
        "negative_preset": "Preset used to fill the visible negative prompt box.",
        "show_negative_prompt": "Saved Show/Hide state for the negative prompt area.",
        "negative_prompt": "Editable negative prompt text that is actually encoded.",
    },
    "DenoIdeogramDirector": {
        "width": "Output image width passed downstream.",
        "height": "Output image height passed downstream.",
        "seed": "Seed value passed downstream. The Director Fixed/Random control manages it.",
        "high_level_description": "Short whole-scene summary used in the Ideogram JSON prompt.",
        "background": "Background or setting description used in the Ideogram JSON prompt.",
        "style_mode": "Choose no style block, photo style, or art style.",
        "aesthetics": "General visual mood or aesthetic notes for the style block.",
        "lighting": "Lighting notes for the style block.",
        "medium": "Medium/material notes for art-style prompts.",
        "photo": "Photography notes used when Photo style is active.",
        "art_style": "Art style notes used when Art style is active.",
        "backdrop": "Shown on the board as a layout backdrop to trace over. It is not used for generation.",
        "import_mode": "How connected JSON should handle an existing board.",
        "caption_data": "Internal saved board state managed by the editor. Do not edit it by hand.",
        "seed_lock": "Saved Fixed/Random seed state used by the Director UI.",
        "auto_save": "Save the latest generated result automatically when enabled.",
        "save_prefix": "Filename prefix used by Save Image / Auto-save.",
        "aspect_ratio": "Ratio label derived from the selected output size.",
        "include_aspect_ratio": "Advanced compatibility toggle. Normally off because width/height carry the real shape.",
        "translate_output": "Final prompt language mode. Board text can stay in your language while output becomes English.",
        "view_language": "Language used to read and edit the board UI descriptions.",
        "translation_engine": "Translation engine used when refreshing board language or final English output.",
        "libretranslate_url": "Custom LibreTranslate server URL, used only when the custom engine is selected.",
        "import_json": "Optional connected JSON prompt from an upstream LLM or Prompt Text node.",
    },
    "DenoLocalLLMRefiner": {
        "provider": "Choose the local provider to call: Ollama or LM Studio.",
        "ollama_model": "Ollama model name detected from your local Ollama server.",
        "lm_studio_model": "LM Studio model name detected from your local LM Studio server.",
        "custom_server_url": "Legacy compatibility field. Current workflow uses the built-in local Ollama/LM Studio endpoints.",
        "custom_model": "Legacy compatibility field kept only so old workflows do not lose saved values.",
        "system_prompt": "Optional instructions that steer how the local LLM rewrites or reviews the prompt.",
        "thinking": "Ask for model thinking/reasoning when the selected local model supports it.",
        "seed": "Seed used for local LLM generation.",
        "seed_mode": "How the visible seed changes after each queued run.",
        "model_memory": "Choose whether the local model unloads after the run or stays warm.",
        "keep_minutes": "How long to keep the local model loaded when Keep loaded is selected.",
        "comfy_vram_policy": "Choose whether ComfyUI models should be unloaded before local LLM work.",
        "prompt": "Main prompt text. The in-node textarea and STRING socket feed this same backend input.",
        "image": "Optional image sent to a vision-capable local model.",
    },
    "DenoAIReviewGate": {
        "review": "Text or JSON verdict from a reviewer LLM or text node.",
        "review_mode": "Review checks the verdict text. Pass bypasses the review gate.",
        "approve_once": "One-shot approval state controlled by the node button.",
        "image": "Optional image to pass through only when the review approves it.",
        "audio": "Optional audio to pass through together with the approved image/media result.",
        "reviewer_state": "Internal reviewer snapshot used by the frontend buttons.",
    },
    "DenoPromptText": {
        "text": "Multiline prompt, system prompt, template, or JSON text to connect into other nodes.",
    },
    "DenoRTXVFXEasyUpscale": {
        "images": "Input image or video frame batch to enhance with NVIDIA RTX VFX.",
        "mode": "RTX VFX operation: upscale, high bitrate, denoise, or deblur.",
        "resize_type": "How the output size is chosen for resize-capable modes.",
        "scale": "Scale multiplier used by scale-based resizing.",
        "megapixels": "Target total output size in megapixels for ratio-based resizing.",
        "width": "Manual output width in pixels.",
        "height": "Manual output height in pixels.",
        "divisible_by": "Round output dimensions to a VFX/model-safe multiple.",
        "device": "GPU device index for NVIDIA VFX.",
        "ratio_preset": "Target aspect ratio used in preset-ratio resize mode.",
        "resize_method": "Choose crop-fill or fit/letterbox behavior when changing aspect ratio.",
    },
    "DenoRTXVFXVideoFinisher": {
        "images": "Input video frame batch to finish with one or two RTX VFX passes.",
        "first_pass": "Optional same-size first pass, usually denoise or deblur.",
        "first_quality": "Quality/strength for the first pass.",
        "upscale_pass": "Second pass operation, usually RTX Video Super Resolution.",
        "upscale_quality": "Quality/strength for the upscale pass.",
        "resize_type": "How the final output size is chosen.",
        "scale": "Scale multiplier used by scale-based resizing.",
        "megapixels": "Target total output size in megapixels for ratio-based resizing.",
        "width": "Manual output width in pixels.",
        "height": "Manual output height in pixels.",
        "divisible_by": "Round output dimensions to a VFX/model-safe multiple.",
        "ratio_preset": "Target aspect ratio used in preset-ratio resize mode.",
        "resize_method": "Choose crop-fill or fit/letterbox behavior when changing aspect ratio.",
    },
    "DenoImageCompare": {
        "mode": "Comparison view: slider, side-by-side, difference, toggle, or swap-oriented view.",
        "split_position": "Slider split position between image A and image B.",
        "toggle_image": "Which image is shown first in Toggle mode.",
        "swap": "Swap A and B before previewing.",
        "image_a": "First image batch for comparison.",
        "image_b": "Second image batch for comparison.",
    },
    "DenoVideoCompare": {
        "mode": "Comparison view for two video frame batches.",
        "split_position": "Slider split position between video A and video B.",
        "toggle_image": "Which video is shown first in Toggle mode.",
        "swap": "Swap A and B before previewing or outputting.",
        "fps": "Preview frame rate for playback.",
        "burn_labels": "Burn A/B labels into the output frames.",
        "video_a": "First video frame batch.",
        "video_b": "Second video frame batch.",
        "audio_a": "Optional audio for video A preview sync.",
        "audio_b": "Optional audio for video B preview sync.",
    },
    "DenoVideoPreview": {
        "images": "Image frame batch to preview as a video.",
        "frame_rate": "Playback frame rate for the preview video.",
        "audio": "Optional audio attached to the temporary preview video.",
    },
}


NODE_OUTPUT_TOOLTIPS = {
    "DenoResolutionSetup": (
        "Resized image, or a blank image if no input image was connected.",
        "Final output width in pixels.",
        "Final output height in pixels.",
    ),
    "DenoMultiImageLoader": (
        "Loaded images resized into one same-size IMAGE batch.",
        "Final batch width in pixels.",
        "Final batch height in pixels.",
    ),
    "DenoAdvancedImageSourceLoader": (
        "Loaded sources resized into one same-size IMAGE batch.",
        "Loaded sources as an IMAGE list for workflows that accept different-sized images.",
        "Final batch width in pixels.",
        "Final batch height in pixels.",
        "Number of images loaded from all active sources.",
    ),
    "DenoLTXSequencer": (
        "Positive conditioning with guide-image timing inserted.",
        "Negative conditioning matching the sequenced positive conditioning.",
        "Latent timeline with guide frames appended.",
    ),
    "DenoLTX23PresetLoader": (
        "Loaded LTX model.",
        "Loaded text encoder / CLIP stack.",
        "Video VAE for LTX video latents.",
        "Audio VAE for LTX audio latents.",
    ),
    "DenoMultiLoraLoader": (
        "Model after all enabled LoRA slots are applied.",
        "CLIP after enabled CLIP LoRA changes, or the original/empty CLIP passthrough.",
    ),
    "DenoLTXMultiLoraLoader": (
        "LTX model after all enabled LoRA slots are applied.",
        "CLIP after enabled LoRA changes, or the original/empty CLIP passthrough.",
    ),
    "DenoLTXPromptGuide": (
        "Encoded positive conditioning with LTX frame-rate metadata.",
        "Encoded negative conditioning with LTX frame-rate metadata.",
        "Frame-rate integer passthrough for downstream timing nodes.",
    ),
    "DenoLTXTiledSpatialUpscaler": (
        "Upscaled video latent reconstructed from overlapping spatial tiles.",
    ),
    "DenoLTXAVStepFusedTiledSampler": (
        "Refined AV latent. Video is tiled and audio is preserved from the input.",
        "Denoised AV latent from the callback x0. Video is x0 and audio is preserved from the input.",
    ),
    "DenoBerniniPromptGuide": (
        "Encoded positive conditioning for the Bernini/KJ workflow.",
        "Encoded negative conditioning for the Bernini/KJ workflow.",
    ),
    "DenoIdeogramDirector": (
        "Minified Ideogram JSON prompt to connect into positive CLIPTextEncode.",
        "Selected output width in pixels.",
        "Selected output height in pixels.",
        "Selected seed value.",
        "Drawn board boxes as downstream BBOX data.",
    ),
    "DenoLocalLLMRefiner": (
        "Local LLM answer or extracted final prompt. Batched prompts return a STRING list.",
    ),
    "DenoAIReviewGate": (
        "Original image passed through only when the review approves it.",
        "Original audio passed through only when the review approves it.",
    ),
    "DenoPromptText": (
        "The same text as a connectable STRING output.",
    ),
    "DenoRTXVFXEasyUpscale": (
        "RTX VFX enhanced frame batch.",
    ),
    "DenoRTXVFXVideoFinisher": (
        "Final RTX VFX enhanced frame batch.",
    ),
    "DenoVideoCompare": (
        "Composited comparison frame batch.",
    ),
    "DenoVideoPreview": (
        "Unchanged input frames passed through after preview creation.",
    ),
}


def _pattern_tooltip(node_id: str, input_name: str) -> str:
    if node_id == "DenoLTXSequencer":
        if input_name.startswith("insert_frame_"):
            index = input_name.rsplit("_", 1)[-1]
            return f"Frame position for guide image {index} when Insert Mode is frames."
        if input_name.startswith("insert_second_"):
            index = input_name.rsplit("_", 1)[-1]
            return f"Second position for guide image {index} when Insert Mode is seconds."
        if input_name.startswith("strength_"):
            index = input_name.rsplit("_", 1)[-1]
            return f"Guide strength for image {index}."
    if node_id == "DenoMultiLoraLoader":
        return _multi_lora_slot_tooltip(input_name, ltx=False)
    if node_id == "DenoLTXMultiLoraLoader":
        return _multi_lora_slot_tooltip(input_name, ltx=True)
    return ""


def _multi_lora_slot_tooltip(input_name: str, ltx: bool) -> str:
    if "_" not in input_name:
        return ""
    prefix, _, raw_index = input_name.rpartition("_")
    if not raw_index.isdigit():
        return ""
    index = raw_index
    if prefix == "enabled":
        return f"Enable or skip LoRA slot {index}."
    if prefix == "lora":
        return f"LoRA file used by slot {index}."
    if prefix == "trigger":
        return f"Trigger words saved for slot {index}; useful for copying into prompts."
    if prefix == "description":
        return f"User notes saved for LoRA slot {index}."
    if ltx:
        if prefix == "strength":
            return f"Overall LoRA strength for LTX slot {index}."
        if prefix == "audio":
            return f"Audio-module scale for LTX LoRA slot {index}."
        if prefix == "video":
            return f"Video-module scale for LTX LoRA slot {index}."
    else:
        if prefix == "model_strength":
            return f"Model strength for LoRA slot {index}."
        if prefix == "clip_strength":
            return f"CLIP strength for LoRA slot {index}."
    return ""


def _tooltip_for(node_id: str, input_name: str) -> str:
    return NODE_INPUT_TOOLTIPS.get(node_id, {}).get(input_name) or _pattern_tooltip(node_id, input_name)


def _inject_input_tooltips(node_id: str, input_types: dict) -> dict:
    cloned = copy.deepcopy(input_types)
    for section in ("required", "optional"):
        entries = cloned.get(section)
        if not isinstance(entries, dict):
            continue
        for input_name, spec in list(entries.items()):
            tooltip = _tooltip_for(node_id, input_name)
            if not tooltip:
                continue
            if isinstance(spec, tuple):
                parts = list(spec)
                if len(parts) >= 2 and isinstance(parts[1], dict):
                    parts[1] = {**parts[1], "tooltip": tooltip}
                else:
                    parts.append({"tooltip": tooltip})
                entries[input_name] = tuple(parts)
            elif isinstance(spec, list):
                parts = list(spec)
                if len(parts) >= 2 and isinstance(parts[1], dict):
                    parts[1] = {**parts[1], "tooltip": tooltip}
                else:
                    parts.append({"tooltip": tooltip})
                entries[input_name] = parts
    return cloned


def decorate_node_classes(node_class_mappings: dict) -> None:
    for node_id, node_cls in node_class_mappings.items():
        node_cls.DESCRIPTION = _with_version_prefix(getattr(node_cls, "DESCRIPTION", ""))
        output_tooltips = NODE_OUTPUT_TOOLTIPS.get(node_id)
        if output_tooltips:
            node_cls.OUTPUT_TOOLTIPS = tuple(output_tooltips)

        if getattr(node_cls, "_deno_metadata_wrapped", False):
            continue

        original_input_types = node_cls.INPUT_TYPES

        @classmethod
        def _input_types_with_deno_metadata(cls, _node_id=node_id, _original=original_input_types):
            return _inject_input_tooltips(_node_id, _original())

        node_cls.INPUT_TYPES = _input_types_with_deno_metadata
        node_cls._deno_metadata_wrapped = True
