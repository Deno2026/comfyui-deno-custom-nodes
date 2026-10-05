"""Input-folder audio references and bounded, same-origin H3 previews."""

from __future__ import annotations

import asyncio
import io as byte_io
import json
import ntpath
import os
import threading
import time
import wave
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode

import numpy as np
import torch
from aiohttp import web
from server import PromptServer

from .deno_multi_image_board import (
    _blocked_input_items_notice,
    _empty_input_folder_listing,
    _get_folder_paths,
    _normalize_input_browser_path,
    _path_is_within_root,
    _resolve_input_browser_dir,
)


MAX_REFERENCE_AUDIOS = 3
REFERENCE_AUDIO_EXTENSIONS = frozenset({
    ".wav", ".mp3", ".flac", ".ogg", ".oga", ".opus", ".m4a", ".aac", ".aif", ".aiff",
})
# Bound local decoding and preview work independently of compressed duration.
MAX_AUDIO_FILE_BYTES = 256 * 1024 * 1024
MAX_DECODED_AUDIO_BYTES = 128 * 1024 * 1024
AUDIO_DECODE_SECONDS = 30.0
# Two decoder workers plus at most two waiting requests allow a three-file
# upload to load all of its metadata without an unbounded executor queue.
_preview_slots = threading.BoundedSemaphore(4)
_preview_executor = None
_preview_executor_lock = threading.Lock()


def parse_audio_sources(audio_sources: str = "[]") -> list[dict]:
    """Keep physical card slots, including disabled records, separate from tags."""
    if not isinstance(audio_sources, str):
        raise ValueError("Audio sources must be a JSON array saved by the DENO reference loader.")
    try:
        rows = json.loads(audio_sources)
    except (TypeError, ValueError) as exc:
        raise ValueError("Audio sources contain invalid JSON. Re-add the audio files.") from exc
    if not isinstance(rows, list):
        raise ValueError("Audio sources must be a JSON array.")
    if len(rows) > MAX_REFERENCE_AUDIOS:
        raise ValueError("MiniMax H3 supports at most 3 registered standalone audio files. Remove extra files.")
    ids = set()
    normalized = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"Audio record {index + 1} must be an object.")
        if set(row) != {"id", "path", "enabled"}:
            raise ValueError(f"Audio record {index + 1} contains unsupported or missing saved fields. Restore the workflow before editing it.")
        identity = row.get("id")
        if not isinstance(identity, str) or not identity.strip() or identity in ids:
            raise ValueError(f"Audio record {index + 1} has a missing or duplicate file identity.")
        if not isinstance(row.get("path"), str):
            raise ValueError(f"Audio record {index + 1} is missing its saved path.")
        if type(row.get("enabled")) is not bool:
            raise ValueError(f"Audio record {index + 1} must have a true/false enabled state.")
        ids.add(identity)
        normalized.append({"id": identity, "path": row["path"], "enabled": row["enabled"]})
    return normalized


def resolve_reference_audio_path(path: str) -> str:
    if not isinstance(path, str) or not path.strip() or "\x00" in path:
        raise ValueError("Choose an audio file inside the ComfyUI input folder.")
    raw_path = path.replace("\\", "/")
    if ntpath.isabs(raw_path) or ":" in raw_path or raw_path.startswith("/"):
        raise ValueError("Absolute audio paths are not allowed. Use Upload or Input Folder.")
    normalized = _normalize_input_browser_path(raw_path)
    if normalized is None or not normalized:
        raise ValueError("This audio path leaves the ComfyUI input folder.")
    if os.path.splitext(normalized)[1].lower() not in REFERENCE_AUDIO_EXTENSIONS:
        raise ValueError("Choose a supported audio file; video files are not supported by this loader.")
    folder_paths = _get_folder_paths()
    if folder_paths is None or not hasattr(folder_paths, "get_input_directory"):
        raise ValueError("The ComfyUI input folder is unavailable.")
    root = folder_paths.get_input_directory()
    resolved = os.path.realpath(os.path.join(root, normalized))
    if not _path_is_within_root(root, resolved):
        raise ValueError("This audio path resolves outside the ComfyUI input folder.")
    if not os.path.isfile(resolved):
        raise ValueError(f"Audio file is missing: {path}. Re-add it with Upload or Input Folder.")
    if os.path.getsize(resolved) > MAX_AUDIO_FILE_BYTES:
        raise ValueError("Audio file is too large to load (maximum 256 MiB). Use a shorter audio file.")
    return resolved


