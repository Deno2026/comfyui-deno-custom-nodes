"""Validation, mapping, and schedule math for Alibaba MiniMax H3 PDD.

The released checkpoint contains ordinary low-rank updates plus one complete
video/audio output projection per interval. ComfyUI stores Q/K/V in a fused
matrix and uses the opposite SwiGLU half order from the Diffusers checkpoint,
so both layouts must be mapped explicitly.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
import re
from typing import Iterable, Mapping

import torch


VIDEO_SHIFT = 12.0
AUDIO_SHIFT = 3.0

HEAD_KEYS = {
    "proj_out.weight",
    "proj_out.bias",
    "audio_proj_out.weight",
    "audio_proj_out.bias",
}

SUPPORTED_TARGETS = {
    "to_q",
    "to_k",
    "to_v",
    "to_out.0",
    "ff.net.0.proj",
    "ff.net.2",
    "adaln_proj.linear",
}

_TRANSFORMER = re.compile(r"^transformer_blocks\.(\d+)\.(.+)$")
_REFINER = re.compile(r"^token_refiner\.refiner_blocks\.(\d+)\.(.+)$")


@dataclass(frozen=True)
class PDDConfig:
    num_steps: int
    block_size: int
    rank: int
    alpha: float
    targets: tuple[str, ...]

    @property
    def nfe(self) -> int:
        return self.num_steps // self.block_size


@dataclass(frozen=True)
class PatchSpec:
    patch_key: object
    up: torch.Tensor
    down: torch.Tensor
    source_keys: tuple[str, str]


@dataclass(frozen=True)
class CurvePatchSpec:
    weight_key: str
    weight_delta: torch.Tensor
    bias_key: str
    bias_delta: torch.Tensor
    source_keys: tuple[str, str]


@dataclass(frozen=True)
class FusedPDDHeads:
    video_weight: torch.Tensor
    video_bias: torch.Tensor
    audio_weight: torch.Tensor
    audio_bias: torch.Tensor
    sigmas_video: tuple[float, ...]
    sigmas_audio: tuple[float, ...]
    dsum_video: tuple[float, ...]
    dsum_audio: tuple[float, ...]
    config: PDDConfig


@dataclass(frozen=True)
class PDDHeadBank:
    """Raw 32-interval PDD projections kept on CPU for runtime schedule fusion."""

    video_weight: torch.Tensor
    video_bias: torch.Tensor
    audio_weight: torch.Tensor
    audio_bias: torch.Tensor
    sigmas_video: tuple[float, ...]
    sigmas_audio: tuple[float, ...]
    config: PDDConfig


def _required_int(metadata: Mapping[str, str], key: str) -> int:
    try:
        value = int(metadata[key])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"MiniMax H3 Acc metadata '{key}' must be an integer") from exc
    if value < 1:
        raise ValueError(f"MiniMax H3 Acc metadata '{key}' must be positive")
    return value


def parse_config(metadata: Mapping[str, str] | None) -> PDDConfig:
    if not metadata:
        raise ValueError("MiniMax H3 Acc checkpoint has no safetensors metadata")
    num_steps = _required_int(metadata, "pdd_num_steps")
    block_size = _required_int(metadata, "pdd_block_size")
    rank = _required_int(metadata, "lora_rank")
    try:
        alpha = float(metadata["lora_alpha"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("MiniMax H3 Acc metadata 'lora_alpha' must be numeric") from exc
    if not math.isfinite(alpha) or alpha <= 0.0:
        raise ValueError("MiniMax H3 Acc metadata 'lora_alpha' must be finite and positive")
    if num_steps % block_size:
        raise ValueError(
            f"pdd_num_steps={num_steps} must be divisible by pdd_block_size={block_size}"
        )
    raw_targets = metadata.get("lora_targets", "")
    targets = tuple(part.strip() for part in raw_targets.split(",") if part.strip())
    if set(targets) != SUPPORTED_TARGETS:
        raise ValueError(
            "Unsupported MiniMax H3 Acc target contract: "
            f"expected {sorted(SUPPORTED_TARGETS)}, got {sorted(set(targets))}"
        )
    return PDDConfig(num_steps, block_size, rank, alpha, targets)


def lora_pairs(
    state: Mapping[str, torch.Tensor],
    config: PDDConfig,
) -> dict[str, tuple[torch.Tensor, torch.Tensor]]:
    grouped: dict[str, dict[str, torch.Tensor]] = {}
    unknown = []
    for key, tensor in state.items():
        if key in HEAD_KEYS:
            continue
        if key.endswith(".lora_down"):
            grouped.setdefault(key[: -len(".lora_down")], {})["down"] = tensor
        elif key.endswith(".lora_up"):
            grouped.setdefault(key[: -len(".lora_up")], {})["up"] = tensor
        else:
            unknown.append(key)
    if unknown:
        raise ValueError(f"Unsupported tensors in MiniMax H3 Acc checkpoint: {unknown[:5]}")
    if not grouped:
        raise ValueError("MiniMax H3 Acc checkpoint contains no LoRA pairs")

    result = {}
    for base, parts in grouped.items():
        if set(parts) != {"down", "up"}:
            raise ValueError(f"Incomplete LoRA pair for {base}")
        down, up = parts["down"], parts["up"]
        if down.ndim != 2 or up.ndim != 2:
            raise ValueError(f"LoRA tensors for {base} must be matrices")
        if down.shape[0] != config.rank or up.shape[1] != config.rank:
            raise ValueError(
                f"LoRA rank mismatch for {base}: metadata={config.rank}, "
                f"down={tuple(down.shape)}, up={tuple(up.shape)}"
            )
        result[base] = (down, up)
    return result


def validate_checkpoint(
    state: Mapping[str, torch.Tensor],
    metadata: Mapping[str, str] | None,
) -> tuple[PDDConfig, dict[str, tuple[torch.Tensor, torch.Tensor]]]:
    config = parse_config(metadata)
    missing = sorted(HEAD_KEYS - set(state))
    if missing:
        raise ValueError(f"MiniMax H3 Acc checkpoint is missing PDD heads: {missing}")

    expected_heads = {
        "proj_out.weight": (config.num_steps, 96, 5376),
        "proj_out.bias": (config.num_steps, 96),
        "audio_proj_out.weight": (config.num_steps, 32, 5376),
        "audio_proj_out.bias": (config.num_steps, 32),
    }
    for key, shape in expected_heads.items():
        if tuple(state[key].shape) != shape:
            raise ValueError(f"Unexpected {key} shape: expected {shape}, got {tuple(state[key].shape)}")
        if not state[key].is_floating_point():
            raise ValueError(f"PDD head {key} must be floating point")

    pairs = lora_pairs(state, config)
    return config, pairs


def select_model_compatible_pairs(
    pairs: Mapping[str, tuple[torch.Tensor, torch.Tensor]],
    use_adaln_curves: bool,
) -> tuple[dict[str, tuple[torch.Tensor, torch.Tensor]], tuple[str, ...]]:
    """Skip only full-width AdaLN updates that cannot fit curve-pruned models."""

    if not use_adaln_curves:
        return dict(pairs), ()
    skipped = tuple(sorted(base for base in pairs if base.endswith(".adaln_proj.linear")))
    compatible = {base: tensors for base, tensors in pairs.items() if base not in skipped}
    return compatible, skipped


def shifted_sigmas(shift: float, num_steps: int) -> torch.Tensor:
    base = torch.linspace(1.0, 0.0, num_steps + 1, dtype=torch.float64)
    return shift * base / (1.0 + (shift - 1.0) * base)


def _cpu_float_tensor(tensor: torch.Tensor) -> torch.Tensor:
    return tensor.detach().to(device="cpu", dtype=torch.float32).contiguous()


def load_head_bank(state: Mapping[str, torch.Tensor], config: PDDConfig) -> PDDHeadBank:
    """Copy the raw PDD banks to stable CPU float tensors after validation."""

    sigmas_video = tuple(float(value) for value in shifted_sigmas(VIDEO_SHIFT, config.num_steps))
    sigmas_audio = tuple(float(value) for value in shifted_sigmas(AUDIO_SHIFT, config.num_steps))
    return PDDHeadBank(
        _cpu_float_tensor(state["proj_out.weight"]),
        _cpu_float_tensor(state["proj_out.bias"]),
        _cpu_float_tensor(state["audio_proj_out.weight"]),
        _cpu_float_tensor(state["audio_proj_out.bias"]),
        sigmas_video,
        sigmas_audio,
        config,
    )


def validate_sigma_schedule(sigmas: Iterable[float] | torch.Tensor) -> tuple[float, ...]:
    if isinstance(sigmas, torch.Tensor):
        values = tuple(float(value) for value in sigmas.detach().flatten().to("cpu", torch.float64))
    else:
        values = tuple(float(value) for value in sigmas)
    if len(values) < 2:
        raise ValueError("MiniMax H3 Acc requires at least two sigma boundaries")
    if any(not math.isfinite(value) for value in values):
        raise ValueError("MiniMax H3 Acc sigma boundaries must be finite")
    tolerance = 2.0e-6
    if any(value < -tolerance or value > 1.0 + tolerance for value in values):
        raise ValueError("MiniMax H3 Acc sigma boundaries must stay within [0, 1]")
    normalized = tuple(min(1.0, max(0.0, value)) for value in values)
    if any(left <= right for left, right in zip(normalized, normalized[1:])):
        raise ValueError("MiniMax H3 Acc requires a strictly descending sigma schedule")
    return normalized


def _unshift_sigma(sigma: float, shift: float) -> float:
    return sigma / (shift - (shift - 1.0) * sigma)


def _shift_sigma(base: float, shift: float) -> float:
    return shift * base / (1.0 + (shift - 1.0) * base)


def audio_sigmas_for_video(sigmas_video: Iterable[float] | torch.Tensor) -> tuple[float, ...]:
    bounds_video = validate_sigma_schedule(sigmas_video)
    return tuple(
        _shift_sigma(_unshift_sigma(sigma, VIDEO_SHIFT), AUDIO_SHIFT)
        for sigma in bounds_video
    )


def _overlap_weights(
    requested_bounds: tuple[float, ...],
    raw_bounds: tuple[float, ...],
) -> torch.Tensor:
    weights = torch.zeros(
        (len(requested_bounds) - 1, len(raw_bounds) - 1),
        dtype=torch.float64,
    )
    for request_index, (left, right) in enumerate(
        zip(requested_bounds, requested_bounds[1:])
    ):
        for raw_index, (raw_left, raw_right) in enumerate(zip(raw_bounds, raw_bounds[1:])):
            overlap = min(left, raw_left) - max(right, raw_right)
            if overlap > 0.0:
                weights[request_index, raw_index] = overlap
        expected = left - right
        covered = float(weights[request_index].sum())
        if not math.isclose(covered, expected, rel_tol=2.0e-6, abs_tol=2.0e-7):
            raise ValueError(
                "MiniMax H3 Acc sigma interval falls outside the trained PDD grid: "
                f"{left:.9g} -> {right:.9g}"
            )
    return weights


def _weighted_fuse_bank(bank: torch.Tensor, weights: torch.Tensor) -> torch.Tensor:
    if bank.shape[0] != weights.shape[1]:
        raise ValueError("PDD head-bank length does not match its sigma grid")
    fused = []
    for row in weights:
        acc = torch.zeros_like(bank[0], dtype=torch.float32, device="cpu")
        for index in torch.nonzero(row, as_tuple=False).flatten().tolist():
            acc.add_(bank[index], alpha=float(row[index]))
        fused.append(acc)
    return torch.stack(fused).contiguous()


def fuse_heads_for_sigmas(
    bank: PDDHeadBank,
    sigmas_video: Iterable[float] | torch.Tensor,
) -> FusedPDDHeads:
    bounds_v = validate_sigma_schedule(sigmas_video)
    bounds_a = audio_sigmas_for_video(bounds_v)
    weights_video = _overlap_weights(bounds_v, bank.sigmas_video)
    weights_audio = _overlap_weights(bounds_a, bank.sigmas_audio)
    video_weight = _weighted_fuse_bank(bank.video_weight, weights_video)
    video_bias = _weighted_fuse_bank(bank.video_bias, weights_video)
    audio_weight = _weighted_fuse_bank(bank.audio_weight, weights_audio)
    audio_bias = _weighted_fuse_bank(bank.audio_bias, weights_audio)
    dsum_v = tuple(left - right for left, right in zip(bounds_v, bounds_v[1:]))
    dsum_a = tuple(left - right for left, right in zip(bounds_a, bounds_a[1:]))
    return FusedPDDHeads(
        video_weight,
        video_bias,
        audio_weight,
        audio_bias,
        bounds_v,
        bounds_a,
        dsum_v,
        dsum_a,
        bank.config,
    )


def fuse_heads(state: Mapping[str, torch.Tensor], config: PDDConfig) -> FusedPDDHeads:
    """Build the checkpoint's official block schedule (kept for API/tests)."""

    bank = load_head_bank(state, config)
    sigmas_video_full = shifted_sigmas(VIDEO_SHIFT, config.num_steps)
    knots = tuple(range(0, config.num_steps + 1, config.block_size))
    bounds_v = tuple(float(sigmas_video_full[i]) for i in knots)
    return fuse_heads_for_sigmas(bank, bounds_v)


