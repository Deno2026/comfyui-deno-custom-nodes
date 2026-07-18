"""(Deno) Video Preview — drop-in, full-resolution video preview.

A single-input preview node for checking real encoded output at multiple
sampling points in a graph. It encodes the actual H.264 video at the
original resolution (with +faststart so the browser plays it inline
reliably), then passes the images straight through so the node can be
inserted mid-pipeline. Each node instance writes to one stable temp file
that is overwritten every run, so heavy iteration never piles up temp
storage.

Encoding is done in-process with PyAV (the libav Python bindings) — no
external process is launched.

YouTube: https://www.youtube.com/@Denoise-AI
"""

from __future__ import annotations

import hashlib
import logging
import os
import glob
import threading
import uuid
from fractions import Fraction

import numpy as np
import torch


PREVIEW_SUBFOLDER = "deno_vprev"
DIRECT_PROMPT_PREVIEW_LIMIT = 4


def _require_av():
    try:
        import av  # noqa: F401

        return av
    except Exception as exc:
        raise RuntimeError(
            "(Deno) Video Preview needs PyAV (the 'av' package) to encode "
            "the preview in-process. Install it in this ComfyUI Python: "
            f"pip install av  (import error: {type(exc).__name__}: {exc})"
        ) from exc


def _workflow_id_from_extra_pnginfo(extra_pnginfo):
    """Return ComfyUI's persistent workflow id without depending on node ids.

    Current ComfyUI guarantees a top-level workflow ``id`` when a workflow is
    created or loaded.  The small list/tuple tolerance keeps this compatible
    with hosts that wrap hidden inputs while preserving the same node contract.
    """
    candidates = extra_pnginfo if isinstance(extra_pnginfo, (list, tuple)) else [extra_pnginfo]
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        workflow = candidate.get("workflow")
        workflows = workflow if isinstance(workflow, (list, tuple)) else [workflow]
        for item in workflows:
            if not isinstance(item, dict):
                continue
            workflow_id = str(item.get("id") or "").strip()
            if workflow_id:
                return workflow_id
            extra = item.get("extra")
            workspace_info = extra.get("workspace_info") if isinstance(extra, dict) else None
            workspace_id = str(workspace_info.get("id") or "").strip() if isinstance(workspace_info, dict) else ""
            if workspace_id:
                return f"workspace:{workspace_id}"
    return "legacy-workflow"


def _active_prompt_id():
    try:
        from comfy_execution.utils import get_executing_context

        context = get_executing_context()
        return str(getattr(context, "prompt_id", "") or "").strip()
    except Exception:
        return ""


def _preview_workflow_identity(extra_pnginfo):
    workflow_id = _workflow_id_from_extra_pnginfo(extra_pnginfo)
    if workflow_id != "legacy-workflow":
        return workflow_id
    prompt_id = _active_prompt_id()
    return f"prompt:{prompt_id}" if prompt_id else workflow_id


def _stable_preview_path(unique_id, workflow_id=None):
    import folder_paths

    temp_dir = folder_paths.get_temp_directory()
    abs_dir = os.path.join(temp_dir, PREVIEW_SUBFOLDER)
    os.makedirs(abs_dir, exist_ok=True)
    workflow_key = str(workflow_id or "legacy-workflow").strip() or "legacy-workflow"
    workflow_token = hashlib.sha256(workflow_key.encode("utf-8")).hexdigest()[:16]
    node_key = str(unique_id) or "node"
    node_token = hashlib.sha256(node_key.encode("utf-8")).hexdigest()[:16]
    prefix = "deno_vprev_prompt" if workflow_key.startswith("prompt:") else "deno_vprev"
    filename = f"{prefix}_{workflow_token}_{node_token}.mp4"
    return os.path.join(abs_dir, filename), filename, PREVIEW_SUBFOLDER


def _unique_partial_preview_path(out_path):
    token = f"{os.getpid()}-{threading.get_ident()}-{uuid.uuid4().hex}"
    return f"{out_path}.partial-{token}.mp4"


def _remove_file_best_effort(path):
    try:
        if path and os.path.isfile(path):
            os.remove(path)
    except OSError:
        pass


