"""Conditioning barrier that unloads one exact ComfyUI CLIP/text encoder."""

from __future__ import annotations

from typing import Any

from .deno_audio_analysis_finalize import _unload_clip_patcher

try:
    from comfy_api.latest import io
except (ImportError, AttributeError):  # Older ComfyUI keeps the V1 fallback below.
    io = None

try:
    from comfy_execution.graph_utils import ExecutionBlocker
except ImportError:  # ComfyUI v0.3.0 exposes the same class from graph.py.
    from comfy_execution.graph import ExecutionBlocker


POSITIVE_TOOLTIP = (
    "Positive CONDITIONING to pass through unchanged. Connect the matching output to the sampler "
    "or guider that should run after the text encoder is released."
)
NEGATIVE_TOOLTIP = (
    "Optional negative CONDITIONING. Connect either an encoded negative prompt or Conditioning "
    "Zero Out. When connected, it must finish before the text encoder is unloaded."
)
CLIP_TOOLTIP = (
    "The exact CLIP/text encoder to unload. Connect the same CLIP output used by the upstream text "
    "encoding nodes."
)
OUTPUT_TOOLTIPS = (
    "The original positive CONDITIONING unchanged, emitted after the connected text encoder unload.",
    "The original negative CONDITIONING unchanged. Connect only when Negative Conditioning is provided.",
)
DESCRIPTION = (
    "Passes positive and optional negative CONDITIONING through unchanged. After every connected "
    "conditioning path finishes, it unloads only the explicitly connected CLIP/text encoder. The "
    "negative input accepts either an encoded negative prompt or Conditioning Zero Out. This "
    "opt-in barrier does not unload diffusion models, VAEs, or ControlNets, and it cannot make the "
    "whole ComfyUI process use 0 MiB of VRAM."
)


def _legacy_input_types() -> dict:
    return {
        "required": {
            "positive_conditioning": ("CONDITIONING", {"tooltip": POSITIVE_TOOLTIP}),
            "text_encoder": ("CLIP", {"tooltip": CLIP_TOOLTIP}),
        },
        "optional": {
            "negative_conditioning": (
                "CONDITIONING",
                {"tooltip": NEGATIVE_TOOLTIP},
            ),
        },
    }


def _ensure_clip_can_leave_accelerator(clip: Any) -> None:
    patcher = getattr(clip, "patcher", None)
    if patcher is None:
        return  # The shared targeted-unload helper provides the canonical error.

    load_device = getattr(patcher, "load_device", None)
    offload_device = getattr(patcher, "offload_device", None)
    if load_device is None or offload_device is None or load_device != offload_device:
        return

    device_name = str(load_device).lower()
    if device_name == "cpu" or device_name.startswith("meta"):
        return

    raise RuntimeError(
        "Text Encoder Unload cannot free this CLIP from accelerator memory because its load and "
        f"offload devices are both {load_device}. Start ComfyUI without --gpu-only (the default "
        "Dynamic VRAM mode is supported), then run the workflow again."
    )


def _missing_negative_output() -> ExecutionBlocker:
    return ExecutionBlocker(
        "Connect Negative Conditioning before using the Negative Conditioning output."
    )


def _execute_unload(
    positive_conditioning: Any,
    text_encoder: Any,
    negative_conditioning: Any = None,
) -> tuple[Any, Any]:
    _ensure_clip_can_leave_accelerator(text_encoder)
    _unload_clip_patcher(
        text_encoder,
        missing_patcher_label="connected CLIP/text encoder",
        unavailable_feature_label="Text Encoder Unload",
    )
    return (
        positive_conditioning,
        negative_conditioning
        if negative_conditioning is not None
        else _missing_negative_output(),
    )


_HAS_CONDITIONING_IO = bool(
    io is not None
    and all(hasattr(io, name) for name in ("Clip", "ComfyNode", "Conditioning", "Schema"))
)


if _HAS_CONDITIONING_IO:

    class DenoTextEncoderUnload(io.ComfyNode):
        """Current ComfyUI implementation with positive/negative conditioning lanes."""

        DESCRIPTION = DESCRIPTION
        RETURN_TYPES = ("CONDITIONING", "CONDITIONING")
        RETURN_NAMES = ("positive_conditioning", "negative_conditioning")
        OUTPUT_TOOLTIPS = OUTPUT_TOOLTIPS
        FUNCTION = "EXECUTE_NORMALIZED"
        CATEGORY = "Deno/Memory"
        OUTPUT_NODE = False

        @classmethod
        def define_schema(cls):
            return io.Schema(
                node_id="DenoTextEncoderUnload",
                display_name="(Deno) Text Encoder Unload",
                # Registration decorates cls.DESCRIPTION with the installed
                # DENO version/update metadata before object_info is built.
                description=cls.DESCRIPTION,
                category="Deno/Memory",
                inputs=[
                    io.Conditioning.Input(
                        "positive_conditioning",
                        display_name="Positive Conditioning",
                        tooltip=POSITIVE_TOOLTIP,
                    ),
                    io.Conditioning.Input(
                        "negative_conditioning",
                        display_name="Negative Conditioning",
                        optional=True,
                        tooltip=NEGATIVE_TOOLTIP,
                    ),
                    io.Clip.Input(
                        "text_encoder",
                        display_name="Text Encoder (CLIP)",
                        tooltip=CLIP_TOOLTIP,
                    ),
                ],
                outputs=[
                    io.Conditioning.Output(
                        id="positive_conditioning",
                        display_name="Positive Conditioning",
                        tooltip=OUTPUT_TOOLTIPS[0],
                    ),
                    io.Conditioning.Output(
                        id="negative_conditioning",
                        display_name="Negative Conditioning",
                        tooltip=OUTPUT_TOOLTIPS[1],
                    ),
                ],
            )

        @classmethod
        def INPUT_TYPES(cls):
            # Keep object_info and older metadata tooling readable while the
            # current frontend uses define_schema() for exact type matching.
            return _legacy_input_types()

        @classmethod
        def execute(
            cls,
            positive_conditioning: Any,
            text_encoder: Any,
            negative_conditioning: Any = None,
        ) -> tuple[Any, Any]:
            return _execute_unload(
                positive_conditioning,
                text_encoder,
                negative_conditioning,
            )


else:

    class DenoTextEncoderUnload:
        """V1 compatibility fallback for ComfyUI builds without current schema APIs."""

        DESCRIPTION = DESCRIPTION
        RETURN_TYPES = ("CONDITIONING", "CONDITIONING")
        RETURN_NAMES = ("positive_conditioning", "negative_conditioning")
        OUTPUT_TOOLTIPS = OUTPUT_TOOLTIPS
        FUNCTION = "execute"
        CATEGORY = "Deno/Memory"
        OUTPUT_NODE = False

        @classmethod
        def INPUT_TYPES(cls):
            return _legacy_input_types()

        def execute(
            self,
            positive_conditioning: Any,
            text_encoder: Any,
            negative_conditioning: Any = None,
        ) -> tuple[Any, Any]:
            return _execute_unload(
                positive_conditioning,
                text_encoder,
                negative_conditioning,
            )