def _native_target(base: str) -> tuple[str, str]:
    match = _TRANSFORMER.match(base)
    if match:
        return f"diffusion_model.blocks.{match.group(1)}", match.group(2)
    match = _REFINER.match(base)
    if match:
        return f"diffusion_model.token_refiner.blocks.{match.group(1)}", match.group(2)
    raise ValueError(f"Unsupported MiniMax H3 LoRA module: {base}")


def validate_model_adaln_layout(
    pairs: Mapping[str, tuple[torch.Tensor, torch.Tensor]],
    model_state: Mapping[str, torch.Tensor],
    use_adaln_curves: bool,
    curve_table: torch.Tensor | None = None,
) -> str:
    """Classify dense versus curve AdaLN from structure, never filename or dtype."""

    adaln_pairs = {
        base: tensors
        for base, tensors in pairs.items()
        if base.endswith(".adaln_proj.linear")
    }
    if not adaln_pairs:
        return "curve" if use_adaln_curves else "full"

    if use_adaln_curves:
        if curve_table is None or curve_table.ndim != 2:
            raise ValueError("MiniMax H3 curve AdaLN model has no valid adaln_t_table")
        expected_width = int(curve_table.shape[1])
    else:
        expected_width = None

    for base, (down, up) in adaln_pairs.items():
        prefix, _leaf = _native_target(base)
        target = prefix + ".adaln_proj.linear.weight"
        if target not in model_state:
            raise ValueError(
                f"The connected model does not expose required MiniMax H3 weight: {target}."
            )
        shape = tuple(model_state[target].shape)
        if len(shape) != 2 or shape[0] != up.shape[0]:
            raise ValueError(
                f"Shape mismatch for {base} -> {target}: "
                f"LoRA={tuple(up.shape)}, model={shape}"
            )
        if use_adaln_curves:
            if shape[1] != expected_width:
                raise ValueError(
                    f"MiniMax H3 curve AdaLN width mismatch for {target}: "
                    f"table={expected_width}, model={shape[1]}"
                )
        elif shape[1] != down.shape[1]:
            raise ValueError(
                f"MiniMax H3 full AdaLN width mismatch for {target}: "
                f"LoRA={down.shape[1]}, model={shape[1]}"
            )
    return "curve" if use_adaln_curves else "full"