def _prune_direct_prompt_previews(out_path, limit=DIRECT_PROMPT_PREVIEW_LIMIT):
    """Bound prompt-id fallback files without touching persistent workflows."""
    filename = os.path.basename(out_path)
    if not filename.startswith("deno_vprev_prompt_"):
        return
    node_token = filename.rsplit("_", 1)[-1].removesuffix(".mp4")
    pattern = os.path.join(os.path.dirname(out_path), f"deno_vprev_prompt_*_{node_token}.mp4")
    candidates = []
    for path in glob.glob(pattern):
        try:
            candidates.append((os.stat(path).st_mtime_ns, path))
        except OSError:
            continue
    candidates.sort(reverse=True)
    for _mtime, path in candidates[max(1, int(limit)):]:
        _remove_file_best_effort(path)


def _extract_waveform_and_sr(audio):
    """Tolerantly pull (waveform, sample_rate) from a ComfyUI AUDIO, mirroring
    (Deno) Video Compare's extractor: AUDIO may be a dict, an object with
    attributes, or a (waveform, sr) pair, and the waveform may be a torch
    tensor or a numpy array. The naive 'dict + tensor only' assumption was
    why real graphs silently lost their audio track.
    """
    wf = sr = None
    if isinstance(audio, dict):
        wf = audio.get("waveform")
        sr = audio.get("sample_rate")
    else:
        wf = getattr(audio, "waveform", None)
        sr = getattr(audio, "sample_rate", None)
        if wf is None:
            try:
                wf = audio["waveform"]
            except Exception:
                pass
        if sr is None:
            try:
                sr = audio["sample_rate"]
            except Exception:
                pass
        if wf is None and isinstance(audio, (list, tuple)) and len(audio) >= 1:
            wf = audio[0]
            sr = audio[1] if len(audio) >= 2 else sr
        if wf is None and hasattr(audio, "shape"):
            wf = audio
    return wf, sr


def _prepare_audio_stream(av, container, audio):
    """Create the audio stream BEFORE any packet is muxed (libav requires
    all streams to exist before the first mux). Returns a context dict or
    None. Audio must never break the video preview, so any failure here is
    logged (no longer silent) and just disables audio.
    """
    try:
        wf, sr = _extract_waveform_and_sr(audio)
        sample_rate = int(sr or 0)
        if wf is None or sample_rate <= 0:
            return None
        if not hasattr(wf, "dim"):
            wf = torch.as_tensor(np.asarray(wf))
        wf = wf.detach().float()
        if wf.dim() == 3:
            wf = wf[0]
        if wf.dim() == 1:
            wf = wf.unsqueeze(0)
        if wf.dim() != 2:
            return None
        channels, count = int(wf.shape[0]), int(wf.shape[1])
        if channels > 8 and count <= 8:        # [samples, channels] -> [C, N]
            wf = wf.transpose(0, 1).contiguous()
            channels, count = count, channels
        if channels <= 0 or channels > 8 or count <= 0:
            return None
        layout = "mono" if channels == 1 else (
            "stereo" if channels == 2 else f"{channels}c"
        )
        samples = np.ascontiguousarray(
            wf.clamp(-1.0, 1.0).cpu().numpy().astype(np.float32)
        )  # [C, N] planar -> fltp
        astream = container.add_stream("aac", rate=sample_rate)
        astream.bit_rate = 192000
        return {
            "stream": astream,
            "samples": samples,
            "sample_rate": sample_rate,
            "layout": layout,
        }
    except Exception:
        try:
            probe = audio.get("waveform") if isinstance(audio, dict) else (
                getattr(audio, "waveform", None)
            )
            shape = getattr(probe, "shape", "?")
        except Exception:
            shape = "?"
        logging.warning(
            "[DENO] Video Preview: audio disabled (prep failed). "
            "audio_type=%s waveform_shape=%s",
            type(audio).__name__, shape, exc_info=True,
        )
        return None


def _encode_audio(av, container, ctx):
    """Encode the prepared audio in AAC-sized chunks. Best-effort."""
    try:
        astream = ctx["stream"]
        samples = ctx["samples"]
        sample_rate = ctx["sample_rate"]
        layout = ctx["layout"]
        total = int(samples.shape[1])
        frame_size = int(getattr(astream.codec_context, "frame_size", 0) or 1024)
        pos = 0
        while pos < total:
            chunk = samples[:, pos:pos + frame_size]
            aframe = av.AudioFrame.from_ndarray(
                np.ascontiguousarray(chunk), format="fltp", layout=layout
            )
            aframe.sample_rate = sample_rate
            aframe.pts = pos
            aframe.time_base = Fraction(1, sample_rate)
            for packet in astream.encode(aframe):
                container.mux(packet)
            pos += frame_size
        for packet in astream.encode():
            container.mux(packet)
        return True
    except Exception:
        logging.warning(
            "[DENO] Video Preview: audio track dropped (encode failed).",
            exc_info=True,
        )
        return False


