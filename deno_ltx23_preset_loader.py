import importlib.util
import inspect
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
RECOMMENDED_GGUF_UNETS = [
    "LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf",
    "LTX-2.3-22B-distilled-1.1-Q2_K.gguf",
    "ltx-2.3-22b-dev-Q4_K_M.gguf",
]
GGUF_INSTALL_MESSAGE = (
    "[Deno] GGUF Style requires the ComfyUI-GGUF custom node.\n"
    "Install 'ComfyUI-GGUF' from ComfyUI Manager, restart ComfyUI completely, then run again.\n"
    "This Deno node is a workflow helper; the GGUF loading engine is provided by ComfyUI-GGUF."
)
KJ_INSTALL_MESSAGE = (
    "[Deno] KJ/GGUF Style requires the comfyui-kjnodes custom node.\n"
    "Install 'comfyui-kjnodes' from ComfyUI Manager, restart ComfyUI completely, then run again.\n"
    "This Deno node uses KJNodes for the LTX video/audio VAE loaders."
)
NONE_OPTION = "__none__"
COMFY_METADATA_MESSAGE = (
    "[Deno] GGUF Style requires a newer ComfyUI core with diffusion-model metadata support.\n"
    "Update ComfyUI, update ComfyUI-GGUF, restart ComfyUI completely, then run again."
)


def _normalize_name(name: str) -> str:
    return (name or "").replace("\\", "/").strip()


def _basename(name: str) -> str:
    return os.path.basename(_normalize_name(name))


def _add_unique(items: List[str], value: str) -> None:
    if value and value not in items:
        items.append(value)


def _find_existing_choice(options: Sequence[str], desired: str) -> Optional[str]:
    desired_norm = _normalize_name(desired).casefold()
    for item in options:
        if _normalize_name(item).casefold() == desired_norm:
            return item

    desired_base = _basename(desired).casefold()
    basename_matches = [
        item for item in options if _basename(item).casefold() == desired_base
    ]
    if len(basename_matches) == 1:
        return basename_matches[0]
    return None


def _ordered_existing_options(discovered: Sequence[str], recommended: Sequence[str]) -> List[str]:
    options: List[str] = []
    for item in recommended:
        existing = _find_existing_choice(discovered, item)
        if existing:
            _add_unique(options, existing)

    for item in discovered:
        _add_unique(options, item)

    if not options:
        options.append(NONE_OPTION)
    return options


def _default_existing_choice(
    options: Sequence[str],
    preferred: Sequence[str],
    *,
    fallback_to_first: bool = False,
) -> str:
    for item in preferred:
        existing = _find_existing_choice(options, item)
        if existing and existing != NONE_OPTION:
            return existing
    if fallback_to_first:
        for item in options:
            if item != NONE_OPTION:
                return item
    return NONE_OPTION


def _combo_options_with_default(
    options: Sequence[str],
    preferred: Sequence[str],
    *,
    fallback_to_first: bool = False,
) -> tuple[List[str], str]:
    normalized_options = list(options)
    default = _default_existing_choice(
        normalized_options,
        preferred,
        fallback_to_first=fallback_to_first,
    )
    if default == NONE_OPTION and NONE_OPTION not in normalized_options:
        normalized_options.insert(0, NONE_OPTION)
    return normalized_options, default


def _build_combo_options(folder_name: str, recommended: Sequence[str]) -> List[str]:
    try:
        discovered = folder_paths.get_filename_list(folder_name)
    except Exception:
        discovered = []

    return _ordered_existing_options(discovered, recommended)


def _build_text_projection_options(recommended: Sequence[str]) -> List[str]:
    try:
        discovered = folder_paths.get_filename_list("text_encoders")
    except Exception:
        discovered = []

    return _ordered_existing_options(discovered, recommended)


def _normalize_pipeline_mode(pipeline_mode: str) -> str:
    mode = (pipeline_mode or "").strip()
    if mode in PIPELINE_MODES:
        return mode
    raise RuntimeError(
        f"[Deno] Unknown LTX pipeline mode: {pipeline_mode!r}.\n"
        "Reload the workflow, select Checkpoint/KJ/GGUF Style again, then run it once more."
    )


def _require_selected(value: str, field_name: str, pipeline_mode: str) -> str:
    normalized = _normalize_name(value)
    if not normalized or normalized == NONE_OPTION:
        raise RuntimeError(
            f"[Deno] {pipeline_mode} requires '{field_name}', but no valid model is selected.\n"
            "Select the missing LTX model in the loader, press R to refresh model lists if needed, then run again."
        )
    return value


