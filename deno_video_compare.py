from nodes import PreviewImage


COMPARE_MODES = ["Slider", "Side by Side", "Difference", "Toggle"]
TOGGLE_CHOICES = ["A", "B"]


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


def _find_ffmpeg():
    """Locate an ffmpeg binary without adding a hard dependency.

    Order: imageio-ffmpeg (bundled in most ComfyUI / VideoHelperSuite
    installs) -> system PATH. Returns the executable path or None.
    """
    import os
    import shutil

    try:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and os.path.isfile(exe):
            return exe
    except Exception:
        pass

    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    return None


def _extract_waveform(audio):
    """Pull (waveform, sample_rate) out of the many AUDIO shapes nodes emit:
    a dict, an object with attributes, a (waveform, sr) tuple, or a bare
    tensor/array. Returns (None, None) if nothing usable is found.
    """
    if audio is None:
        return None, None
    wf = sr = None
    if isinstance(audio, dict):
        wf = audio.get("waveform")
        sr = audio.get("sample_rate")
    else:
        wf = getattr(audio, "waveform", None)
        sr = getattr(audio, "sample_rate", None)
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


def _write_wav(audio, path) -> bool:
    """Write a ComfyUI AUDIO payload to a 16-bit PCM WAV (stdlib only)."""
    import wave

    import numpy as np
    import torch

    wf, sr = _extract_waveform(audio)
    if wf is None:
        return False
    sr = int(sr or 44100)
    if not hasattr(wf, "dim"):
        wf = torch.as_tensor(np.asarray(wf))
    t = wf.float()
    if t.dim() == 3:
        t = t[0]
    if t.dim() == 1:
        t = t.unsqueeze(0)
    if t.dim() != 2:
        return False
    channels = int(t.shape[0])
    n = int(t.shape[1])
    # some sources hand back [samples, channels]; flip if obviously so
    if channels > 8 and n <= 8:
        t = t.transpose(0, 1).contiguous()
        channels, n = n, channels
    if channels <= 0 or n <= 0:
        return False
    pcm = (
        t.detach().clamp(-1.0, 1.0).mul(32767.0).round()
        .to(torch.int16).cpu().numpy()
    )  # [C, N]
    interleaved = np.ascontiguousarray(pcm.T).reshape(-1)
    with wave.open(path, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(interleaved.tobytes())
    return True


def _encode_video(video, ffmpeg_exe, out_path, enc_fps, audio_wav=None):
    """Stream an IMAGE batch frame-by-frame into ffmpeg as H.264/yuv420p.

    Frames are converted one at a time so a 4K clip never materialises a
    full float copy of the whole batch in RAM. When ``audio_wav`` is given
    it is muxed as an AAC track aligned to the (shared) clip duration.
    """
    import subprocess

    import numpy as np
    import torch

    n = int(video.shape[0])
    h = int(video.shape[1])
    w = int(video.shape[2])
    c = int(video.shape[3]) if video.dim() >= 4 else 3
    enc_fps = max(0.1, float(enc_fps))

    args = [
        ffmpeg_exe, "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{w}x{h}", "-r", f"{enc_fps:.6f}", "-i", "-",
    ]
    if audio_wav:
        args += ["-i", audio_wav]
    args += [
        "-vf", "crop=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "veryfast", "-crf", "20",
    ]
    if audio_wav:
        args += [
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:a", "aac", "-b:a", "192k", "-shortest",
        ]
    else:
        args += ["-an"]
    args += ["-movflags", "+faststart", out_path]

    proc = subprocess.Popen(
        args,
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    try:
        for i in range(n):
            frame = video[i]
            if c == 4:
                frame = frame[..., :3]
            arr = (
                frame.detach().clamp(0.0, 1.0).mul(255.0).round()
                .to(torch.uint8).cpu().numpy()
            )
            proc.stdin.write(np.ascontiguousarray(arr).tobytes())
        proc.stdin.close()
        err = proc.stderr.read()
        ret = proc.wait()
        if ret != 0:
            msg = (err or b"").decode("utf-8", "ignore").strip()
            raise RuntimeError(msg[:400] or f"ffmpeg exited {ret}")
    finally:
        try:
            proc.stderr.close()
        except Exception:
            pass


class DenoVideoCompare(PreviewImage):
    DESCRIPTION = (
        "DENO A/B video comparison node with synced playback, Slider, Side by Side, "
        "Difference, Toggle, Swap, and a shared timeline so upscale and FPS-interpolation "
        "results stay the same length while frame-rate differences show as smoothness. "
        "Encodes each input to a compressed preview clip (optionally with its audio) so "
        "high-res / long batches stay light instead of writing a full PNG sequence."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode": (COMPARE_MODES, {"default": "Slider"}),
                "split_position": ("FLOAT", {"default": 0.5, "min": 0.02, "max": 0.98, "step": 0.01}),
                "toggle_image": (TOGGLE_CHOICES, {"default": "B"}),
                "swap": ("BOOLEAN", {"default": False}),
                "fps": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 240.0, "step": 0.01}),
            },
            "optional": {
                "video_a": ("IMAGE",),
                "video_b": ("IMAGE",),
                "audio_a": ("AUDIO",),
                "audio_b": ("AUDIO",),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "compare_videos"
    CATEGORY = "Deno/Image"
    OUTPUT_NODE = True

    def _preview_clip(self, video, side, enc_fps, ffmpeg_exe, audio):
        """Encode one IMAGE batch (+ optional audio) to a temp mp4.

        Returns (entries, has_audio, note) where note is a short diagnostic
        string so the frontend can show why audio is / isn't present.
        """
        if not ffmpeg_exe:
            return [], False, "no_ffmpeg"
        if video is None or len(video) <= 0:
            return [], False, "no_video"

        import os
        import uuid

        import folder_paths

        temp_dir = folder_paths.get_temp_directory()
        os.makedirs(temp_dir, exist_ok=True)
        token = uuid.uuid4().hex[:10]
        filename = f"deno.vcompare.{side}.{token}.mp4"
        out_path = os.path.join(temp_dir, filename)

        wav_path = None
        has_audio = False
        note = "no_input"
        try:
            if audio is None:
                note = "no_input"
            elif not _has_audio(audio):
                note = "no_waveform:" + type(audio).__name__
            else:
                wav_path = os.path.join(temp_dir, f"deno.vcompare.{side}.{token}.wav")
                try:
                    has_audio = _write_wav(audio, wav_path)
                    note = "muxed" if has_audio else "empty_audio"
                except Exception as exc:
                    has_audio = False
                    wav_path = None
                    note = f"write_failed: {exc}"[:120]
            _encode_video(
                video, ffmpeg_exe, out_path, enc_fps,
                wav_path if has_audio else None,
            )
        finally:
            if wav_path:
                try:
                    os.remove(wav_path)
                except Exception:
                    pass
        return [{"filename": filename, "subfolder": "", "type": "temp"}], has_audio, note

    def compare_videos(
        self,
        mode: str,
        split_position: float,
        toggle_image: str,
        swap: bool,
        fps: float,
        video_a=None,
        video_b=None,
        audio_a=None,
        audio_b=None,
        prompt=None,
        extra_pnginfo=None,
    ):
        mode = _normalize_mode(mode)
        split_position = _normalize_split(split_position)
        toggle_image = _normalize_toggle(toggle_image)
        swap = _normalize_bool(swap)
        fps = _normalize_fps(fps)

        width_a, height_a, count_a = _video_size(video_a)
        width_b, height_b, count_b = _video_size(video_b)

        # Shared timeline: both clips encoded to the SAME duration so
        # upscale (equal count) stays frame-locked and RIFE (more frames)
        # just plays smoother over the same length.
        ref_count = count_a if count_a > 0 else count_b
        duration = (ref_count / fps) if ref_count > 0 else 0.0
        fps_a = (count_a / duration) if (count_a > 0 and duration > 0) else fps
        fps_b = (count_b / duration) if (count_b > 0 and duration > 0) else fps

        ffmpeg_exe = _find_ffmpeg()
        error = None
        a_video, b_video = [], []
        a_has_audio = b_has_audio = False
        a_note = b_note = ""
        if ffmpeg_exe is None:
            error = "ffmpeg_not_found"
        else:
            try:
                a_video, a_has_audio, a_note = self._preview_clip(
                    video_a, "a", fps_a, ffmpeg_exe, audio_a)
                b_video, b_has_audio, b_note = self._preview_clip(
                    video_b, "b", fps_b, ffmpeg_exe, audio_b)
            except Exception as exc:  # encoding failure -> show message, no crash
                error = f"encode_failed: {exc}"
                a_video, b_video = [], []
                a_has_audio = b_has_audio = False

        meta = {
            "mode": mode,
            "split_position": split_position,
            "toggle_image": toggle_image,
            "swap": swap,
            "fps": fps,
            "a_width": width_a,
            "a_height": height_a,
            "a_count": count_a,
            "a_fps": round(fps_a, 4),
            "a_has_audio": bool(a_has_audio),
            "a_audio": a_note,
            "b_width": width_b,
            "b_height": height_b,
            "b_count": count_b,
            "b_fps": round(fps_b, 4),
            "b_has_audio": bool(b_has_audio),
            "b_audio": b_note,
            "duration": round(duration, 4),
        }
        if error:
            meta["error"] = error

        return {"ui": {
            "a_video": a_video,
            "b_video": b_video,
            "compare_meta": [meta],
        }}