class DenoVideoPreview:
    DESCRIPTION = (
        "Drop-in full-resolution video preview for checking real encoded "
        "output at any point in a graph.\n"
        "Encodes the actual H.264 video at the original resolution and "
        "passes the images straight through, so you can insert it inline at "
        "multiple sampling points.\n"
        "Each node reuses one temp file (overwritten every run), so heavy "
        "iteration never piles up temp storage.\n"
        "YouTube: https://www.youtube.com/@Denoise-AI"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "frame_rate": ("INT", {"default": 25, "min": 1, "max": 120, "step": 1}),
            },
            "optional": {
                "audio": ("AUDIO",),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "preview"
    CATEGORY = "Deno/Image"
    OUTPUT_NODE = True

    def preview(self, images, frame_rate: int, audio=None, unique_id=None, extra_pnginfo=None):
        if not isinstance(images, torch.Tensor) or images.ndim != 4:
            raise ValueError(
                "Expected IMAGE tensor [batch, height, width, channels], "
                f"got {type(images).__name__} "
                f"{tuple(images.shape) if hasattr(images, 'shape') else ''}"
            )
        batch, height, width, channels = (int(x) for x in images.shape)
        if batch <= 0 or height <= 0 or width <= 0 or channels < 3:
            raise ValueError(
                "(Deno) Video Preview needs at least one RGB frame "
                f"(got shape {tuple(images.shape)})."
            )

        av = _require_av()
        fps = max(1, int(frame_rate))
        # h264 + yuv420p needs even dimensions; crop at most 1px so the
        # original resolution is otherwise preserved 1:1 (no rescale).
        out_w = width - (width % 2)
        out_h = height - (height % 2)
        if out_w <= 0 or out_h <= 0:
            raise ValueError("(Deno) Video Preview needs frames at least 2x2.")

        workflow_id = _preview_workflow_identity(extra_pnginfo)
        out_path, filename, subfolder = _stable_preview_path(unique_id, workflow_id)
        partial_path = _unique_partial_preview_path(out_path)
        container = None
        encode_error = None
        has_audio = False
        try:
            container = av.open(partial_path, mode="w", options={"movflags": "+faststart"})
        except BaseException:
            _remove_file_best_effort(partial_path)
            raise

        try:
            stream = container.add_stream("libx264", rate=fps)
            stream.width = out_w
            stream.height = out_h
            stream.pix_fmt = "yuv420p"
            stream.options = {"crf": "16", "preset": "veryfast"}
            stream.time_base = Fraction(1, fps)

            # Audio stream must be created before the first packet is muxed.
            audio_ctx = (
                _prepare_audio_stream(av, container, audio)
                if audio is not None else None
            )

            frames = images[..., :3].clamp(0.0, 1.0)
            for index in range(batch):
                arr = (
                    frames[index, :out_h, :out_w]
                    .mul(255.0).round().to(torch.uint8).cpu().numpy()
                )
                vframe = av.VideoFrame.from_ndarray(
                    np.ascontiguousarray(arr), format="rgb24"
                )
                vframe.pts = index
                vframe.time_base = Fraction(1, fps)
                for packet in stream.encode(vframe):
                    container.mux(packet)
            for packet in stream.encode():
                container.mux(packet)

            has_audio = (
                _encode_audio(av, container, audio_ctx)
                if audio_ctx is not None else False
            )
        except BaseException as exc:
            encode_error = exc
        finally:
            try:
                container.close()
            except BaseException as exc:
                if encode_error is None:
                    encode_error = exc

        try:
            if encode_error is not None:
                raise encode_error.with_traceback(encode_error.__traceback__)
            if not os.path.isfile(partial_path) or os.path.getsize(partial_path) <= 0:
                raise RuntimeError(
                    "(Deno) Video Preview produced no output file. The frames "
                    "may be an unsupported shape, or PyAV failed to encode H.264."
                )
            os.replace(partial_path, out_path)
        except BaseException:
            _remove_file_best_effort(partial_path)
            raise
        _prune_direct_prompt_previews(out_path)

        return {
            "ui": {
                "deno_video_preview": [{
                    "filename": filename,
                    "subfolder": subfolder,
                    "type": "temp",
                    "frame_rate": fps,
                    "width": out_w,
                    "height": out_h,
                    "frame_count": batch,
                    "has_audio": bool(has_audio),
                }]
            },
            "result": (images,),
        }