def _require_extension(value: str, field_name: str, extension: str, pipeline_mode: str) -> str:
    selected = _require_selected(value, field_name, pipeline_mode)
    if not _normalize_name(selected).casefold().endswith(extension.casefold()):
        raise RuntimeError(
            f"[Deno] {pipeline_mode} expects '{field_name}' to be a {extension} file, got: {selected!r}.\n"
            "This can happen when an older workflow loads with shifted widget values. "
            "Reload the workflow after updating the Deno node, then reselect the model if it still looks wrong."
        )
    return selected


def _validation_missing_message(field_name: str, pipeline_mode: str) -> str:
    return (
        f"[Deno] {pipeline_mode} requires '{field_name}', but no valid model is selected. "
        "Refresh the model list, then select the missing file again."
    )


def _validate_required_model(
    value: str,
    field_name: str,
    pipeline_mode: str,
    folder_names: Sequence[str],
    *,
    extension: str | None = None,
) -> str | None:
    selected = _normalize_name(value)
    if not selected or selected == NONE_OPTION:
        return _validation_missing_message(field_name, pipeline_mode)
    if extension and not selected.casefold().endswith(extension.casefold()):
        return (
            f"[Deno] {pipeline_mode} expects '{field_name}' to be a {extension} file, got: {value!r}. "
            "Reload the workflow after updating the Deno node, then reselect the model if needed."
        )

    for folder_name in folder_names:
        try:
            if folder_paths.get_full_path(folder_name, value):
                return None
        except Exception:
            continue

    return (
        f"[Deno] {pipeline_mode} selected '{field_name}' is not installed or is no longer in ComfyUI's model list: "
        f"{value!r}. Refresh the model list, then select an available file."
    )


def _validate_choice(value: str, field_name: str, choices: Sequence[str]) -> str | None:
    if value in choices:
        return None
    return f"[Deno] Invalid LTX '{field_name}' value: {value!r}."


def _get_gguf_choices() -> List[str]:
    discovered_options: List[str] = []
    try:
        discovered = folder_paths.get_filename_list("unet_gguf")
    except Exception:
        discovered = []
    for item in discovered:
        _add_unique(discovered_options, item)

    for folder_name in ("diffusion_models", "unet"):
        try:
            discovered = folder_paths.get_filename_list(folder_name)
        except Exception:
            discovered = []
        for item in discovered:
            if item.lower().endswith(".gguf"):
                _add_unique(discovered_options, item)

    return _ordered_existing_options(discovered_options, RECOMMENDED_GGUF_UNETS)


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


def _load_ltx_audio_vae_file(audio_vae_name: str):
    import comfy.utils
    from comfy.sd import VAE

    vae_path = folder_paths.get_full_path_or_raise("vae", audio_vae_name)
    sd, metadata = comfy.utils.load_torch_file(vae_path, return_metadata=True)
    sd_audio = comfy.utils.state_dict_prefix_replace(
        dict(sd),
        {"audio_vae.": "autoencoder.", "vocoder.": "vocoder."},
        filter_keys=True,
    )
    vae = VAE(sd=sd_audio, metadata=metadata)
    vae.throw_exception_if_invalid()
    return vae


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
        _GGUF_LOAD_ERROR = RuntimeError(GGUF_INSTALL_MESSAGE)
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
        _GGUF_LOAD_ERROR = RuntimeError(
            "[Deno] ComfyUI-GGUF was found, but it could not be loaded.\n"
            "Update or reinstall ComfyUI-GGUF from ComfyUI Manager, then restart ComfyUI."
        )
        raise _GGUF_LOAD_ERROR

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        _GGUF_LOAD_ERROR = RuntimeError(
            "[Deno] ComfyUI-GGUF is installed, but failed to import.\n"
            "Update or reinstall ComfyUI-GGUF from ComfyUI Manager, then restart ComfyUI.\n"
            f"Original import error: {exc}"
        )
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
        _KJ_LOAD_ERROR = RuntimeError(KJ_INSTALL_MESSAGE)
        raise _KJ_LOAD_ERROR

    module_name = "deno_comfyui_kjnodes_bridge"
    if module_name in sys.modules:
        _KJ_MODULE = sys.modules[module_name]
        return _KJ_MODULE

    spec = importlib.util.spec_from_file_location(module_name, str(module_path))
    if spec is None or spec.loader is None:
        _KJ_LOAD_ERROR = RuntimeError(
            "[Deno] comfyui-kjnodes was found, but it could not be loaded.\n"
            "Update or reinstall comfyui-kjnodes from ComfyUI Manager, then restart ComfyUI."
        )
        raise _KJ_LOAD_ERROR

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        _KJ_LOAD_ERROR = RuntimeError(
            "[Deno] comfyui-kjnodes is installed, but failed to import.\n"
            "Update or reinstall comfyui-kjnodes from ComfyUI Manager, then restart ComfyUI.\n"
            f"Original import error: {exc}"
        )
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
        raise RuntimeError(
            "[Deno] ComfyUI-GGUF is installed, but its GGUF UNet loader was not found.\n"
            "Update ComfyUI-GGUF from ComfyUI Manager, restart ComfyUI completely, then run again."
        )
    return cls