def minimax_h3_time_embedding_curve(
    time_embedder: Mapping[str, torch.Tensor],
    num_rows: int,
) -> torch.Tensor:
    """Evaluate silu(time_embedder(t)) on the native H3 curve grid in float64."""

    if num_rows < 2:
        raise ValueError("MiniMax H3 AdaLN curve grid must contain at least two rows")
    required = (
        "time_embedder.proj_in.weight",
        "time_embedder.proj_in.bias",
        "time_embedder.proj_out.weight",
        "time_embedder.proj_out.bias",
    )
    missing = [key for key in required if key not in time_embedder]
    if missing:
        raise ValueError(f"MiniMax H3 full checkpoint is missing time embedder tensors: {missing}")

    win, bin_, wout, bout = (
        time_embedder[key].detach().to(device="cpu", dtype=torch.float64)
        for key in required
    )
    if win.ndim != 2 or win.shape[1] % 2:
        raise ValueError(f"Unexpected MiniMax H3 time_embedder input shape: {tuple(win.shape)}")
    if bin_.shape != (win.shape[0],):
        raise ValueError("MiniMax H3 time_embedder proj_in bias shape mismatch")
    if wout.ndim != 2 or wout.shape[1] != win.shape[0]:
        raise ValueError("MiniMax H3 time_embedder proj_out weight shape mismatch")
    if bout.shape != (wout.shape[0],):
        raise ValueError("MiniMax H3 time_embedder proj_out bias shape mismatch")

    half = win.shape[1] // 2
    t = torch.arange(num_rows, dtype=torch.float64) / (num_rows - 1)
    freqs = torch.exp(-math.log(10000.0) * torch.arange(half, dtype=torch.float64) / half)
    args = t[:, None] * freqs[None]
    embedded = torch.cat((torch.cos(args), torch.sin(args)), dim=-1)
    hidden = torch.nn.functional.silu(embedded @ win.T + bin_)
    projected = hidden @ wout.T + bout
    return torch.nn.functional.silu(projected)