def decode_reference_audio(path: str) -> dict:
    """Use stock LoadAudio's PyAV decoding layout and PCM conversion, with bounds."""
    import av

    resolved = resolve_reference_audio_path(path)
    started = time.monotonic()
    frames = []
    decoded_bytes = 0
    with av.open(resolved) as container:
        if not container.streams.audio:
            raise ValueError("No audio stream was found in the selected file.")
        stream = container.streams.audio[0]
        sample_rate = stream.codec_context.sample_rate
        channels = stream.channels
        if not sample_rate or not channels:
            raise ValueError("The audio sample rate or channel count could not be read.")
        for frame in container.decode(streams=stream.index):
            array = frame.to_ndarray()
            decoded_bytes += array.size * max(array.dtype.itemsize, 4)
            if decoded_bytes > MAX_DECODED_AUDIO_BYTES:
                raise ValueError("Decoded audio is too large (maximum 128 MiB PCM). Use a shorter audio file.")
            if time.monotonic() - started > AUDIO_DECODE_SECONDS:
                raise ValueError("Audio decoding took too long. Use a shorter audio file.")
            buffer = torch.from_numpy(array)
            if buffer.shape[0] != channels:
                buffer = buffer.view(-1, channels).t()
            frames.append(buffer)
        if not frames:
            raise ValueError("No audio frames could be decoded from the selected file.")
        waveform = torch.cat(frames, dim=1)
        if not waveform.dtype.is_floating_point:
            if waveform.dtype == torch.int16:
                waveform = waveform.float() / (2 ** 15)
            elif waveform.dtype == torch.int32:
                waveform = waveform.float() / (2 ** 31)
            else:
                raise ValueError(f"Unsupported audio sample type: {waveform.dtype}")
    if waveform.ndim != 2 or waveform.shape[1] == 0:
        raise ValueError("The selected file contains no usable audio samples.")
    if not torch.isfinite(waveform).all():
        raise ValueError("The selected file contains invalid non-finite audio samples.")
    return {"waveform": waveform.unsqueeze(0), "sample_rate": int(sample_rate)}


def reference_audio_info(path: str) -> dict:
    audio = decode_reference_audio(path)
    waveform = audio["waveform"][0].detach().cpu().numpy()
    signal = np.max(np.abs(waveform), axis=0)
    # Empty intervals in a very short clip are zero; never invent a waveform.
    peaks = [float(segment.max()) if segment.size else 0.0 for segment in np.array_split(signal, 128)]
    return {
        "duration": waveform.shape[1] / audio["sample_rate"],
        "sample_rate": audio["sample_rate"],
        "channels": waveform.shape[0],
        "peaks": peaks,
        "preview_url": "/deno/h3/reference-audio-preview?" + urlencode({"path": path}),
    }


def reference_audio_preview(path: str) -> bytes:
    audio = decode_reference_audio(path)
    waveform = audio["waveform"][0].detach().cpu().numpy()
    # Playback is a browser-friendly PCM copy. The AUDIO output keeps native values.
    pcm = np.rint(np.clip(waveform, -1.0, 1.0) * 32767.0).astype("<i2").T.copy()
    output = byte_io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(waveform.shape[0])
        wav.setsampwidth(2)
        wav.setframerate(audio["sample_rate"])
        wav.writeframes(pcm.tobytes())
    return output.getvalue()