def _get_kj_vae_loader_class():
    cls = _get_node_mapping_class("VAELoaderKJ")
    if cls is not None:
        return cls

    kj_module = _load_kj_nodes_module()
    cls = getattr(kj_module, "VAELoaderKJ", None)
    if cls is None:
        raise RuntimeError(
            "[Deno] comfyui-kjnodes is installed, but VAELoaderKJ was not found.\n"
            "Update comfyui-kjnodes from ComfyUI Manager, restart ComfyUI completely, then run again."
        )
    return cls


def _assert_comfy_supports_ltx23_gguf_metadata():
    try:
        import comfy.sd
    except Exception as exc:
        raise RuntimeError(
            "[Deno] Could not check ComfyUI GGUF metadata support.\n"
            "Update ComfyUI, restart completely, then run again.\n"
            f"Original import error: {exc}"
        ) from exc

    try:
        params = inspect.signature(comfy.sd.load_diffusion_model_state_dict).parameters
    except Exception as exc:
        raise RuntimeError(COMFY_METADATA_MESSAGE + f"\nOriginal check error: {exc}") from exc

    if "metadata" not in params:
        raise RuntimeError(COMFY_METADATA_MESSAGE)


def _friendly_ltx23_shape_error(exc: Exception) -> RuntimeError:
    message = str(exc)
    if "size mismatch" in message and "scale_shift_table" in message and "LTXAVModel" in message:
        return RuntimeError(
            "[Deno] The GGUF file was found, but ComfyUI built an incompatible LTXAVModel.\n"
            "This usually means ComfyUI or ComfyUI-GGUF is too old to read the LTX 2.3 GGUF metadata.\n"
            "Update ComfyUI core and ComfyUI-GGUF, restart ComfyUI completely, then run again.\n"
            "If it still happens, re-download the GGUF model because its metadata may be missing or incompatible.\n"
            f"Original error: {message}"
        )
    return RuntimeError(message)


def _friendly_ltx_audio_vae_error(exc: Exception, audio_vae_name: str = "") -> RuntimeError:
    message = str(exc)
    known_signature_mismatch = "AudioVAE.__init__()" in message and "3 were given" in message
    missing_metadata = "Metadata is required for audio VAE" in message or "Audio VAE config is required" in message
    if known_signature_mismatch or missing_metadata:
        selected = f"\nSelected audio VAE: {audio_vae_name}" if audio_vae_name else ""
        return RuntimeError(
            "[Deno] LTX Audio VAE failed to load because ComfyUI/KJNodes and the audio VAE format are not compatible.\n"
            "Update ComfyUI core, comfyui-kjnodes, and ComfyUI-GGUF from ComfyUI Manager, then restart ComfyUI completely.\n"
            "Also make sure the audio VAE is the official LTX23_audio_vae_bf16.safetensors file with metadata intact."
            f"{selected}\n"
            f"Original error: {message}"
        )
    return RuntimeError(message)


