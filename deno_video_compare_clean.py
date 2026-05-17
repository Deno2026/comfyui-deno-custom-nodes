"""(Deno) Video Compare — Registry-clean test variants.

Two self-contained A/B video comparison nodes that do ALL compositing
(Slider / Side by Side / Difference / Toggle-blink) as pure tensor work.
They spawn no external process and make no network calls — only torch
and Pillow (both core ComfyUI dependencies). This module is intentionally
independent from the legacy compare module so the encoder-based file can
be dropped at final publish without touching these.

  * DenoVideoComparePreview  -> in-node animated WebP preview via Pillow
                                (a core ComfyUI dependency). No sound.
  * DenoVideoCompareVHS      -> outputs the composited frames + an AUDIO
                                passthrough so the user wires it into the
                                standard VHS Video Combine (sound + file).

These variants keep the same comparison goal with zero patterns the
Registry security scan reacts to.
"""

COMPARE_MODES = ["Slider", "Side by Side", "Difference", "Toggle"]
TOGGLE_CHOICES = ["A", "B"]


# --------------------------------------------------------------------------- #
# small normalisers (kept local so this file has no cross-module dependency)
# --------------------------------------------------------------------------- #
def _normalize_mode(mode: str) -> str:
    return mode if mode in COMPARE_MODES else "Slider"


def _normalize_toggle(value: str) -> str:
    return value if value in TOGGLE_CHOICES else "B"


def _normalize_split(value) -> float:
    try:
        return max(0.02, min(0.98, float(value)))
    except (TypeError, ValueError):
        return 0.5


def _normalize_fps(value) -> float:
    try:
        return max(1.0, min(240.0, float(value)))
    except (TypeError, ValueError):
        return 24.0


def _normalize_bool(value) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _video_size(video):
    if video is None or len(video) <= 0:
        return 0, 0, 0
    return int(video.shape[2]), int(video.shape[1]), int(video.shape[0])


# --------------------------------------------------------------------------- #
# audio passthrough helpers (pure tensor shape juggling, no encoder)
# --------------------------------------------------------------------------- #
def _extract_waveform(audio):
    if audio is None:
        return None, None
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


def _audio_samples(wf) -> int:
    try:
        return int(getattr(wf, "shape", [0])[-1])
    except Exception:
        return 0


def _has_audio(audio) -> bool:
    wf, _ = _extract_waveform(audio)
    return wf is not None and _audio_samples(wf) > 0


def _passthrough_audio(audio):
    """Return a valid ComfyUI AUDIO dict: the original payload if it
    carries sound, otherwise a tiny silent track so the socket is always
    valid for the downstream VHS node."""
    import torch

    if _has_audio(audio):
        wf, sr = _extract_waveform(audio)
        if not hasattr(wf, "dim"):
            wf = torch.as_tensor(wf)
        if wf.dim() == 2:
            wf = wf.unsqueeze(0)
        return {"waveform": wf, "sample_rate": int(sr or 44100)}
    return {"waveform": torch.zeros((1, 1, 1), dtype=torch.float32), "sample_rate": 44100}


# --------------------------------------------------------------------------- #
# compositing (pure torch — this is the whole comparison "engine")
# --------------------------------------------------------------------------- #
def _resize_to(video, h, w):
    import torch.nn.functional as F

    if int(video.shape[1]) == h and int(video.shape[2]) == w:
        return video.float()
    x = video.float().permute(0, 3, 1, 2)
    x = F.interpolate(x, size=(h, w), mode="bilinear", align_corners=False)
    return x.permute(0, 2, 3, 1).clamp(0.0, 1.0)


