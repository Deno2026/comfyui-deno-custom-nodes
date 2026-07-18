"""(Deno) Video Compare — interactive A/B video comparison.

All compositing (Slider / Side by Side / Difference / Toggle) is pure
tensor work. The node spawns no external process and makes no network
calls — only torch, numpy and Pillow (all core ComfyUI dependencies).
For the in-node player it writes a downscaled WebP frame sequence (and
raw float32 PCM for audio) into ComfyUI's temp dir, served by the
existing /view route; the canvas frontend plays it on a virtual clock
with exact A/B sync. The ``comparison`` output is always the
full-resolution lossless composite (optionally with the A/B + resolution
labels burned in for the saved video).
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

    count_a = int(a.shape[0])
    count_b = int(b.shape[0])
    n = min(count_a, count_b)
    if count_a == count_b:
        # Keep the long-standing equal-batch path bit-for-bit direct.
        a = a[:n]
        b = b[:n]
    else:
        # The output length remains the shorter batch for saved-workflow and
        # downstream compatibility, but the longer clip now spans its whole
        # timeline instead of silently dropping every frame after ``n``.
        # Keep the shorter clip on its direct slice and resample only the
        # longer side. For a one-frame output _sample_indices returns [0],
        # preserving the historical first-frame result.
        a = a[_sample_indices(count_a, n)] if count_a > n else a[:n]
        b = b[_sample_indices(count_b, n)] if count_b > n else b[:n]

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

    # Slider (default): left part = A, right part = B, DENO green divider.
    split_col = max(1, min(w - 1, int(round(w * float(split_position)))))
    out = a.clone()
    out[:, :, split_col:, :] = b[:, :, split_col:, :]
    line = max(1, w // 400)
    lo = max(0, split_col - line)
    hi = min(w, split_col + line)
    out[:, :, lo:hi, :] = out.new_tensor((72 / 255, 1.0, 132 / 255))
    return out.clamp(0.0, 1.0)


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
# Preview economy is SPATIAL ONLY (downscale tall frames + WebP). There is
# deliberately no frame-count / fps ceiling: every frame is previewed at the
# real fps so long clips preview at full fidelity (the user's call). The
# browser stays bounded via an LRU near the playhead; the cost that scales
# with length is temp-disk + node write time, an inherent encoder-free
# tradeoff. The `comparison` output is always full-resolution regardless.
PREVIEW_MAX_H = 720
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


def _load_font(px):
    """Best-effort scalable font; degrades gracefully with no hard dep."""
    from PIL import ImageFont

    px = max(8, int(px))
    for name in ("DejaVuSans.ttf", "arial.ttf", "Arial.ttf"):
        try:
            return ImageFont.truetype(name, px)
        except Exception:
            pass
    try:                                  # Pillow >= 10.1 sizes the default
        return ImageFont.load_default(px)
    except Exception:
        return ImageFont.load_default()


def _burn_ab_labels(frames, a_dims, b_dims, swap):
    """Burn the A/B badge + 'WxH · Nf' pill into the full-res comparison
    frames (top-left = A, top-right = B), mirroring the in-node corner
    style. The overlay is identical on every frame, so it is rendered ONCE
    as an RGBA layer and alpha-composited over the whole batch in one op —
    cheap even for long clips. Pure torch + Pillow."""
    import numpy as np
    import torch
    from PIL import Image, ImageDraw

    if frames is None or frames.dim() != 4 or frames.shape[0] <= 0:
        return frames
    N, H, W = int(frames.shape[0]), int(frames.shape[1]), int(frames.shape[2])
    if H < 24 or W < 48:
        return frames

    wa, ha, ca = a_dims
    wb, hb, cb = b_dims
    # match what the pixels actually show after swap
    left_lbl, right_lbl = ("B", "A") if swap else ("A", "B")
    left_dims = (wb, hb, cb) if swap else (wa, ha, ca)
    right_dims = (wa, ha, ca) if swap else (wb, hb, cb)

    pad = max(6, round(H * 0.018))
    bd = max(20, round(H * 0.058))            # badge diameter
    fpx = max(11, round(H * 0.028))           # font size
    font = _load_font(fpx)

    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(layer)

    def _text_w(s):
        try:
            return dr.textlength(s, font=font)
        except Exception:
            return len(s) * fpx * 0.6

    def _rrect(x0, y0, x1, y1, fill):
        try:
            dr.rounded_rectangle([x0, y0, x1, y1],
                                 radius=max(4, (y1 - y0) // 2), fill=fill)
        except Exception:
            dr.rectangle([x0, y0, x1, y1], fill=fill)

    def _group(side_lbl, dims, anchor_right):
        w_, h_, c_ = dims
        info = f"{int(w_)}×{int(h_)} · {int(c_)}f" if w_ > 0 else side_lbl
        ty = pad
        # badge circle
        cy0 = ty
        if anchor_right:
            bx1 = W - pad
            bx0 = bx1 - bd
        else:
            bx0 = pad
            bx1 = bx0 + bd
        # info pill
        tw = _text_w(info)
        pill_w = int(tw) + 2 * pad
        pill_h = bd
        gap = max(4, pad // 2)
        if anchor_right:
            px1 = bx0 - gap
            px0 = px1 - pill_w
        else:
            px0 = bx1 + gap
            px1 = px0 + pill_w
        _rrect(px0, cy0, px1, cy0 + pill_h, (7, 16, 11, 200))
        ti_y = cy0 + (pill_h - fpx) // 2
        dr.text((px0 + pad, ti_y), info, font=font, fill=(157, 255, 186, 255))
        dr.ellipse([bx0, cy0, bx1, cy0 + bd], fill=(17, 118, 56, 235),
                   outline=(191, 255, 208, 255), width=max(1, bd // 14))
        lw = _text_w(side_lbl)
        dr.text((bx0 + (bd - lw) / 2, cy0 + (bd - fpx) // 2),
                side_lbl, font=font, fill=(239, 255, 244, 255))

    _group(left_lbl, left_dims, False)
    _group(right_lbl, right_dims, True)

    ov = torch.from_numpy(
        np.ascontiguousarray(np.asarray(layer, dtype=np.float32) / 255.0)
    ).to(frames.device)                       # [H, W, 4]
    rgb = ov[..., :3].unsqueeze(0)            # [1,H,W,3]
    alpha = ov[..., 3:4].unsqueeze(0)         # [1,H,W,1]
    out = frames.float() * (1.0 - alpha) + rgb * alpha
    return out.clamp(0.0, 1.0)


_COMMON_INPUTS = {
    "mode": (COMPARE_MODES, {"default": "Slider"}),
    "split_position": ("FLOAT", {"default": 0.5, "min": 0.02, "max": 0.98, "step": 0.01}),
    "toggle_image": (TOGGLE_CHOICES, {"default": "B"}),
    "swap": ("BOOLEAN", {"default": False}),
    "fps": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 240.0, "step": 0.01}),
}


# --------------------------------------------------------------------------- #
# The single (Deno) Video Compare node. All compositing is pure tensor
# work; the in-node player is fed a temp WebP frame sequence (+ raw f32
# PCM for audio) via the existing /view route — no media encoder.
# --------------------------------------------------------------------------- #
class DenoVideoCompare:
    DESCRIPTION = (
        "Interactive A/B video compare: drag-slider / Side by Side / "
        "Difference / Toggle, synced playback with audio (hover the preview "
        "to hear that side), Swap, and an optional Labels burn-in. Rendered "
        "on a canvas from a temp frame sequence (no media encoder). The "
        "'comparison' output is the full-resolution lossless composite."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": dict(
                _COMMON_INPUTS,
                burn_labels=("BOOLEAN", {
                    "default": False, "label_on": "on", "label_off": "off",
                }),
            ),
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

    @classmethod
    def VALIDATE_INPUTS(cls, mode=None, toggle_image=None):
        return True

    def compare_videos(self, mode, split_position, toggle_image, swap, fps,
                       burn_labels=False,
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
        # optionally burn the A/B + resolution labels into the SAVED output
        # only (the in-node preview already shows them as a DOM overlay)
        if _normalize_bool(burn_labels) and (ca > 0 or cb > 0):
            try:
                comparison = _burn_ab_labels(
                    comparison, (wa, ha, ca), (wb, hb, cb), swap)
            except Exception:
                pass  # never fail the graph over a label overlay

        duration, _fa, _fb = _shared_timeline_fps(ca, cb, fps)
        # No cap: preview every frame of the richer side at the real fps so
        # both clips keep their full smoothness over the shared timeline.
        preview_fps = float(fps)
        n = max(1, max(ca, cb))
        preview_capped = False

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
            "preview_capped": bool(preview_capped),
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