def fit_adaln_curve_basis(
    curve_table: torch.Tensor,
    time_embedder: Mapping[str, torch.Tensor],
) -> tuple[torch.Tensor, torch.Tensor, float]:
    """Fit dense H3 time embeddings as c + V @ curve coordinates."""

    if curve_table.ndim != 2:
        raise ValueError("MiniMax H3 adaln_t_table must be a matrix")
    table = curve_table.detach().to(device="cpu", dtype=torch.float64)
    dense_curve = minimax_h3_time_embedding_curve(time_embedder, table.shape[0])
    design = torch.cat(
        (torch.ones(table.shape[0], 1, dtype=torch.float64), table),
        dim=1,
    )
    solution = torch.linalg.lstsq(design, dense_curve).solution
    approximation = design @ solution
    denominator = torch.linalg.vector_norm(dense_curve)
    if float(denominator) == 0.0:
        raise ValueError("MiniMax H3 time embedding curve has zero norm")
    residual = float(torch.linalg.vector_norm(approximation - dense_curve) / denominator)
    c = solution[0].to(torch.float32).contiguous()
    basis = solution[1:].T.to(torch.float32).contiguous()
    return c, basis, residual


def build_curve_adaln_patch_specs(
    pairs: Mapping[str, tuple[torch.Tensor, torch.Tensor]],
    model_state: Mapping[str, torch.Tensor],
    c: torch.Tensor,
    basis: torch.Tensor,
    alpha: float,
) -> list[CurvePatchSpec]:
    """Rebase dense AdaLN LoRA pairs onto a pruned model's curve coordinates."""

    c64 = c.detach().to(device="cpu", dtype=torch.float64)
    basis64 = basis.detach().to(device="cpu", dtype=torch.float64)
    if c64.ndim != 1 or basis64.ndim != 2 or basis64.shape[0] != c64.shape[0]:
        raise ValueError("Invalid MiniMax H3 AdaLN curve basis shapes")

    specs: list[CurvePatchSpec] = []
    for base in sorted(pairs):
        if not base.endswith(".adaln_proj.linear"):
            raise ValueError(f"Non-AdaLN pair passed to curve rebase: {base}")
        down, up = pairs[base]
        if down.ndim != 2 or up.ndim != 2 or up.shape[1] != down.shape[0]:
            raise ValueError(f"Invalid MiniMax H3 AdaLN LoRA shapes for {base}")
        if down.shape[1] != c64.shape[0]:
            raise ValueError(
                f"MiniMax H3 AdaLN basis width mismatch for {base}: "
                f"LoRA={down.shape[1]}, basis={c64.shape[0]}"
            )
        scale = float(alpha) / down.shape[0]
        down64 = down.detach().to(device="cpu", dtype=torch.float64)
        up64 = up.detach().to(device="cpu", dtype=torch.float64)
        weight_delta = (scale * (up64 @ (down64 @ basis64))).to(torch.float32).contiguous()
        bias_delta = (scale * (up64 @ (down64 @ c64))).to(torch.float32).contiguous()

        prefix, _leaf = _native_target(base)
        weight_key = prefix + ".adaln_proj.linear.weight"
        bias_key = prefix + ".adaln_proj.linear.bias"
        if weight_key not in model_state or bias_key not in model_state:
            raise ValueError(
                f"The connected curve model does not expose required AdaLN parameters for {base}"
            )
        if tuple(model_state[weight_key].shape) != tuple(weight_delta.shape):
            raise ValueError(
                f"Curve AdaLN weight shape mismatch for {base}: "
                f"delta={tuple(weight_delta.shape)}, model={tuple(model_state[weight_key].shape)}"
            )
        if tuple(model_state[bias_key].shape) != tuple(bias_delta.shape):
            raise ValueError(
                f"Curve AdaLN bias shape mismatch for {base}: "
                f"delta={tuple(bias_delta.shape)}, model={tuple(model_state[bias_key].shape)}"
            )
        specs.append(
            CurvePatchSpec(
                weight_key,
                weight_delta,
                bias_key,
                bias_delta,
                (base + ".lora_up", base + ".lora_down"),
            )
        )
    return specs