def _composite_frames(mode, video_a, video_b, split_position, swap, toggle_image, fps):
    """Return a single composited IMAGE batch [n, h, w, 3] (float, 0..1).

    Every mode is rendered here, so the result is a real, self-contained
    comparison clip — no browser-side overlay or external encoder needed.
    """
    import torch

    a = None if video_a is None or len(video_a) <= 0 else video_a.float()
    b = None if video_b is None or len(video_b) <= 0 else video_b.float()

    if swap:
        a, b = b, a

    # one side only -> just show it
    if a is None and b is None:
        return torch.zeros((1, 64, 64, 3), dtype=torch.float32)
    if a is None:
        return b.clamp(0.0, 1.0)
    if b is None:
        return a.clamp(0.0, 1.0)

    n = min(int(a.shape[0]), int(b.shape[0]))
    a = a[:n]
    b = b[:n]

    if mode == "Side by Side":
        h = max(int(a.shape[1]), int(b.shape[1]))
        wa = max(1, round(int(a.shape[2]) * h / max(1, int(a.shape[1]))))
        wb = max(1, round(int(b.shape[2]) * h / max(1, int(b.shape[1]))))
        return torch.cat([_resize_to(a, h, wa), _resize_to(b, h, wb)], dim=2).clamp(0.0, 1.0)

    # all remaining modes work on a common canvas (A's size)
    h, w = int(a.shape[1]), int(a.shape[2])
    b = _resize_to(b, h, w)
    a = a.clamp(0.0, 1.0)
    b = b.clamp(0.0, 1.0)

    if mode == "Difference":
        return (a - b).abs().clamp(0.0, 1.0)

    if mode == "Toggle":
        # blink comparator: swap the whole frame A<->B a few times a second
        blink = max(1, int(round(float(fps) * 0.4)))
        out = a.clone()
        idx = torch.arange(n)
        show_b = ((idx // blink) % 2) == (0 if toggle_image == "B" else 1)
        out[show_b] = b[show_b]
        return out

    # Slider (default): left part = A, right part = B, thin divider
    split_col = max(1, min(w - 1, int(round(w * float(split_position)))))
    out = a.clone()
    out[:, :, split_col:, :] = b[:, :, split_col:, :]
    line = max(1, w // 400)
    lo = max(0, split_col - line)
    hi = min(w, split_col + line)
    out[:, :, lo:hi, :] = 1.0
    return out.clamp(0.0, 1.0)


# --------------------------------------------------------------------------- #
# Pillow animated-WebP preview (pure Pillow, no external process)
# --------------------------------------------------------------------------- #
def _write_animated_webp(batch, out_path, fps, max_side=720, max_frames=900):
    """Write the composited batch to a looping animated WebP using Pillow
    (a hard ComfyUI dependency). Preview is spatially capped and frame-
    sampled so long/high-res clips stay light; the IMAGE output keeps
    full resolution."""
    import numpy as np
    import torch
    from PIL import Image

    n = int(batch.shape[0])
    if n <= 0:
        return False

    # frame-sample very long clips so the preview file stays reasonable
    if n > max_frames:
        sel = torch.linspace(0, n - 1, max_frames).round().long()
        batch = batch[sel]
        n = int(batch.shape[0])

    h, w = int(batch.shape[1]), int(batch.shape[2])
    scale = min(1.0, float(max_side) / float(max(h, w)))
    if scale < 1.0:
        batch = _resize_to(batch, max(1, int(h * scale)), max(1, int(w * scale)))

    arr = (
        batch.detach()[..., :3].clamp(0.0, 1.0).mul(255.0).round()
        .to(torch.uint8).cpu().numpy()
    )
    frames = [Image.fromarray(np.ascontiguousarray(arr[i])) for i in range(n)]
    duration = max(1, int(round(1000.0 / max(0.1, float(fps)))))
    frames[0].save(
        out_path,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        quality=80,
        method=4,
    )
    return True


def _shared_timeline_fps(count_a, count_b, fps):
    """Same shared-timeline math as the original node: both clips occupy
    the same duration so upscale stays frame-locked and FPS-interpolated
    clips just play smoother."""
    ref_count = count_a if count_a > 0 else count_b
    duration = (ref_count / fps) if ref_count > 0 else 0.0
    fps_a = (count_a / duration) if (count_a > 0 and duration > 0) else fps
    fps_b = (count_b / duration) if (count_b > 0 and duration > 0) else fps
    return duration, fps_a, fps_b


# --------------------------------------------------------------------------- #
# Phase-1 preview: per-frame WebP sequence for the JS canvas player
# (pure torch + Pillow; written to ComfyUI temp, served by the existing
#  /view route — no new server route, no encoder, no temp deletion)
# --------------------------------------------------------------------------- #
PREVIEW_MAX_H = 720
PREVIEW_MAX_FRAMES = 240
PREVIEW_FPS_CAP = 30.0
PREVIEW_WEBP_QUALITY = 85


def _sample_indices(count, n):
    """n source indices spread evenly across `count` so A and B span the
    same duration (shared timeline) regardless of native frame counts."""
    import torch

    if count <= 0 or n <= 0:
        return []
    if count == 1:
        return [0] * n
    return [int(i) for i in torch.linspace(0, count - 1, n).round().long().tolist()]


def _export_frame_sequence(video, side, abs_dir, indices, max_h, quality):
    """Downscaled preview frames, one WebP per frame, for the canvas
    player. Returns (filenames, preview_w, preview_h)."""
    import os

    import numpy as np
    import torch
    from PIL import Image

    if video is None or len(video) <= 0 or not indices:
        return [], 0, 0
    v = video.float()
    src_n, h, w = int(v.shape[0]), int(v.shape[1]), int(v.shape[2])
    scale = min(1.0, float(max_h) / float(max(1, h)))
    out_h = max(1, int(round(h * scale)))
    out_w = max(1, int(round(w * scale)))
    if (out_h, out_w) != (h, w):
        v = _resize_to(v, out_h, out_w)
    names = []
    for ord_i, src_i in enumerate(indices):
        fr = v[min(int(src_i), src_n - 1)]
        arr = (
            fr[..., :3].clamp(0.0, 1.0).mul(255.0).round()
            .to(torch.uint8).cpu().numpy()
        )
        fn = f"{side}_{ord_i:06d}.webp"
        Image.fromarray(np.ascontiguousarray(arr)).save(
            os.path.join(abs_dir, fn), format="WEBP",
            quality=int(quality), method=4,
        )
        names.append(fn)
    return names, out_w, out_h


def _export_pcm(audio, name, abs_dir, max_seconds=0.0):
    """Write a ComfyUI AUDIO payload as planar little-endian float32 raw
    PCM (channel-major: all ch0 samples, then ch1 ...) so the JS side can
    decode it straight into a WebAudio AudioBuffer. No wave/encoder, just
    numpy + a plain file write. Returns a metadata dict or None."""
    import os

    import numpy as np
    import torch

    if not _has_audio(audio):
        return None
    wf, sr = _extract_waveform(audio)
    sr = int(sr or 44100)
    if not hasattr(wf, "dim"):
        wf = torch.as_tensor(np.asarray(wf))
    t = wf.float()
    if t.dim() == 3:
        t = t[0]
    if t.dim() == 1:
        t = t.unsqueeze(0)
    if t.dim() != 2:
        return None
    ch, n = int(t.shape[0]), int(t.shape[1])
    if ch > 8 and n <= 8:                 # [samples, channels] -> [C, N]
        t = t.transpose(0, 1).contiguous()
        ch, n = n, ch
    if ch <= 0 or n <= 0:
        return None
    if max_seconds and max_seconds > 0:   # cap to the played window
        n = min(n, max(1, int(round(float(max_seconds) * sr))))
        t = t[:, :n]
    arr = np.ascontiguousarray(
        t.detach().clamp(-1.0, 1.0).cpu().numpy().astype(np.float32)
    )  # [C, N] planar
    fn = f"{name}.f32"
    with open(os.path.join(abs_dir, fn), "wb") as fh:
        fh.write(arr.tobytes())
    return {
        "filename": fn, "channels": int(ch), "samples": int(n),
        "sample_rate": int(sr), "dtype": "f32le", "layout": "planar",
    }


_COMMON_INPUTS = {
    "mode": (COMPARE_MODES, {"default": "Slider"}),
    "split_position": ("FLOAT", {"default": 0.5, "min": 0.02, "max": 0.98, "step": 0.01}),
    "toggle_image": (TOGGLE_CHOICES, {"default": "B"}),
    "swap": ("BOOLEAN", {"default": False}),
    "fps": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 240.0, "step": 0.01}),
}


# --------------------------------------------------------------------------- #
# Variant A — in-node Pillow preview (no sound, no external process)
# --------------------------------------------------------------------------- #
class DenoVideoComparePreview:
    DESCRIPTION = (
        "A/B video compare (Registry-clean test build). Composites Slider / "
        "Side by Side / Difference / Toggle entirely as tensors and shows a "
        "looping animated preview INSIDE the node via Pillow (a core ComfyUI "
        "dependency). The preview has no audio (use the VHS variant for sound). "
        "The 'comparison' output is the full-resolution composited clip."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": dict(_COMMON_INPUTS),
            "optional": {
                "video_a": ("IMAGE",),
                "video_b": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("comparison",)
    FUNCTION = "compare_videos"
    CATEGORY = "Deno/Image"
    OUTPUT_NODE = True

    def compare_videos(self, mode, split_position, toggle_image, swap, fps,
                       video_a=None, video_b=None):
        import os
        import uuid

        import folder_paths

        mode = _normalize_mode(mode)
        split_position = _normalize_split(split_position)
        toggle_image = _normalize_toggle(toggle_image)
        swap = _normalize_bool(swap)
        fps = _normalize_fps(fps)

        _, _, count_a = _video_size(video_a)
        _, _, count_b = _video_size(video_b)
        _duration, fps_a, _fps_b = _shared_timeline_fps(count_a, count_b, fps)

        comparison = _composite_frames(
            mode, video_a, video_b, split_position, swap, toggle_image, fps
        )

        images = []
        error = None
        try:
            temp_dir = folder_paths.get_temp_directory()
            os.makedirs(temp_dir, exist_ok=True)
            filename = f"deno.vcmp.{uuid.uuid4().hex[:10]}.webp"
            out_path = os.path.join(temp_dir, filename)
            if _write_animated_webp(comparison, out_path, fps_a or fps):
                images = [{"filename": filename, "subfolder": "", "type": "temp"}]
        except Exception as exc:  # preview failure must not fail the graph
            error = f"preview_failed: {exc}"[:200]

        ui = {"images": images, "compare_meta": [{
            "mode": mode, "fps": round(fps_a or fps, 4),
            "frames": int(comparison.shape[0]),
            "width": int(comparison.shape[2]),
            "height": int(comparison.shape[1]),
            **({"error": error} if error else {}),
        }]}
        return {"ui": ui, "result": (comparison,)}


# --------------------------------------------------------------------------- #
# Variant B — frames + audio out for the standard VHS Video Combine
# --------------------------------------------------------------------------- #
class DenoVideoCompareVHS:
    DESCRIPTION = (
        "A/B video compare (Registry-clean test build). Composites Slider / "
        "Side by Side / Difference / Toggle as tensors and outputs the clip "
        "plus an AUDIO passthrough. Encoding is delegated — wire "
        "'comparison' + 'audio' into the standard VHS Video Combine to get a "
        "playable file WITH sound (template workflow provided)."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": dict(_COMMON_INPUTS),
            "optional": {
                "video_a": ("IMAGE",),
                "video_b": ("IMAGE",),
                "audio_a": ("AUDIO",),
                "audio_b": ("AUDIO",),
            },
        }

    RETURN_TYPES = ("IMAGE", "AUDIO")
    RETURN_NAMES = ("comparison", "audio")
    FUNCTION = "compare_videos"
    CATEGORY = "Deno/Image"

    def compare_videos(self, mode, split_position, toggle_image, swap, fps,
                       video_a=None, video_b=None, audio_a=None, audio_b=None):
        mode = _normalize_mode(mode)
        split_position = _normalize_split(split_position)
        toggle_image = _normalize_toggle(toggle_image)
        swap = _normalize_bool(swap)
        fps = _normalize_fps(fps)

        comparison = _composite_frames(
            mode, video_a, video_b, split_position, swap, toggle_image, fps
        )

        # follow the same swap so the audio matches the "left/base" clip
        primary, secondary = (audio_b, audio_a) if swap else (audio_a, audio_b)
        audio = _passthrough_audio(primary if _has_audio(primary) else secondary)
        return (comparison, audio)


# --------------------------------------------------------------------------- #
# Variant ③-lite — interactive canvas player (Phase 1: no audio yet)
# Recreates the original Video Compare feel (drag slider / SbS / Difference /
# Toggle / synced playback / swap) with ZERO encoder: the node exports a
# downscaled WebP frame sequence for A and B, a JS canvas player composites
# them live, and the 'comparison' output stays full-resolution lossless.
# --------------------------------------------------------------------------- #
class DenoVideoComparePlayer:
    DESCRIPTION = (
        "A/B video compare with an in-node interactive player (Registry-clean). "
        "Drag-slider / Side by Side / Difference / Toggle + synced playback, "
        "rendered on a canvas from a temp WebP frame sequence (no encoder, "
        "served via the existing /view route). The 'comparison' "
        "output is the full-resolution lossless composite. Audio arrives in a "
        "later phase."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": dict(_COMMON_INPUTS),
            "optional": {
                "video_a": ("IMAGE",),
                "video_b": ("IMAGE",),
                "audio_a": ("AUDIO",),
                "audio_b": ("AUDIO",),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("comparison",)
    FUNCTION = "compare_videos"
    CATEGORY = "Deno/Image"
    OUTPUT_NODE = True

    def compare_videos(self, mode, split_position, toggle_image, swap, fps,
                       video_a=None, video_b=None, audio_a=None, audio_b=None):
        import os
        import uuid

        import folder_paths

        mode = _normalize_mode(mode)
        split_position = _normalize_split(split_position)
        toggle_image = _normalize_toggle(toggle_image)
        swap = _normalize_bool(swap)
        fps = _normalize_fps(fps)

        wa, ha, ca = _video_size(video_a)
        wb, hb, cb = _video_size(video_b)

        # full-resolution lossless output (reflects the widget values; the
        # live in-node slider only re-composites the preview, and writes the
        # dragged split back to the widget so the next queue matches)
        comparison = _composite_frames(
            mode, video_a, video_b, split_position, swap, toggle_image, fps
        )

        duration, _fa, _fb = _shared_timeline_fps(ca, cb, fps)
        preview_fps = min(float(fps), PREVIEW_FPS_CAP)
        if duration > 0:
            n = int(round(duration * preview_fps))
        else:
            n = max(ca, cb)
        n = max(1, min(PREVIEW_MAX_FRAMES, n))

        meta = {
            "mode": mode,
            "split_position": split_position,
            "toggle_image": toggle_image,
            "swap": swap,
            "fps": round(preview_fps, 4),
            "source_fps": round(float(fps), 4),
            "duration": round(duration, 4),
            "have_a": ca > 0,
            "have_b": cb > 0,
            "a_src_w": wa, "a_src_h": ha, "a_count": ca,
            "b_src_w": wb, "b_src_h": hb, "b_count": cb,
            "preview_downscaled": True,
            "output_fullres": True,
        }
        files_a, files_b = [], []
        audio_meta_a = audio_meta_b = None
        try:
            if ca > 0 or cb > 0:
                temp_dir = folder_paths.get_temp_directory()
                sub = "deno_vcmp_" + uuid.uuid4().hex[:12]
                abs_dir = os.path.join(temp_dir, sub)
                os.makedirs(abs_dir, exist_ok=True)
                ia = _sample_indices(ca, n) if ca > 0 else []
                ib = _sample_indices(cb, n) if cb > 0 else []
                files_a, paw, pah = _export_frame_sequence(
                    video_a, "a", abs_dir, ia, PREVIEW_MAX_H, PREVIEW_WEBP_QUALITY)
                files_b, pbw, pbh = _export_frame_sequence(
                    video_b, "b", abs_dir, ib, PREVIEW_MAX_H, PREVIEW_WEBP_QUALITY)
                meta["subfolder"] = sub
                meta["frame_count"] = max(len(files_a), len(files_b))
                meta["a_w"], meta["a_h"] = paw, pah
                meta["b_w"], meta["b_h"] = pbw, pbh
                # Phase 2: raw PCM next to the frames (swap is resolved on
                # the JS side, so keep a_audio == video_a's audio)
                try:
                    cap = duration if duration > 0 else 0.0
                    audio_meta_a = _export_pcm(audio_a, "a_audio", abs_dir, cap)
                    audio_meta_b = _export_pcm(audio_b, "b_audio", abs_dir, cap)
                except Exception as aexc:
                    meta["audio_error"] = f"audio_failed: {aexc}"[:160]
            else:
                meta["frame_count"] = 0
        except Exception as exc:  # preview failure must not fail the graph
            meta["error"] = f"preview_failed: {exc}"[:200]
            meta["frame_count"] = 0

        return {
            "ui": {"deno_video_compare": [dict(
                meta, files_a=files_a, files_b=files_b,
                audio_a=audio_meta_a, audio_b=audio_meta_b,
            )]},
            "result": (comparison,),
        }
