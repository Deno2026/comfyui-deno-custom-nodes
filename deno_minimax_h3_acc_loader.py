"""Direct loader for Alibaba MiniMax H3 PDD acceleration checkpoints."""

from __future__ import annotations

from collections import OrderedDict
import hashlib
import logging
import math
import os

import torch
from safetensors import SafetensorError, safe_open

import comfy.patcher_extension
import comfy.utils
import comfy.weight_adapter
from comfy.ldm.minimax.model import MiniMaxH3Model
import folder_paths

from .deno_minimax_h3_pdd_core import (
    AUDIO_SHIFT,
    VIDEO_SHIFT,
    FusedPDDHeads,
    PDDHeadBank,
    build_curve_adaln_patch_specs,
    build_patch_specs,
    fit_adaln_curve_basis,
    fuse_heads_for_sigmas,
    load_head_bank,
    make_pdd_projection_forward,
    select_model_compatible_pairs,
    validate_model_adaln_layout,
    validate_sigma_schedule,
    validate_checkpoint,
)


LOGGER = logging.getLogger("deno.minimax_h3_acc")
MODEL_FOLDER = "minimax_h3_acc_loras"
WRAPPER_KEY = "deno_minimax_h3_acc_pdd"
CURVE_BASIS_MAX_RESIDUAL = 5.0e-3
_CURVE_BASIS_CACHE: OrderedDict[
    tuple[str, int, int, str], tuple[torch.Tensor, torch.Tensor, float]
] = OrderedDict()
_TIME_EMBEDDER_KEYS = (
    "time_embedder.proj_in.weight",
    "time_embedder.proj_in.bias",
    "time_embedder.proj_out.weight",
    "time_embedder.proj_out.bias",
)


def _register_model_paths() -> None:
    default_path = os.path.join(folder_paths.models_dir, MODEL_FOLDER)
    folder_paths.add_model_folder_path(MODEL_FOLDER, default_path, is_default=True)
    for lora_path in folder_paths.get_folder_paths("loras"):
        folder_paths.add_model_folder_path(MODEL_FOLDER, lora_path)
        sibling = os.path.join(os.path.dirname(lora_path), MODEL_FOLDER)
        folder_paths.add_model_folder_path(MODEL_FOLDER, sibling)
    folder_paths.folder_names_and_paths[MODEL_FOLDER][1].add(".safetensors")


_register_model_paths()


def _curve_table_digest(table: torch.Tensor) -> str:
    value = table.detach().to(device="cpu", dtype=torch.float32).contiguous()
    digest = hashlib.sha256()
    digest.update(str(tuple(value.shape)).encode("ascii"))
    digest.update(value.numpy().tobytes())
    return digest.hexdigest()[:16]


def _read_full_time_embedder(path: str) -> dict[str, torch.Tensor]:
    with safe_open(path, framework="pt", device="cpu") as handle:
        keys = set(handle.keys())
        prefixes = sorted(
            key[: -len(_TIME_EMBEDDER_KEYS[0])]
            for key in keys
            if key.endswith(_TIME_EMBEDDER_KEYS[0])
        )
        for prefix in prefixes:
            names = tuple(prefix + suffix for suffix in _TIME_EMBEDDER_KEYS)
            if not all(name in keys for name in names):
                continue
            tensors = {
                suffix: handle.get_tensor(name).detach().to(device="cpu").clone()
                for suffix, name in zip(_TIME_EMBEDDER_KEYS, names)
            }
            if not all(tensor.is_floating_point() for tensor in tensors.values()):
                raise ValueError("time_embedder tensors are quantized rather than floating point")
            return tensors
    raise ValueError("no complete MiniMax H3 time_embedder was found")


def _full_h3_model_candidates(acc_lora: str) -> list[str]:
    lower_acc = acc_lora.lower()
    variant = "ref2va" if "ref2va" in lower_acc else "fl2va" if "fl2va" in lower_acc else ""
    try:
        filenames = folder_paths.get_filename_list("diffusion_models")
    except (KeyError, ValueError):
        return []

    candidates = []
    for filename in filenames:
        lower = filename.lower()
        if not lower.endswith((".safetensors", ".sft")):
            continue
        if "minimax" not in lower or "h3" not in lower or "pruned" in lower:
            continue
        if variant and variant not in lower:
            continue
        path = folder_paths.get_full_path("diffusion_models", filename)
        if path is None:
            continue
        candidates.append((lower, os.path.abspath(path)))
    candidates.sort()
    return [path for _name, path in candidates]