class DenoLTX23PresetLoader:
    DESCRIPTION = (
        "Unified LTX model loader for beginner workflows.\n"
        "Choose Checkpoint Style, KJ Style, or GGUF Style and output MODEL/CLIP/video+audio VAE from one node.\n"
        "Checkpoint Style uses the selected checkpoint as the CLIP projection file; text_projection is only for KJ/GGUF Style.\n"
        "GGUF Style requires ComfyUI-GGUF. KJ/GGUF Style requires comfyui-kjnodes.\n"
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
        checkpoint_options, checkpoint_default = _combo_options_with_default(
            _build_combo_options("checkpoints", cls._RECOMMENDED_CHECKPOINTS),
            cls._RECOMMENDED_CHECKPOINTS,
        )
        diffusion_options, diffusion_default = _combo_options_with_default(
            _build_combo_options("diffusion_models", cls._RECOMMENDED_DIFFUSION),
            cls._RECOMMENDED_DIFFUSION,
        )
        gguf_options, gguf_default = _combo_options_with_default(
            _get_gguf_choices(),
            RECOMMENDED_GGUF_UNETS,
        )
        vae_options = _build_combo_options("vae", cls._RECOMMENDED_VAE)
        video_vae_options, video_vae_default = _combo_options_with_default(
            vae_options,
            ["LTX23_video_vae_bf16.safetensors"],
        )
        audio_vae_options, audio_vae_default = _combo_options_with_default(
            vae_options,
            ["LTX23_audio_vae_bf16.safetensors"],
        )
        text_encoder_options, text_encoder_default = _combo_options_with_default(
            _build_combo_options("text_encoders", cls._RECOMMENDED_TEXT_ENCODERS),
            [cls._RECOMMENDED_TEXT_ENCODERS[1], *cls._RECOMMENDED_TEXT_ENCODERS],
        )
        text_projection_options, text_projection_default = _combo_options_with_default(
            _build_text_projection_options(cls._RECOMMENDED_TEXT_PROJECTION),
            [cls._RECOMMENDED_TEXT_PROJECTION[2], *cls._RECOMMENDED_TEXT_PROJECTION],
        )

        return {
            "required": {
                "pipeline_mode": (PIPELINE_MODES, {"default": "Checkpoint Style"}),
                "checkpoint_name": (
                    checkpoint_options,
                    {"default": checkpoint_default},
                ),
                "diffusion_model_name": (
                    diffusion_options,
                    {"default": diffusion_default},
                ),
                "gguf_unet_name": (
                    gguf_options,
                    {"default": gguf_default},
                ),
                "video_vae_name": (
                    video_vae_options,
                    {"default": video_vae_default},
                ),
                "audio_vae_name": (
                    audio_vae_options,
                    {"default": audio_vae_default},
                ),
                "text_encoder_name": (
                    text_encoder_options,
                    {"default": text_encoder_default},
                ),
                "text_projection_name": (
                    text_projection_options,
                    {"default": text_projection_default},
                ),
                "clip_device": (DEVICE_CHOICES, {"default": "default"}),
                "weight_dtype": (DTYPE_CHOICES, {"default": "default"}),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "VAE")
    RETURN_NAMES = ("model", "clip", "video_vae", "audio_vae")
    FUNCTION = "load_ltx_model"
    CATEGORY = "Deno/LTX"

    @classmethod
    def VALIDATE_INPUTS(
        cls,
        pipeline_mode,
        checkpoint_name=None,
        diffusion_model_name=None,
        gguf_unet_name=None,
        video_vae_name=None,
        audio_vae_name=None,
        text_encoder_name=None,
        text_projection_name=None,
        clip_device=None,
        weight_dtype=None,
    ):
        try:
            mode = _normalize_pipeline_mode(pipeline_mode)
        except RuntimeError as exc:
            return str(exc)

        for error in (
            _validate_choice(clip_device, "clip_device", DEVICE_CHOICES),
            _validate_choice(weight_dtype, "weight_dtype", DTYPE_CHOICES),
        ):
            if error:
                return error

        if mode == "Checkpoint Style":
            checks = (
                _validate_required_model(checkpoint_name, "checkpoint_name", mode, ("checkpoints",)),
                _validate_required_model(text_encoder_name, "text_encoder_name", mode, ("text_encoders",)),
            )
        elif mode == "KJ Style":
            checks = (
                _validate_required_model(diffusion_model_name, "diffusion_model_name", mode, ("diffusion_models",)),
                _validate_required_model(text_encoder_name, "text_encoder_name", mode, ("text_encoders",)),
                _validate_required_model(text_projection_name, "text_projection_name", mode, ("text_encoders",)),
                _validate_required_model(video_vae_name, "video_vae_name", mode, ("vae",)),
                _validate_required_model(audio_vae_name, "audio_vae_name", mode, ("vae",)),
            )
        else:
            checks = (
                _validate_required_model(
                    gguf_unet_name,
                    "gguf_unet_name",
                    mode,
                    ("unet_gguf", "diffusion_models", "unet"),
                    extension=".gguf",
                ),
                _validate_required_model(text_encoder_name, "text_encoder_name", mode, ("text_encoders",)),
                _validate_required_model(text_projection_name, "text_projection_name", mode, ("text_encoders",)),
                _validate_required_model(video_vae_name, "video_vae_name", mode, ("vae",)),
                _validate_required_model(audio_vae_name, "audio_vae_name", mode, ("vae",)),
            )

        for error in checks:
            if error:
                return error
        return True

    def _load_kj_vaes(self, video_vae_name: str, audio_vae_name: str):
        vae_loader_cls = _get_kj_vae_loader_class()
        vae_loader = vae_loader_cls()

        video_vae = _extract_output_value(
            vae_loader.load_vae(video_vae_name, KJ_VAE_DEVICE, KJ_VAE_DTYPE),
            "VAELoaderKJ(video)",
        )
        audio_vae = _extract_output_value(
            self._load_kj_audio_vae_with_fallback(vae_loader, audio_vae_name),
            "VAELoaderKJ(audio)",
        )
        return video_vae, audio_vae

    def _load_kj_audio_vae_with_fallback(self, vae_loader, audio_vae_name: str):
        try:
            return vae_loader.load_vae(audio_vae_name, KJ_VAE_DEVICE, KJ_VAE_DTYPE)
        except TypeError as exc:
            if "AudioVAE.__init__()" not in str(exc) or "3 were given" not in str(exc):
                raise
            try:
                return (_load_ltx_audio_vae_file(audio_vae_name),)
            except Exception as fallback_exc:  # noqa: BLE001
                raise _friendly_ltx_audio_vae_error(fallback_exc, audio_vae_name) from exc
        except Exception as exc:
            raise _friendly_ltx_audio_vae_error(exc, audio_vae_name) from exc

    def _load_checkpoint_style(
        self,
        checkpoint_name: str,
        text_encoder_name: str,
        clip_device: str,
    ):
        model, _clip_from_checkpoint, video_vae = nodes.CheckpointLoaderSimple().load_checkpoint(checkpoint_name)
        clip = _load_ltx_audio_text_encoder(text_encoder_name, checkpoint_name, clip_device)
        try:
            audio_vae = _load_ltx_audio_vae(checkpoint_name)
        except Exception as exc:
            raise _friendly_ltx_audio_vae_error(exc, checkpoint_name) from exc
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
            raise RuntimeError(
                "[Deno] No GGUF model was selected.\n"
                "Install ComfyUI-GGUF, place an LTX 2.3 *.gguf file in a ComfyUI model folder such as models/unet, "
                "then press R to refresh model lists."
            )

        _assert_comfy_supports_ltx23_gguf_metadata()
        loader_cls = _get_gguf_loader_class()
        loader = loader_cls()
        try:
            try:
                model = loader.load_unet(
                    gguf_unet_name,
                    dequant_dtype="default",
                    patch_dtype="default",
                    patch_on_device=False,
                )[0]
            except TypeError:
                model = loader.load_unet(gguf_unet_name)[0]
        except RuntimeError as exc:
            raise _friendly_ltx23_shape_error(exc) from exc

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
        pipeline_mode = _normalize_pipeline_mode(pipeline_mode)
        if pipeline_mode == "Checkpoint Style":
            checkpoint_name = _require_selected(checkpoint_name, "checkpoint_name", pipeline_mode)
            text_encoder_name = _require_selected(text_encoder_name, "text_encoder_name", pipeline_mode)
            model, clip, video_vae, audio_vae = self._load_checkpoint_style(
                checkpoint_name=checkpoint_name,
                text_encoder_name=text_encoder_name,
                clip_device=clip_device,
            )
        elif pipeline_mode == "KJ Style":
            diffusion_model_name = _require_selected(diffusion_model_name, "diffusion_model_name", pipeline_mode)
            text_encoder_name = _require_selected(text_encoder_name, "text_encoder_name", pipeline_mode)
            text_projection_name = _require_selected(text_projection_name, "text_projection_name", pipeline_mode)
            video_vae_name = _require_selected(video_vae_name, "video_vae_name", pipeline_mode)
            audio_vae_name = _require_selected(audio_vae_name, "audio_vae_name", pipeline_mode)
            _get_kj_vae_loader_class()
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
            gguf_unet_name = _require_extension(gguf_unet_name, "gguf_unet_name", ".gguf", pipeline_mode)
            text_encoder_name = _require_selected(text_encoder_name, "text_encoder_name", pipeline_mode)
            text_projection_name = _require_selected(text_projection_name, "text_projection_name", pipeline_mode)
            video_vae_name = _require_selected(video_vae_name, "video_vae_name", pipeline_mode)
            audio_vae_name = _require_selected(audio_vae_name, "audio_vae_name", pipeline_mode)
            _assert_comfy_supports_ltx23_gguf_metadata()
            _get_gguf_loader_class()
            _get_kj_vae_loader_class()
            model, clip, video_vae, audio_vae = self._load_gguf_style(
                gguf_unet_name=gguf_unet_name,
                text_encoder_name=text_encoder_name,
                text_projection_name=text_projection_name,
                video_vae_name=video_vae_name,
                audio_vae_name=audio_vae_name,
                clip_device=clip_device,
            )

        return (model, clip, video_vae, audio_vae)