def build_patch_specs(
    pairs: Mapping[str, tuple[torch.Tensor, torch.Tensor]],
    model_state: Mapping[str, torch.Tensor],
) -> list[PatchSpec]:
    specs: list[PatchSpec] = []
    qkv_index = {"attn.to_q": 0, "attn.to_k": 1, "attn.to_v": 2}

    def require_shape(target: str) -> tuple[int, ...]:
        if target not in model_state:
            raise ValueError(
                f"The connected model does not expose required MiniMax H3 weight: {target}."
            )
        return tuple(model_state[target].shape)

    for base in sorted(pairs):
        down, up = pairs[base]
        prefix, leaf = _native_target(base)
        source_keys = (base + ".lora_up", base + ".lora_down")

        if leaf in qkv_index:
            target = prefix + ".attn.qkv_proj.weight"
            shape = require_shape(target)
            rows = up.shape[0]
            if shape != (rows * 3, down.shape[1]):
                raise ValueError(
                    f"Shape mismatch for {base} -> {target}: "
                    f"{tuple(up.shape)}, {tuple(down.shape)}, model={shape}"
                )
            offset = (0, qkv_index[leaf] * rows, rows)
            specs.append(PatchSpec((target, offset), up, down, source_keys))
        elif leaf == "attn.to_out.0":
            target = prefix + ".attn.out_proj.weight"
            shape = require_shape(target)
            if shape != (up.shape[0], down.shape[1]):
                raise ValueError(f"Shape mismatch for {base} -> {target}")
            specs.append(PatchSpec(target, up, down, source_keys))
        elif leaf == "ff.net.0.proj":
            target = prefix + ".mlp.fc1.weight"
            shape = require_shape(target)
            if shape != (up.shape[0], down.shape[1]) or up.shape[0] % 2:
                raise ValueError(f"Shape mismatch for {base} -> {target}")
            half = up.shape[0] // 2
            # Diffusers stores [value, gate]; ComfyUI's SwiGLU consumes [gate, value].
            specs.append(PatchSpec((target, (0, 0, half)), up[half:], down, source_keys))
            specs.append(PatchSpec((target, (0, half, half)), up[:half], down, source_keys))
        elif leaf == "ff.net.2":
            target = prefix + ".mlp.fc2.weight"
            shape = require_shape(target)
            if shape != (up.shape[0], down.shape[1]):
                raise ValueError(f"Shape mismatch for {base} -> {target}")
            specs.append(PatchSpec(target, up, down, source_keys))
        elif leaf == "adaln_proj.linear":
            target = prefix + ".adaln_proj.linear.weight"
            shape = require_shape(target)
            if shape != (up.shape[0], down.shape[1]):
                raise ValueError(f"Shape mismatch for {base} -> {target}")
            specs.append(PatchSpec(target, up, down, source_keys))
        else:
            raise ValueError(f"Unsupported MiniMax H3 LoRA target: {base}")
    return specs