def list_input_audio(relative_path=""):
    folder_paths = _get_folder_paths()
    normalized = _normalize_input_browser_path(relative_path)
    if normalized is None:
        raise ValueError("Invalid input folder path.")
    if folder_paths is None or not hasattr(folder_paths, "get_input_directory"):
        return _empty_input_folder_listing(normalized)
    root = folder_paths.get_input_directory()
    current = _resolve_input_browser_dir(root, normalized)
    if current is None:
        return _empty_input_folder_listing(normalized)
    result = _empty_input_folder_listing(normalized)
    try:
        with os.scandir(current) as entries:
            for entry in entries:
                if not _path_is_within_root(root, entry.path):
                    result["blocked_count"] += 1
                    continue
                try:
                    stat = entry.stat()
                    path = "/".join(part for part in (normalized, entry.name) if part)
                    if entry.is_dir():
                        result["folders"].append({"name": entry.name, "path": path, "mtime": stat.st_mtime})
                    elif entry.is_file() and os.path.splitext(entry.name)[1].lower() in REFERENCE_AUDIO_EXTENSIONS:
                        result["files"].append({"name": path, "path": path, "display_name": entry.name,
                                               "mtime": stat.st_mtime, "size": stat.st_size})
                except OSError:
                    continue
    except OSError:
        return result
    result["folders"].sort(key=lambda item: item["name"].lower())
    result["files"].sort(key=lambda item: (-item["mtime"], item["name"].lower()))
    result["notice"] = _blocked_input_items_notice(result["blocked_count"])
    return result


async def _preview_cleanup(_app):
    global _preview_executor
    with _preview_executor_lock:
        executor, _preview_executor = _preview_executor, None
    if executor is not None:
        executor.shutdown(wait=False, cancel_futures=True)


async def _audio_background(function, path):
    global _preview_executor
    if not _preview_slots.acquire(blocking=False):
        raise web.HTTPServiceUnavailable(text="Audio preview is busy. Try again shortly.")
    try:
        with _preview_executor_lock:
            if _preview_executor is None:
                _preview_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="deno-h3-audio")
        future = asyncio.get_running_loop().run_in_executor(_preview_executor, function, path)
    except Exception:
        _preview_slots.release()
        raise
    future.add_done_callback(lambda _future: _preview_slots.release())
    return await asyncio.wait_for(asyncio.shield(future), timeout=AUDIO_DECODE_SECONDS + 5)


@PromptServer.instance.routes.get("/deno/h3/reference-audio-info")
async def deno_h3_reference_audio_info(request):
    try:
        return web.json_response(await _audio_background(reference_audio_info, request.query.get("path", "")))
    except (ValueError, OSError) as exc:
        return web.json_response({"error": str(exc)}, status=400)
    except asyncio.TimeoutError:
        return web.json_response({"error": "Audio preview timed out. Use a shorter audio file."}, status=408)


@PromptServer.instance.routes.get("/deno/h3/reference-audio-preview")
async def deno_h3_reference_audio_preview(request):
    try:
        contents = await _audio_background(reference_audio_preview, request.query.get("path", ""))
    except (ValueError, OSError) as exc:
        return web.json_response({"error": str(exc)}, status=400)
    except asyncio.TimeoutError:
        return web.json_response({"error": "Audio preview timed out. Use a shorter audio file."}, status=408)
    headers = {"Accept-Ranges": "bytes", "Cache-Control": "no-store"}
    range_header = request.headers.get("Range", "")
    if range_header:
        try:
            if not range_header.startswith("bytes=") or "," in range_header:
                raise ValueError
            first, last = range_header[6:].split("-", 1)
            if first:
                start = int(first)
                end = int(last) if last else len(contents) - 1
            else:
                suffix = int(last)
                if suffix <= 0:
                    raise ValueError
                start, end = max(0, len(contents) - suffix), len(contents) - 1
            if start < 0 or start >= len(contents) or end < start:
                raise ValueError
            end = min(end, len(contents) - 1)
        except ValueError:
            return web.Response(status=416, headers={"Content-Range": f"bytes */{len(contents)}"})
        headers["Content-Range"] = f"bytes {start}-{end}/{len(contents)}"
        return web.Response(body=contents[start:end + 1], status=206, content_type="audio/wav", headers=headers)
    return web.Response(body=contents, content_type="audio/wav", headers=headers)


@PromptServer.instance.routes.get("/deno/h3/input-audios")
async def deno_h3_input_audio(request):
    try:
        return web.json_response(list_input_audio(request.query.get("path", "")))
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=400)


_app = getattr(PromptServer.instance, "app", None)
if _app is not None:
    _app.on_cleanup.append(_preview_cleanup)