def _resolve_curve_basis(
    curve_table: torch.Tensor,
    acc_lora: str,
) -> tuple[torch.Tensor, torch.Tensor, float, str] | None:
    table = curve_table.detach().to(device="cpu", dtype=torch.float32).contiguous()
    table_digest = _curve_table_digest(table)
    best = None
    for path in _full_h3_model_candidates(acc_lora):
        try:
            stat = os.stat(path)
            cache_key = (path, stat.st_size, stat.st_mtime_ns, table_digest)
            cached = _CURVE_BASIS_CACHE.get(cache_key)
            if cached is None:
                time_embedder = _read_full_time_embedder(path)
                cached = fit_adaln_curve_basis(table, time_embedder)
                _CURVE_BASIS_CACHE[cache_key] = cached
                while len(_CURVE_BASIS_CACHE) > 4:
                    _CURVE_BASIS_CACHE.popitem(last=False)
            else:
                _CURVE_BASIS_CACHE.move_to_end(cache_key)
            c, basis, residual = cached
        except (OSError, RuntimeError, SafetensorError, ValueError) as exc:
            LOGGER.debug("Skipping MiniMax H3 full-model basis candidate %s: %s", path, exc)
            continue
        if best is None or residual < best[2]:
            best = (c, basis, residual, path)
        if residual <= 1.0e-3:
            break
    if best is None or best[2] > CURVE_BASIS_MAX_RESIDUAL:
        return None
    return best


class _DeviceHeadCache:
    def __init__(self, heads: FusedPDDHeads):
        self.heads = heads
        self.cache: dict[str, tuple[torch.Tensor, ...]] = {}

    def for_device(self, device) -> tuple[torch.Tensor, ...]:
        key = str(torch.device(device))
        cached = self.cache.get(key)
        if cached is None:
            cached = tuple(
                tensor.to(device=device, dtype=torch.float32, non_blocking=True)
                for tensor in (
                    self.heads.video_weight,
                    self.heads.video_bias,
                    self.heads.audio_weight,
                    self.heads.audio_bias,
                )
            )
            self.cache[key] = cached
        return cached

    def clear(self) -> None:
        self.cache.clear()


class _PDDRuntime:
    def __init__(self, head_bank: PDDHeadBank):
        self.head_bank = head_bank
        self.plan_cache: OrderedDict[tuple[float, ...], _DeviceHeadCache] = OrderedDict()
        self.sigma_v: torch.Tensor | None = None
        self.transformer_options: dict | None = None
        self.shift_video = VIDEO_SHIFT
        self.shift_audio = AUDIO_SHIFT
        self.warned_intermediate_sigma = False

    def _plan_for(self, sigmas: tuple[float, ...]) -> _DeviceHeadCache:
        cached = self.plan_cache.get(sigmas)
        if cached is not None:
            self.plan_cache.move_to_end(sigmas)
            return cached
        heads = fuse_heads_for_sigmas(self.head_bank, sigmas)
        cached = _DeviceHeadCache(heads)
        self.plan_cache[sigmas] = cached
        while len(self.plan_cache) > 4:
            _key, removed = self.plan_cache.popitem(last=False)
            removed.clear()
        LOGGER.info(
            "Prepared MiniMax H3 Acc PDD heads for %d sampling interval(s)",
            len(sigmas) - 1,
        )
        return cached

    def __call__(self, executor, *args, **kwargs):
        timestep = args[1] if len(args) > 1 else kwargs.get("timestep")
        transformer_options = args[3] if len(args) > 3 else kwargs.get("transformer_options", {})
        if timestep is None:
            raise RuntimeError("MiniMax H3 Acc wrapper did not receive a timestep")
        transformer_options = transformer_options or {}
        shift_video = float(transformer_options.get("minimax_h3_sigma_shift_video", VIDEO_SHIFT))
        shift_audio = float(transformer_options.get("minimax_h3_sigma_shift_audio", AUDIO_SHIFT))
        if not (
            math.isclose(shift_video, VIDEO_SHIFT, rel_tol=0.0, abs_tol=1.0e-9)
            and math.isclose(shift_audio, AUDIO_SHIFT, rel_tol=0.0, abs_tol=1.0e-9)
        ):
            raise ValueError(
                "Alibaba MiniMax H3 Acc requires sigma shifts video=12.0 and audio=3.0; "
                f"got {shift_video}/{shift_audio}"
            )
        self.shift_video = shift_video
        self.shift_audio = shift_audio
        self.sigma_v = (timestep.flatten()[0] / 1000.0).float()
        self.transformer_options = transformer_options
        try:
            return executor(*args, **kwargs)
        finally:
            self.sigma_v = None
            self.transformer_options = None

    def current_step(self) -> tuple[_DeviceHeadCache, int, float, float]:
        if self.sigma_v is None or self.transformer_options is None:
            raise RuntimeError("MiniMax H3 Acc final head ran outside an active diffusion call")
        sample_sigmas = self.transformer_options.get("sample_sigmas")
        if sample_sigmas is None:
            raise ValueError(
                "MiniMax H3 Acc requires a sampling path that provides sample_sigmas, "
                "such as SamplerCustomAdvanced"
            )
        schedule = validate_sigma_schedule(torch.as_tensor(sample_sigmas).flatten())
        plan = self._plan_for(schedule)
        current = float(self.sigma_v.detach().item())
        tolerance = 2.0e-5
        for index, left in enumerate(schedule[:-1]):
            if abs(current - left) <= tolerance:
                return plan, index, current, schedule[index + 1]
        if abs(current - schedule[-1]) <= 1.0e-8:
            raise ValueError("MiniMax H3 Acc received a model call at the terminal sigma")
        for left, right in zip(schedule, schedule[1:]):
            if right < current < left:
                if not self.warned_intermediate_sigma:
                    LOGGER.warning(
                        "MiniMax H3 Acc received an intermediate sampler sigma. "
                        "Dynamic PDD fusion is being used experimentally; Euler is recommended."
                    )
                    self.warned_intermediate_sigma = True
                partial_schedule = validate_sigma_schedule((current, right))
                return self._plan_for(partial_schedule), 0, current, right
        raise ValueError(
            "MiniMax H3 Acc current sigma is outside the sampler's descending schedule: "
            f"{current:.9g}"
        )

    def to(self, _device):
        return self

    def cleanup(self, **_kwargs):
        for plan in self.plan_cache.values():
            plan.clear()
        self.plan_cache.clear()


