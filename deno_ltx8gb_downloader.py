from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import threading
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional

import folder_paths
from aiohttp import web
from server import PromptServer


CHUNK_SIZE = 1024 * 1024
ROUTE_PREFIX = "/deno/ltx8gb"


MODEL_FILES = [
    {
        "id": "gguf",
        "label": "GGUF model",
        "repo": "QuantStack/LTX-2.3-GGUF",
        "repo_path": "LTX-2.3-distilled-1.1/LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf",
        "target_subdir": "unet",
        "filename": "LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf",
        "size": 17_800_000_000,
    },
    {
        "id": "gemma",
        "label": "Gemma text encoder",
        "repo": "Comfy-Org/ltx-2",
        "repo_path": "split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors",
        "target_subdir": "text_encoders",
        "filename": "gemma_3_12B_it_fp4_mixed.safetensors",
        "size": 9_450_000_000,
    },
    {
        "id": "projection",
        "label": "Text projection",
        "repo": "Kijai/LTX2.3_comfy",
        "repo_path": "text_encoders/ltx-2.3_text_projection_bf16.safetensors",
        "target_subdir": "text_encoders",
        "filename": "ltx-2.3_text_projection_bf16.safetensors",
        "size": 2_310_000_000,
    },
    {
        "id": "video_vae",
        "label": "Video VAE",
        "repo": "Kijai/LTX2.3_comfy",
        "repo_path": "vae/LTX23_video_vae_bf16.safetensors",
        "target_subdir": "vae",
        "filename": "LTX23_video_vae_bf16.safetensors",
        "size": 1_450_000_000,
    },
    {
        "id": "audio_vae",
        "label": "Audio VAE",
        "repo": "Kijai/LTX2.3_comfy",
        "repo_path": "vae/LTX23_audio_vae_bf16.safetensors",
        "target_subdir": "vae",
        "filename": "LTX23_audio_vae_bf16.safetensors",
        "size": 365_000_000,
    },
    {
        "id": "spatial_upscaler",
        "label": "Spatial upscaler x2",
        "repo": "Lightricks/LTX-2.3",
        "repo_path": "ltx-2.3-spatial-upscaler-x2-1.1.safetensors",
        "target_subdir": "latent_upscale_models",
        "filename": "ltx-2.3-spatial-upscaler-x2-1.1.safetensors",
        "size": 996_000_000,
    },
]


_JOBS: Dict[str, Dict] = {}
_JOBS_LOCK = threading.Lock()


def _default_models_dir() -> str:
    return str(Path(folder_paths.models_dir).resolve())


def _logical_drives() -> List[str]:
    if os.name != "nt":
        return ["/"]
    drives = []
    for letter in range(ord("A"), ord("Z") + 1):
        drive = f"{chr(letter)}:\\"
        if Path(drive).exists():
            drives.append(drive)
    return drives


def _browse_path(path: str) -> Dict:
    fallback = Path(_default_models_dir())
    current = Path(path or fallback).expanduser()
    if not current.exists() or not current.is_dir():
        current = fallback
    current = current.resolve()

    folders = []
    try:
        with os.scandir(current) as entries:
            for entry in entries:
                try:
                    if entry.is_dir(follow_symlinks=False):
                        folders.append({"name": entry.name, "path": entry.path})
                except OSError:
                    continue
    except OSError as exc:
        raise RuntimeError(f"Cannot open folder: {current}") from exc

    folders.sort(key=lambda item: item["name"].casefold())
    parent = current.parent
    return {
        "path": str(current),
        "parent": str(parent) if parent != current else "",
        "drives": _logical_drives(),
        "folders": folders,
        "default_models_dir": _default_models_dir(),
    }


def _select_folder_dialog(initial_dir: str) -> str:
    initial = initial_dir if os.path.isdir(initial_dir) else _default_models_dir()
    script = r"""
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = 'DENO Folder Picker'
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object System.Drawing.Size(1, 1)
$form.Opacity = 0
$form.Show()
$form.Activate()

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select your ComfyUI models folder'
$dialog.SelectedPath = $env:DENO_INITIAL_DIR
$dialog.ShowNewFolderButton = $true
try { $dialog.AutoUpgradeEnabled = $true } catch {}

$result = $dialog.ShowDialog($form)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $dialog.SelectedPath
}

$form.Close()
$form.Dispose()
"""
    env = os.environ.copy()
    env["DENO_INITIAL_DIR"] = initial
    # Keep the helper process invisible; only the folder picker itself should be shown.
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0

    try:
        completed = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-STA",
                "-ExecutionPolicy",
                "Bypass",
                "-WindowStyle",
                "Hidden",
                "-Command",
                script,
            ],
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=900,
            check=False,
            creationflags=creationflags,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("PowerShell is required for the Windows folder picker.") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Folder picker timed out.") from exc

    if completed.returncode != 0:
        message = (completed.stderr or completed.stdout or "Folder picker failed.").strip()
        raise RuntimeError(message)

    return completed.stdout.strip().splitlines()[-1] if completed.stdout.strip() else ""


