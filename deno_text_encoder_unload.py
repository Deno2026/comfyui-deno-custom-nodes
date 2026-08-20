"""Inline barrier that unloads one exact ComfyUI CLIP/text encoder."""

from __future__ import annotations

from typing import Any

from .deno_audio_analysis_finalize import _unload_clip_patcher

try:
    from comfy_api.latest import io
except (ImportError, AttributeError):  # Older ComfyUI keeps the V1 fallback below.
    io = None


class _AnyType(str):
    """Legacy wildcard used only when MatchType is unavailable."""

    def __ne__(self, _other: object) -> bool:
        return False


ANY_TYPE = _AnyType("*")

VALUE_TOOLTIP = (
    "Any value to pass through unchanged. Connect this output inline before the sampler or another "
    "downstream node that should run after the text encoder is released."
)
CLIP_TOOLTIP = (
    "The exact CLIP/text encoder to unload. Connect the same CLIP output used by the upstream text "
    "encoding nodes."
)
WAIT_FOR_TOOLTIP = (
    "Optional extra dependency that is not changed or returned. For a classic KSampler, connect the "
    "other positive/negative conditioning branch here so both encodes finish before unload."
)
OUTPUT_TOOLTIP = (
    "The original value unchanged, emitted only after the connected CLIP/text encoder and its clones "
    "have been unloaded from ComfyUI model management."
)
DESCRIPTION = (
    "Passes one connected value through unchanged after unloading only the explicitly connected "
    "CLIP/text encoder. Use wait_for when another independent encoding branch must finish first. "
    "This opt-in barrier does not unload diffusion models, VAEs, or ControlNets, and it cannot make "
    "the whole ComfyUI process use 0 MiB of VRAM."
)


def _legacy_input_types() -> dict:
    return {
        "required": {
            "value": (ANY_TYPE, {"tooltip": VALUE_TOOLTIP}),
            "clip": ("CLIP", {"tooltip": CLIP_TOOLTIP}),
        },
        "optional": {
            "wait_for": (ANY_TYPE, {"tooltip": WAIT_FOR_TOOLTIP}),
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


def _execute_unload(value: Any, clip: Any) -> tuple[Any]:
    _ensure_clip_can_leave_accelerator(clip)
    _unload_clip_patcher(
        clip,
        missing_patcher_label="connected CLIP/text encoder",
        unavailable_feature_label="Text Encoder Unload",
    )
    return (value,)


_HAS_MATCH_TYPE = bool(
    io is not None
    and all(hasattr(io, name) for name in ("Clip", "ComfyNode", "MatchType", "Schema"))
)


if _HAS_MATCH_TYPE:

    class DenoTextEncoderUnload(io.ComfyNode):
        """Current ComfyUI implementation with type-preserving MatchType sockets."""

        DESCRIPTION = DESCRIPTION
        RETURN_TYPES = (ANY_TYPE,)
        RETURN_NAMES = ("value",)
        OUTPUT_TOOLTIPS = (OUTPUT_TOOLTIP,)
        FUNCTION = "EXECUTE_NORMALIZED"
        CATEGORY = "Deno/Memory"
        OUTPUT_NODE = False

        @classmethod
        def define_schema(cls):
            value_type = io.MatchType.Template("value")
            wait_type = io.MatchType.Template("wait_for")
            return io.Schema(
                node_id="DenoTextEncoderUnload",
                display_name="(Deno) Text Encoder Unload",
                # Registration decorates cls.DESCRIPTION with the installed
                # DENO version/update metadata before object_info is built.
                description=cls.DESCRIPTION,
                category="Deno/Memory",
                inputs=[
                    io.MatchType.Input("value", template=value_type, tooltip=VALUE_TOOLTIP),
                    io.Clip.Input("clip", tooltip=CLIP_TOOLTIP),
                    io.MatchType.Input(
                        "wait_for",
                        template=wait_type,
                        optional=True,
                        tooltip=WAIT_FOR_TOOLTIP,
                    ),
                ],
                outputs=[
                    io.MatchType.Output(
                        template=value_type,
                        id="value",
                        display_name="value",
                        tooltip=OUTPUT_TOOLTIP,
                    )
                ],
            )

        @classmethod
        def INPUT_TYPES(cls):
            # Keep object_info and older metadata tooling readable while the
            # current frontend uses define_schema() for exact type matching.
            return _legacy_input_types()

        @classmethod
        def fingerprint_inputs(cls, **_kwargs):
            # Unload is a side effect. A normal passthrough cache hit would skip
            # it after another branch or workflow loaded the CLIP again.
            return float("nan")

        @classmethod
        def IS_CHANGED(cls, **_kwargs):
            return float("nan")

        @classmethod
        def execute(cls, value: Any, clip: Any, wait_for: Any = None) -> tuple[Any]:
            del wait_for
            return _execute_unload(value, clip)


else:

    class DenoTextEncoderUnload:
        """V1 compatibility fallback for ComfyUI builds without MatchType."""

        DESCRIPTION = DESCRIPTION
        RETURN_TYPES = (ANY_TYPE,)
        RETURN_NAMES = ("value",)
        OUTPUT_TOOLTIPS = (OUTPUT_TOOLTIP,)
        FUNCTION = "execute"
        CATEGORY = "Deno/Memory"
        OUTPUT_NODE = False

        @classmethod
        def INPUT_TYPES(cls):
            return _legacy_input_types()

        @classmethod
        def IS_CHANGED(cls, **_kwargs):
            return float("nan")

        def execute(self, value: Any, clip: Any, wait_for: Any = None) -> tuple[Any]:
            del wait_for
            return _execute_unload(value, clip)