class DenoMiniMaxH3AccLoader:
    """Apply the complete Alibaba PDD adapter to a native MiniMax H3 model."""

    @classmethod
    def INPUT_TYPES(cls):
        files = folder_paths.get_filename_list(MODEL_FOLDER)
        return {
            "required": {
                "model": ("MODEL",),
                "acc_lora": (
                    files,
                    {
                        "tooltip": (
                            "Alibaba MiniMax-H3 Acc-LoRA. Match FL2VA with FL2VA/T2VA models "
                            "and Ref2VA with Ref2VA models. Files are detected in the normal "
                            "LoRA folders and in models/minimax_h3_acc_loras."
                        )
                    },
                ),
            }
        }

    RETURN_TYPES = ("MODEL",)
    RETURN_NAMES = ("model",)
    FUNCTION = "apply"
    CATEGORY = "Deno/MiniMax H3"
    DESCRIPTION = (
        "Loads one official Alibaba MiniMax-H3 Acc safetensors directly, applies all LoRA "
        "weights supported by the connected model plus dynamically scheduled PDD heads. "
        "Choose sampler and sigmas with normal ComfyUI nodes; Simple + Euler at 8 steps is "
        "recommended, while other step counts are experimental."
    )

    @classmethod
    def IS_CHANGED(cls, model, acc_lora):
        del model
        path = folder_paths.get_full_path(MODEL_FOLDER, acc_lora)
        if path is None:
            return float("nan")
        stat = os.stat(path)
        return f"{os.path.abspath(path)}:{stat.st_size}:{stat.st_mtime_ns}"

    def apply(self, model, acc_lora):
        path = folder_paths.get_full_path_or_raise(MODEL_FOLDER, acc_lora)
        state, metadata = comfy.utils.load_torch_file(
            path,
            safe_load=True,
            device=torch.device("cpu"),
            return_metadata=True,
        )
        config, pairs = validate_checkpoint(state, metadata)

        model_clone = model.clone()
        previous_attachment = (
            model_clone.get_attachment("deno_minimax_h3_acc")
            if hasattr(model_clone, "get_attachment")
            else None
        )
        if previous_attachment and hasattr(model_clone, "get_wrappers"):
            for previous_runtime in model_clone.get_wrappers(
                comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL,
                WRAPPER_KEY,
            ):
                if hasattr(previous_runtime, "cleanup"):
                    previous_runtime.cleanup()
        if previous_attachment and hasattr(model_clone, "object_patches"):
            for legacy_path in (
                "diffusion_model.final_layer.forward",
                "diffusion_model.final_layer.video_out.forward",
                "diffusion_model.final_layer.audio_out.forward",
            ):
                model_clone.object_patches.pop(legacy_path, None)
        diffusion_model = model_clone.get_model_object("diffusion_model")
        if not isinstance(diffusion_model, MiniMaxH3Model):
            raise TypeError("DENO MiniMax H3 Acc Loader can only patch a native ComfyUI MiniMax H3 model")

        model_state = model_clone.model.state_dict()
        curve_table = (
            diffusion_model.adaln_t_table
            if diffusion_model.use_adaln_curves
            else None
        )
        adaln_layout = validate_model_adaln_layout(
            pairs,
            model_state,
            diffusion_model.use_adaln_curves,
            curve_table,
        )
        compatible_pairs, skipped_pairs = select_model_compatible_pairs(
            pairs,
            diffusion_model.use_adaln_curves,
        )
        curve_specs = []
        basis_source = None
        basis_residual = None
        if skipped_pairs:
            resolved = _resolve_curve_basis(curve_table, acc_lora)
            if resolved is not None:
                c, basis, basis_residual, basis_source = resolved
                curve_pairs = {base: pairs[base] for base in skipped_pairs}
                curve_specs = build_curve_adaln_patch_specs(
                    curve_pairs,
                    model_state,
                    c,
                    basis,
                    config.alpha,
                )
                skipped_pairs = ()
                LOGGER.info(
                    "MiniMax H3 curve-pruned model: rebased %d AdaLN LoRA pairs from %s "
                    "(fit residual %.3e)",
                    len(curve_specs),
                    os.path.basename(basis_source),
                    basis_residual,
                )
            else:
                LOGGER.warning(
                    "MiniMax H3 curve-pruned compatibility mode: no matching full H3 "
                    "checkpoint with a usable time_embedder was found in models/diffusion_models; "
                    "skipping %d AdaLN LoRA pairs while applying every other adapter pair and "
                    "the PDD heads",
                    len(skipped_pairs),
                )

        specs = build_patch_specs(compatible_pairs, model_state)
        patches = {}
        for spec in specs:
            adapter = comfy.weight_adapter.LoRAAdapter(
                set(spec.source_keys),
                (spec.up, spec.down, config.alpha, None, None, None),
            )
            patches[spec.patch_key] = adapter
        for spec in curve_specs:
            patches[spec.weight_key] = ("diff", (spec.weight_delta,))
            patches[spec.bias_key] = ("diff", (spec.bias_delta,))
        accepted = set(model_clone.add_patches(patches, strength_patch=1.0, strength_model=1.0))
        missing = set(patches) - accepted
        if missing:
            preview = ", ".join(str(item) for item in list(missing)[:5])
            raise RuntimeError(f"ComfyUI refused {len(missing)} MiniMax H3 Acc patches, e.g. {preview}")

        head_bank = load_head_bank(state, config)
        runtime = _PDDRuntime(head_bank)
        final_layer = diffusion_model.final_layer
        if hasattr(model_clone, "remove_wrappers_with_key"):
            model_clone.remove_wrappers_with_key(
                comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL,
                WRAPPER_KEY,
            )
        model_clone.add_wrapper_with_key(
            comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL,
            WRAPPER_KEY,
            runtime,
        )
        model_clone.add_object_patch(
            "diffusion_model.final_layer.video_out.forward",
            make_pdd_projection_forward(final_layer.video_out, runtime, True),
        )
        model_clone.add_object_patch(
            "diffusion_model.final_layer.audio_out.forward",
            make_pdd_projection_forward(final_layer.audio_out, runtime, False),
        )
        if hasattr(model_clone, "remove_callbacks_with_key"):
            model_clone.remove_callbacks_with_key(
                comfy.patcher_extension.CallbacksMP.ON_CLEANUP,
                WRAPPER_KEY,
            )
        if hasattr(model_clone, "add_callback_with_key"):
            model_clone.add_callback_with_key(
                comfy.patcher_extension.CallbacksMP.ON_CLEANUP,
                WRAPPER_KEY,
                lambda _patcher: runtime.cleanup(),
            )
        model_clone.set_attachments(
            "deno_minimax_h3_acc",
            {
                "path": path,
                "metadata": dict(metadata or {}),
                "lora_pairs": len(pairs),
                "applied_lora_pairs": len(compatible_pairs) + len(curve_specs),
                "rebased_adaln_pairs": len(curve_specs),
                "skipped_adaln_pairs": len(skipped_pairs),
                "pruned_compatibility_mode": bool(skipped_pairs),
                "model_adaln_layout": adaln_layout,
                "adaln_basis_source": basis_source,
                "adaln_basis_residual": basis_residual,
                "patches": len(patches),
                "pdd_grid_steps": config.num_steps,
                "recommended_nfe": config.nfe,
                "dynamic_schedule": True,
            },
        )

        variant = "Ref2VA" if "ref2va" in acc_lora.lower() else "FL2VA/T2VA"
        LOGGER.info(
            "Loaded %s | %s | LoRA pairs=%d | PDD grid=%d | trained block=%d | "
            "recommended=Simple/Euler/%d steps | dynamic schedule enabled | strength=1.0",
            os.path.basename(path),
            variant,
            len(compatible_pairs) + len(curve_specs),
            config.num_steps,
            config.block_size,
            config.nfe,
        )
        return (model_clone,)


NODE_CLASS_MAPPINGS = {
    "DenoMiniMaxH3AccLoader": DenoMiniMaxH3AccLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DenoMiniMaxH3AccLoader": "(Deno) MiniMax H3 Acc LoRA Loader",
}