def _download_url(item: Dict) -> str:
    repo_path = urllib.parse.quote(item["repo_path"].replace("\\", "/"))
    return f"https://huggingface.co/{item['repo']}/resolve/main/{repo_path}?download=true"


def _target_path(models_dir: str, item: Dict) -> Path:
    return Path(models_dir).expanduser().resolve() / item["target_subdir"] / item["filename"]


def _public_model_item(models_dir: str, item: Dict) -> Dict:
    target = _target_path(models_dir, item)
    part = target.with_suffix(target.suffix + ".part")
    exists = _is_complete(target, item["size"])
    downloaded = 0
    if exists:
        downloaded = target.stat().st_size
    elif part.exists():
        downloaded = part.stat().st_size
    elif target.exists():
        downloaded = target.stat().st_size
    return {
        "id": item["id"],
        "label": item["label"],
        "filename": item["filename"],
        "target_subdir": item["target_subdir"],
        "target_path": str(target),
        "size": item["size"],
        "exists": exists,
        "downloaded": downloaded,
        "url": _download_url(item),
    }


def _missing_size(models_dir: str) -> int:
    total = 0
    for item in MODEL_FILES:
        target = _target_path(models_dir, item)
        if not _is_complete(target, item["size"]):
            total += int(item["size"])
    return total


def _is_complete(path: Path, expected_size: int) -> bool:
    if not path.exists():
        return False
    if expected_size <= 0:
        return path.stat().st_size > 0
    return path.stat().st_size >= int(expected_size * 0.97)


def _snapshot_job(job_id: str) -> Optional[Dict]:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return None
        return {
            **job,
            "files": [dict(item) for item in job.get("files", [])],
        }


def _update_job(job_id: str, **updates) -> None:
    with _JOBS_LOCK:
        if job_id in _JOBS:
            _JOBS[job_id].update(updates)
            _JOBS[job_id]["updated_at"] = time.time()


def _update_file(job_id: str, file_id: str, **updates) -> None:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return
        for file_state in job.get("files", []):
            if file_state.get("id") == file_id:
                file_state.update(updates)
                break
        job["updated_at"] = time.time()


def _download_file(job_id: str, models_dir: str, item: Dict, starting_downloaded: int) -> int:
    target = _target_path(models_dir, item)
    target.parent.mkdir(parents=True, exist_ok=True)
    part = target.with_suffix(target.suffix + ".part")

    if _is_complete(target, item["size"]):
        _update_file(job_id, item["id"], status="exists", downloaded=target.stat().st_size)
        return 0

    resume_from = part.stat().st_size if part.exists() else 0
    headers = {"User-Agent": "Deno-ComfyUI-LTX8GB-Downloader/1.0"}
    if resume_from > 0:
        headers["Range"] = f"bytes={resume_from}-"

    request = urllib.request.Request(_download_url(item), headers=headers)
    _update_file(job_id, item["id"], status="downloading", downloaded=resume_from)
    _update_job(job_id, current_file=item["filename"], message=f"Downloading {item['filename']}")

    try:
        response = urllib.request.urlopen(request, timeout=45)
    except urllib.error.HTTPError as exc:
        if resume_from > 0 and exc.code == 416:
            os.replace(part, target)
            _update_file(job_id, item["id"], status="done", downloaded=target.stat().st_size)
            return 0
        raise

    with response:
        append = resume_from > 0 and response.status == 206
        if not append and part.exists():
            part.unlink()
            resume_from = 0
        mode = "ab" if append else "wb"
        downloaded_this_run = 0
        with part.open(mode + "") as file_handle:
            while True:
                chunk = response.read(CHUNK_SIZE)
                if not chunk:
                    break
                file_handle.write(chunk)
                downloaded_this_run += len(chunk)
                total_downloaded = starting_downloaded + downloaded_this_run
                _update_file(job_id, item["id"], downloaded=resume_from + downloaded_this_run)
                _update_job(job_id, downloaded_bytes=total_downloaded)

    os.replace(part, target)
    _update_file(job_id, item["id"], status="done", downloaded=target.stat().st_size)
    return downloaded_this_run


