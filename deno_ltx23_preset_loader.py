import importlib.util
import os
import sys
from pathlib import Path
from typing import Iterable, List, Optional, Sequence

import folder_paths
import nodes


PIPELINE_MODES = ["Checkpoint Style", "KJ Style", "GGUF Style"]
DEVICE_CHOICES = ["default", "cpu"]
DTYPE_CHOICES = ["default", "fp16", "bf16", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"]
KJ_VAE_DEVICE = "main_device"
KJ_VAE_DTYPE = "bf16"


def _normalize_name(name: str) -> str:
    return (name or "").replace("\\", "/").strip()


def _basename(name: str) -> str:
    return os.path.basename(_normalize_name(name))


def _add_unique(items: List[str], value: str) -> None:
    if value and value not in items:
        items.append(value)


def _build_combo_options(folder_name: str, recommended: Sequence[str]) -> List[str]:
    options: List[str] = []
    for item in recommended:
        _add_unique(options, item)

    try:
        discovered = folder_paths.get_filename_list(folder_name)
    except Exception:
        discovered = []

    for item in discovered:
        _add_unique(options, item)

    if not options:
        options.append("__none__")
    return options


def _build_text_projection_options(recommended: Sequence[str]) -> List[str]:
    options: List[str] = []
    for item in recommended:
        _add_unique(options, item)

    try:
        discovered = folder_paths.get_filename_list("text_encoders")
    except Exception:
        discovered = []

    for item in discovered:
        _add_unique(options, item)

    if not options:
        options.append("__none__")
    return options


def _get_gguf_choices() -> List[str]:
    options: List[str] = []

    try:
        discovered = folder_paths.get_filename_list("unet_gguf")
    except Exception:
        discovered = []
    for item in discovered:
        _add_unique(options, item)

    for folder_name in ("diffusion_models", "unet"):
        try:
            discovered = folder_paths.get_filename_list(folder_name)
        except Exception:
            discovered = []
        for item in discovered:
            if item.lower().endswith(".gguf"):
                _add_unique(options, item)

    if not options:
        options.append("__none__")
    return options


def _find_custom_nodes_root() -> Path:
    this_path = Path(__file__).resolve()
    for parent in this_path.parents:
        if parent.name == "custom_nodes":
            return parent
    return this_path.parents[1]


def _extract_output_value(output_obj, node_name: str, index: int = 0):
    value = output_obj
    if hasattr(value, "result"):
        value = value.result

    if isinstance(value, (tuple, list)):
        if len(value) <= index:
            raise RuntimeError(f"{node_name} returned {len(value)} value(s), expected index {index}.")
        return value[index]

    if index == 0:
        return value

    raise RuntimeError(f"{node_name} did not return multiple values.")


def _load_ltx_audio_text_encoder(text_encoder_name: str, checkpoint_name: str, clip_device: str):
    from comfy_extras.nodes_lt_audio import LTXAVTextEncoderLoader

    output_obj = LTXAVTextEncoderLoader.execute(text_encoder_name, checkpoint_name, clip_device)
    return _extract_output_value(output_obj, "LTXAVTextEncoderLoader")


def _load_ltx_audio_vae(checkpoint_name: str):
    from comfy_extras.nodes_lt_audio import LTXVAudioVAELoader

    output_obj = LTXVAudioVAELoader.execute(checkpoint_name)
    return _extract_output_value(output_obj, "LTXVAudioVAELoader")


_GGUF_MODULE = None
_GGUF_LOAD_ERROR: Optional[Exception] = None


def _load_gguf_module():
    global _GGUF_MODULE, _GGUF_LOAD_ERROR
    if _GGUF_MODULE is not None:
        return _GGUF_MODULE
    if _GGUF_LOAD_ERROR is not None:
        raise _GGUF_LOAD_ERROR

    custom_nodes_dir = _find_custom_nodes_root()
    gguf_dir = custom_nodes_dir / "ComfyUI-GGUF"
    init_path = gguf_dir / "__init__.py"
    if not init_path.exists():
        _GGUF_LOAD_ERROR = RuntimeError("ComfyUI-GGUF is not installed. Install it to use GGUF Style.")
        raise _GGUF_LOAD_ERROR

    module_name = "deno_comfyui_gguf_bridge"
    if module_name in sys.modules:
        _GGUF_MODULE = sys.modules[module_name]
        return _GGUF_MODULE

    spec = importlib.util.spec_from_file_location(
        module_name,
        str(init_path),
        submodule_search_locations=[str(gguf_dir)],
    )
    if spec is None or spec.loader is None:
        _GGUF_LOAD_ERROR = RuntimeError("Failed to build import spec for ComfyUI-GGUF.")
        raise _GGUF_LOAD_ERROR

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        _GGUF_LOAD_ERROR = RuntimeError(f"Failed to import ComfyUI-GGUF: {exc}")
        raise _GGUF_LOAD_ERROR

    _GGUF_MODULE = module
    return module


_KJ_MODULE = None
_KJ_LOAD_ERROR: Optional[Exception] = None


def _load_kj_nodes_module():
    global _KJ_MODULE, _KJ_LOAD_ERROR
    if _KJ_MODULE is not None:
        return _KJ_MODULE
    if _KJ_LOAD_ERROR is not None:
        raise _KJ_LOAD_ERROR

    custom_nodes_dir = _find_custom_nodes_root()
    module_path = custom_nodes_dir / "comfyui-kjnodes" / "nodes" / "nodes.py"
    if not module_path.exists():
        _KJ_LOAD_ERROR = RuntimeError("comfyui-kjnodes is not installed. Install it to use KJ/GGUF Style.")
        raise _KJ_LOAD_ERROR

    module_name = "deno_comfyui_kjnodes_bridge"
    if module_name in sys.modules:
        _KJ_MODULE = sys.modules[module_name]
        return _KJ_MODULE

    spec = importlib.util.spec_from_file_location(module_name, str(module_path))
    if spec is None or spec.loader is None:
        _KJ_LOAD_ERROR = RuntimeError("Failed to build import spec for comfyui-kjnodes.")
        raise _KJ_LOAD_ERROR

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        _KJ_LOAD_ERROR = RuntimeError(f"Failed to import comfyui-kjnodes: {exc}")
        raise _KJ_LOAD_ERROR

    _KJ_MODULE = module
    return module


def _get_node_mapping_class(key: str):
    mapping = getattr(nodes, "NODE_CLASS_MAPPINGS", {})
    return mapping.get(key)


def _get_gguf_loader_class():
    cls = _get_node_mapping_class("UnetLoaderGGUFAdvanced") or _get_node_mapping_class("UnetLoaderGGUF")
    if cls is not None:
        return cls

    gguf_module = _load_gguf_module()
    mapping = getattr(gguf_module, "NODE_CLASS_MAPPINGS", {})
    cls = mapping.get("UnetLoaderGGUFAdvanced") or mapping.get("UnetLoaderGGUF")
    if cls is None:
        raise RuntimeError("ComfyUI-GGUF loader class not found.")
    return cls


def _get_kj_vae_loader_class():
    cls = _get_node_mapping_class("VAELoaderKJ")
    if cls is not None:
        return cls

    kj_module = _load_kj_nodes_module()
    cls = getattr(kj_module, "VAELoaderKJ", None)
    if cls is None:
        raise RuntimeError("VAELoaderKJ class not found in comfyui-kjnodes.")
    return cls


class DenoLTX23PresetLoader:
    DESCRIPTION = (
        "Unified LTX model loader for beginner workflows.\n"
        "Choose Checkpoint Style, KJ Style, or GGUF Style and output MODEL/CLIP/video+audio VAE from one node.\n"
        "YouTube: https://www.youtube.com/@Denoise-AI"
    )

    _RECOMMENDED_CHECKPOINTS = [
        "ltx-2.3-22b-dev.safetensors",
        "ltx-2.3-22b-dev-fp8.safetensors",
        "ltx-2.3-22b-distilled-1.1.safetensors",
        "ltx-2.3-22b-distilled-fp8.safetensors",
    ]
    _RECOMMENDED_TEXT_ENCODERS = [
        "comfy_gemma_3_12B_it.safetensors",
        "gemma_3_12B_it_fp4_mixed.safetensors",
        "gemma_3_12B_it_fp8_scaled.safetensors",
        "gemma_3_12B_it.safetensors",
    ]
    _RECOMMENDED_TEXT_PROJECTION = [
        "ltx-2.3-22b-dev.safetensors",
        "ltx-2.3-22b-dev-fp8.safetensors",
        "ltx-2.3_text_projection_bf16.safetensors",
    ]
    _RECOMMENDED_DIFFUSION = [
        "ltx-2.3-22b-dev_transformer_only_fp8_scaled.safetensors",
        "ltx-2.3-22b-dev_transformer_only_bf16.safetensors",
        "ltx-2.3-22b-distilled-1.1_transformer_only_fp8_scaled.safetensors",
        "ltx-2.3-22b-distilled-1.1_transformer_only_bf16.safetensors",
    ]
    _RECOMMENDED_VAE = [
        "LTX23_video_vae_bf16.safetensors",
        "LTX23_audio_vae_bf16.safetensors",
        "taeltx2_3.safetensors",
    ]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "pipeline_mode": (PIPELINE_MODES, {"default": "Checkpoint Style"}),
                "checkpoint_name": (
                    _build_combo_options("checkpoints", cls._RECOMMENDED_CHECKPOINTS),
                    {"default": cls._RECOMMENDED_CHECKPOINTS[0]},
                ),
                "diffusion_model_name": (
                    _build_combo_options("diffusion_models", cls._RECOMMENDED_DIFFUSION),
                    {"default": cls._RECOMMENDED_DIFFUSION[0]},
                ),
                "gguf_unet_name": (
                    _get_gguf_choices(),
                    {"default": _get_gguf_choices()[0]},
                ),
                "video_vae_name": (
                    _build_combo_options("vae", cls._RECOMMENDED_VAE),
                    {"default": "LTX23_video_vae_bf16.safetensors"},
                ),
                "audio_vae_name": (
                    _build_combo_options("vae", cls._RECOMMENDED_VAE),
                    {"default": "LTX23_audio_vae_bf16.safetensors"},
                ),
                "text_encoder_name": (
                    _build_combo_options("text_encoders", cls._RECOMMENDED_TEXT_ENCODERS),
                    {"default": cls._RECOMMENDED_TEXT_ENCODERS[1]},
                ),
                "text_projection_name": (
                    _build_text_projection_options(cls._RECOMMENDED_TEXT_PROJECTION),
                    {"default": cls._RECOMMENDED_TEXT_PROJECTION[2]},
                ),
                "clip_device": (DEVICE_CHOICES, {"default": "default"}),
                "weight_dtype": (DTYPE_CHOICES, {"default": "default"}),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "VAE")
    RETURN_NAMES = ("model", "clip", "video_vae", "audio_vae")
    FUNCTION = "load_ltx_model"
    CATEGORY = "Deno/LTX"

    def _load_kj_vaes(self, video_vae_name: str, audio_vae_name: str):
        vae_loader_cls = _get_kj_vae_loader_class()
        vae_loader = vae_loader_cls()

        video_vae = _extract_output_value(
            vae_loader.load_vae(video_vae_name, KJ_VAE_DEVICE, KJ_VAE_DTYPE),
            "VAELoaderKJ(video)",
        )
        audio_vae = _extract_output_value(
            vae_loader.load_vae(audio_vae_name, KJ_VAE_DEVICE, KJ_VAE_DTYPE),
            "VAELoaderKJ(audio)",
        )
        return video_vae, audio_vae

    def _load_checkpoint_style(
        self,
        checkpoint_name: str,
        text_encoder_name: str,
        clip_device: str,
    ):
        model, _clip_from_checkpoint, video_vae = nodes.CheckpointLoaderSimple().load_checkpoint(checkpoint_name)
        clip = _load_ltx_audio_text_encoder(text_encoder_name, checkpoint_name, clip_device)
        audio_vae = _load_ltx_audio_vae(checkpoint_name)
        return model, clip, video_vae, audio_vae

    def _load_kj_style(
        self,
        diffusion_model_name: str,
        text_encoder_name: str,
        text_projection_name: str,
        video_vae_name: str,
        audio_vae_name: str,
        clip_device: str,
        weight_dtype: str,
    ):
        model = nodes.UNETLoader().load_unet(diffusion_model_name, weight_dtype)[0]
        clip = nodes.DualCLIPLoader().load_clip(text_encoder_name, text_projection_name, "ltxv", clip_device)[0]
        video_vae, audio_vae = self._load_kj_vaes(video_vae_name, audio_vae_name)
        return model, clip, video_vae, audio_vae

    def _load_gguf_style(
        self,
        gguf_unet_name: str,
        text_encoder_name: str,
        text_projection_name: str,
        video_vae_name: str,
        audio_vae_name: str,
        clip_device: str,
    ):
        if gguf_unet_name == "__none__":
            raise RuntimeError("No GGUF UNet found. Install ComfyUI-GGUF and place *.gguf in models/unet.")

        loader_cls = _get_gguf_loader_class()
        loader = loader_cls()
        try:
            model = loader.load_unet(
                gguf_unet_name,
                dequant_dtype="default",
                patch_dtype="default",
                patch_on_device=False,
            )[0]
        except TypeError:
            model = loader.load_unet(gguf_unet_name)[0]

        clip = nodes.DualCLIPLoader().load_clip(text_encoder_name, text_projection_name, "ltxv", clip_device)[0]
        video_vae, audio_vae = self._load_kj_vaes(video_vae_name, audio_vae_name)
        return model, clip, video_vae, audio_vae

    def load_ltx_model(
        self,
        pipeline_mode: str,
        checkpoint_name: str,
        text_encoder_name: str,
        text_projection_name: str,
        diffusion_model_name: str,
        gguf_unet_name: str,
        video_vae_name: str,
        audio_vae_name: str,
        clip_device: str,
        weight_dtype: str,
    ):
        if pipeline_mode == "Checkpoint Style":
            model, clip, video_vae, audio_vae = self._load_checkpoint_style(
                checkpoint_name=checkpoint_name,
                text_encoder_name=text_encoder_name,
                clip_device=clip_device,
            )
        elif pipeline_mode == "KJ Style":
            model, clip, video_vae, audio_vae = self._load_kj_style(
                diffusion_model_name=diffusion_model_name,
                text_encoder_name=text_encoder_name,
                text_projection_name=text_projection_name,
                video_vae_name=video_vae_name,
                audio_vae_name=audio_vae_name,
                clip_device=clip_device,
                weight_dtype=weight_dtype,
            )
        else:
            model, clip, video_vae, audio_vae = self._load_gguf_style(
                gguf_unet_name=gguf_unet_name,
                text_encoder_name=text_encoder_name,
                text_projection_name=text_projection_name,
                video_vae_name=video_vae_name,
                audio_vae_name=audio_vae_name,
                clip_device=clip_device,
            )

        return (model, clip, video_vae, audio_vae)