def audio_inner_velocity_factor(
    current: float,
    next_sigma: float,
    shift_video: float,
    shift_audio: float,
) -> float:
    dsig_video = current - next_sigma
    if dsig_video <= 0.0:
        raise ValueError("MiniMax H3 Acc requires a strictly descending sigma schedule")
    ratio = shift_video / shift_audio
    carry_now = ratio + (1.0 - ratio) * current
    carry_next = ratio + (1.0 - ratio) * next_sigma
    return (carry_now * carry_next / ratio) / dsig_video


def make_pdd_projection_forward(projection, runtime, is_video: bool):
    """Replace only one output projection while native FinalLayer stays untouched."""

    def pdd_projection_forward(_self, hidden: torch.Tensor) -> torch.Tensor:
        hidden = hidden.to(torch.float32)
        plan, block, current, next_sigma = runtime.current_step()
        video_w, video_b, audio_w, audio_b = plan.for_device(hidden.device)
        if is_video:
            displacement = torch.nn.functional.linear(
                hidden,
                video_w[block],
                video_b[block],
            )
            return displacement / (current - next_sigma)
        displacement = torch.nn.functional.linear(
            hidden,
            audio_w[block],
            audio_b[block],
        )
        return displacement * audio_inner_velocity_factor(
            current,
            next_sigma,
            runtime.shift_video,
            runtime.shift_audio,
        )
    return pdd_projection_forward.__get__(projection, projection.__class__)