def _download_worker(job_id: str, models_dir: str) -> None:
    downloaded_bytes = 0
    try:
        for item in MODEL_FILES:
            target = _target_path(models_dir, item)
            if _is_complete(target, item["size"]):
                downloaded_bytes += int(item["size"])
                _update_file(job_id, item["id"], status="exists", downloaded=target.stat().st_size)
                _update_job(job_id, downloaded_bytes=downloaded_bytes)
                continue

            previous_downloaded = downloaded_bytes
            downloaded_this_run = _download_file(job_id, models_dir, item, previous_downloaded)
            downloaded_bytes = previous_downloaded + max(downloaded_this_run, int(item["size"]))
            _update_job(job_id, downloaded_bytes=downloaded_bytes)

        _update_job(
            job_id,
            status="done",
            current_file="",
            message="Done. Press R or refresh ComfyUI to reload model lists.",
            downloaded_bytes=_snapshot_job(job_id)["total_bytes"],
        )
    except Exception as exc:
        _update_job(job_id, status="error", error=str(exc), message=f"Download failed: {exc}")


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/info")
async def deno_ltx8gb_info(request):
    models_dir = str(request.query.get("models_dir") or _default_models_dir())
    return web.json_response(
        {
            "models_dir": models_dir,
            "files": [_public_model_item(models_dir, item) for item in MODEL_FILES],
        }
    )


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/browse")
async def deno_ltx8gb_browse(request):
    path = str(request.query.get("path") or _default_models_dir())
    try:
        payload = _browse_path(path)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)
    return web.json_response(payload)


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/select_folder")
async def deno_ltx8gb_select_folder(request):
    data = await request.json()
    initial_dir = str(data.get("initial_dir") or _default_models_dir())
    try:
        selected = await asyncio.to_thread(_select_folder_dialog, initial_dir)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    return web.json_response({"ok": True, "models_dir": selected})


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/start")
async def deno_ltx8gb_start(request):
    data = await request.json()
    models_dir = str(data.get("models_dir") or "").strip()
    if not models_dir:
        return web.json_response({"error": "Select a models folder first."}, status=400)

    models_path = Path(models_dir).expanduser().resolve()
    if not models_path.exists() or not models_path.is_dir():
        return web.json_response({"error": f"Folder does not exist: {models_path}"}, status=400)

    missing_size = _missing_size(str(models_path))
    free_bytes = shutil.disk_usage(models_path).free
    if missing_size > 0 and free_bytes < int(missing_size * 1.05):
        return web.json_response(
            {
                "error": (
                    "Not enough free disk space. "
                    f"Need about {missing_size / (1024 ** 3):.1f} GiB, "
                    f"free {free_bytes / (1024 ** 3):.1f} GiB."
                )
            },
            status=409,
        )

    job_id = uuid.uuid4().hex
    files = [_public_model_item(str(models_path), item) for item in MODEL_FILES]
    total_bytes = sum(int(item["size"]) for item in MODEL_FILES)
    existing_bytes = sum(int(file_state["size"]) for file_state in files if file_state["exists"])
    with _JOBS_LOCK:
        _JOBS[job_id] = {
            "id": job_id,
            "status": "running",
            "models_dir": str(models_path),
            "files": files,
            "total_bytes": total_bytes,
            "downloaded_bytes": existing_bytes,
            "current_file": "",
            "message": "Starting download...",
            "error": "",
            "created_at": time.time(),
            "updated_at": time.time(),
        }

    thread = threading.Thread(target=_download_worker, args=(job_id, str(models_path)), daemon=True)
    thread.start()
    return web.json_response(_snapshot_job(job_id))


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/status/{{job_id}}")
async def deno_ltx8gb_status(request):
    job_id = request.match_info.get("job_id", "")
    snapshot = _snapshot_job(job_id)
    if not snapshot:
        return web.json_response({"error": "Job not found."}, status=404)
    return web.json_response(snapshot)


class DenoLTX8GBModelDownloader:
    DESCRIPTION = (
        "Beginner-friendly downloader for the LTX 2.3 8GB VRAM GGUF model set.\n"
        "Choose your ComfyUI models folder, download the recommended files, then refresh ComfyUI.\n"
        "YouTube: https://www.youtube.com/@Denoise-AI"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "models_folder": (
                    "STRING",
                    {
                        "default": _default_models_dir(),
                        "multiline": False,
                    },
                ),
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "noop"
    CATEGORY = "Deno/LTX"
    OUTPUT_NODE = True

    def noop(self, models_folder: str):
        return ()
