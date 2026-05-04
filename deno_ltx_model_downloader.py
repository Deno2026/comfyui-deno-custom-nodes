from __future__ import annotations

import hashlib
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import folder_paths
from aiohttp import web
from server import PromptServer


ROUTE_PREFIX = "/deno/ltx_model_downloader"
CHUNK_SIZE = 1024 * 1024


MODEL_FILES = [
    {
        "id": "gguf",
        "label": "GGUF model",
        "repo": "QuantStack/LTX-2.3-GGUF",
        "repo_path": "LTX-2.3-distilled-1.1/LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf",
        "target_subdir": "unet",
        "filename": "LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf",
        "size": 17_763_015_328,
    },
    {
        "id": "gemma",
        "label": "Gemma text encoder",
        "repo": "Comfy-Org/ltx-2",
        "repo_path": "split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors",
        "target_subdir": "text_encoders",
        "filename": "gemma_3_12B_it_fp4_mixed.safetensors",
        "size": 9_447_702_218,
    },
    {
        "id": "projection",
        "label": "Text projection",
        "repo": "Kijai/LTX2.3_comfy",
        "repo_path": "text_encoders/ltx-2.3_text_projection_bf16.safetensors",
        "target_subdir": "text_encoders",
        "filename": "ltx-2.3_text_projection_bf16.safetensors",
        "size": 2_312_149_072,
    },
    {
        "id": "video_vae",
        "label": "Video VAE",
        "repo": "Kijai/LTX2.3_comfy",
        "repo_path": "vae/LTX23_video_vae_bf16.safetensors",
        "target_subdir": "vae",
        "filename": "LTX23_video_vae_bf16.safetensors",
        "size": 1_452_258_578,
    },
    {
        "id": "audio_vae",
        "label": "Audio VAE",
        "repo": "Kijai/LTX2.3_comfy",
        "repo_path": "vae/LTX23_audio_vae_bf16.safetensors",
        "target_subdir": "vae",
        "filename": "LTX23_audio_vae_bf16.safetensors",
        "size": 364_855_188,
    },
    {
        "id": "spatial_upscaler",
        "label": "Spatial upscaler x2",
        "repo": "Lightricks/LTX-2.3",
        "repo_path": "ltx-2.3-spatial-upscaler-x2-1.1.safetensors",
        "target_subdir": "latent_upscale_models",
        "filename": "ltx-2.3-spatial-upscaler-x2-1.1.safetensors",
        "size": 995_743_560,
    },
]


MODEL_ROOT_SUBDIRS = {
    "unet",
    "diffusion_models",
    "text_encoders",
    "clip",
    "vae",
    "latent_upscale_models",
}


_JOBS: Dict[str, Dict] = {}
_JOBS_LOCK = threading.Lock()


def _norm(path: Path | str) -> str:
    return str(Path(path).expanduser().resolve())


def _root_id(root: str) -> str:
    return hashlib.sha1(root.encode("utf-8", errors="ignore")).hexdigest()[:12]


def _paths_from_folder_paths_entry(value) -> Iterable[str]:
    if isinstance(value, tuple) and value:
        paths = value[0]
    else:
        paths = value
    if isinstance(paths, (str, os.PathLike)):
        yield str(paths)
        return
    if isinstance(paths, Iterable):
        for item in paths:
            if isinstance(item, (str, os.PathLike)):
                yield str(item)


def _collect_model_roots() -> List[Dict]:
    roots: Dict[str, Dict] = {}

    def add(path: Path | str, source: str) -> None:
        try:
            root = _norm(path)
        except (OSError, RuntimeError):
            return
        if not Path(root).exists():
            return
        root_path = Path(root)
        required_sibling_count = sum(1 for name in ("unet", "text_encoders", "vae") if (root_path / name).is_dir())
        if source != "default" and root_path.name.lower() != "models" and required_sibling_count < 2:
            return
        rid = _root_id(root)
        if rid not in roots:
            roots[rid] = {
                "id": rid,
                "path": root,
                "label": root,
                "source": source,
                "existing_count": 0,
            }

    add(folder_paths.models_dir, "default")

    for value in getattr(folder_paths, "folder_names_and_paths", {}).values():
        for raw_path in _paths_from_folder_paths_entry(value):
            path = Path(raw_path)
            try:
                resolved = path.expanduser().resolve()
            except (OSError, RuntimeError):
                continue

            if resolved.name.lower() in MODEL_ROOT_SUBDIRS:
                add(resolved.parent, f"ComfyUI model path: {resolved.name}")
            elif resolved.name.lower() == "models":
                add(resolved, "ComfyUI models root")

    for root in roots.values():
        root["existing_count"] = sum(
            1 for item in MODEL_FILES if _is_complete(_target_path(root["path"], item), item["size"])
        )

    ordered = sorted(
        roots.values(),
        key=lambda item: (-int(item["existing_count"]), 0 if item["source"] != "default" else 1, item["path"].casefold()),
    )
    return ordered


def _root_widget_choices() -> List[str]:
    roots = _collect_model_roots()
    if not roots:
        return [str(Path(folder_paths.models_dir).resolve())]
    return [root["path"] for root in roots]


def _select_root(root_id: Optional[str]) -> Tuple[Dict, List[Dict]]:
    roots = _collect_model_roots()
    if not roots:
        raise RuntimeError("No ComfyUI model roots were found.")
    if root_id:
        for root in roots:
            if root["id"] == root_id:
                return root, roots
        raise ValueError("Selected model root is not registered in ComfyUI.")
    return roots[0], roots


def _download_url(item: Dict) -> str:
    repo_path = urllib.parse.quote(item["repo_path"].replace("\\", "/"))
    return f"https://huggingface.co/{item['repo']}/resolve/main/{repo_path}?download=true"


def _target_path(models_root: str, item: Dict) -> Path:
    return Path(models_root) / item["target_subdir"] / item["filename"]


def _is_complete(path: Path, expected_size: int) -> bool:
    try:
        size = path.stat().st_size
    except OSError:
        return False
    if expected_size <= 0:
        return size > 0
    return size >= int(expected_size * 0.98)


def _public_file(models_root: str, item: Dict, override: Optional[Dict] = None) -> Dict:
    target = _target_path(models_root, item)
    part = target.with_suffix(target.suffix + ".part")
    expected_size = int(item["size"])
    exists = _is_complete(target, expected_size)
    downloaded = 0
    status = "pending"

    if exists:
        downloaded = target.stat().st_size
        status = "exists"
    elif part.exists():
        downloaded = part.stat().st_size
        status = "partial"

    if override:
        downloaded = int(override.get("downloaded", downloaded))
        status = str(override.get("status", status))

    return {
        "id": item["id"],
        "label": item["label"],
        "relative_path": f"{item['target_subdir']}/{item['filename']}",
        "target_path": str(target),
        "size": expected_size,
        "downloaded": downloaded,
        "status": status,
    }


def _public_files(models_root: str, job: Optional[Dict] = None) -> List[Dict]:
    file_states = job.get("file_states", {}) if job else {}
    return [_public_file(models_root, item, file_states.get(item["id"])) for item in MODEL_FILES]


def _job_payload(job_id: str) -> Dict:
    with _JOBS_LOCK:
        job = dict(_JOBS[job_id])
    return {
        "job_id": job_id,
        "root_id": job["root_id"],
        "models_root": job["models_root"],
        "status": job["status"],
        "message": job["message"],
        "error": job.get("error", ""),
        "total_size": job["total_size"],
        "downloaded": job["downloaded"],
        "percent": round((job["downloaded"] / job["total_size"]) * 100, 2) if job["total_size"] else 0,
        "files": _public_files(job["models_root"], job),
    }


def _set_job(job_id: str, **updates) -> None:
    with _JOBS_LOCK:
        if job_id in _JOBS:
            _JOBS[job_id].update(updates)


def _set_file_state(job_id: str, file_id: str, **updates) -> None:
    with _JOBS_LOCK:
        if job_id not in _JOBS:
            return
        file_states = _JOBS[job_id].setdefault("file_states", {})
        state = file_states.setdefault(file_id, {})
        state.update(updates)
        downloaded = 0
        models_root = _JOBS[job_id]["models_root"]
        for item in MODEL_FILES:
            current = _public_file(models_root, item, file_states.get(item["id"]))
            downloaded += min(int(current["downloaded"]), int(current["size"]))
        _JOBS[job_id]["downloaded"] = downloaded


def _download_file(job_id: str, models_root: str, item: Dict) -> None:
    target = _target_path(models_root, item)
    expected_size = int(item["size"])
    if _is_complete(target, expected_size):
        _set_file_state(job_id, item["id"], status="exists", downloaded=target.stat().st_size)
        return

    target.parent.mkdir(parents=True, exist_ok=True)
    part = target.with_suffix(target.suffix + ".part")
    resume_from = part.stat().st_size if part.exists() else 0
    url = _download_url(item)
    headers = {"User-Agent": "Deno-ComfyUI-LTX-Model-Downloader/1.0"}
    mode = "ab"
    if resume_from > 0:
        headers["Range"] = f"bytes={resume_from}-"

    request = urllib.request.Request(url, headers=headers)
    try:
        response = urllib.request.urlopen(request, timeout=60)
    except urllib.error.HTTPError as exc:
        if exc.code == 416 and _is_complete(part, expected_size):
            os.replace(part, target)
            _set_file_state(job_id, item["id"], status="done", downloaded=target.stat().st_size)
            return
        raise

    with response:
        if resume_from > 0 and response.status != 206:
            resume_from = 0
            mode = "wb"
        _set_file_state(job_id, item["id"], status="downloading", downloaded=resume_from)
        downloaded = resume_from
        with part.open(mode + "") as handle:
            while True:
                chunk = response.read(CHUNK_SIZE)
                if not chunk:
                    break
                handle.write(chunk)
                downloaded += len(chunk)
                _set_file_state(job_id, item["id"], status="downloading", downloaded=downloaded)

    if not _is_complete(part, expected_size):
        raise RuntimeError(f"Incomplete download: {item['filename']}")
    os.replace(part, target)
    _set_file_state(job_id, item["id"], status="done", downloaded=target.stat().st_size)


def _download_job(job_id: str) -> None:
    with _JOBS_LOCK:
        job = dict(_JOBS[job_id])
    models_root = job["models_root"]
    try:
        _set_job(job_id, status="running", message="Downloading model set...")
        for item in MODEL_FILES:
            _set_job(job_id, message=f"Checking {item['filename']}")
            _download_file(job_id, models_root, item)
        _set_job(job_id, status="done", message="Done. Press R or refresh ComfyUI model lists if needed.")
    except Exception as exc:  # noqa: BLE001 - route should report user-facing errors.
        _set_job(job_id, status="error", message="Download failed.", error=str(exc))


def _create_job(root: Dict) -> str:
    job_id = uuid.uuid4().hex
    existing_downloaded = sum(
        min(file["downloaded"], file["size"]) for file in _public_files(root["path"])
    )
    with _JOBS_LOCK:
        _JOBS[job_id] = {
            "root_id": root["id"],
            "models_root": root["path"],
            "status": "queued",
            "message": "Queued",
            "error": "",
            "created_at": time.time(),
            "total_size": sum(int(item["size"]) for item in MODEL_FILES),
            "downloaded": existing_downloaded,
            "file_states": {},
        }
    thread = threading.Thread(target=_download_job, args=(job_id,), daemon=True)
    thread.start()
    return job_id


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/info")
async def ltx_model_downloader_info(request):
    try:
        selected, roots = _select_root(request.query.get("root_id"))
        payload = {
            "roots": roots,
            "selected_root_id": selected["id"],
            "models_root": selected["path"],
            "files": _public_files(selected["path"]),
            "total_size": sum(int(item["size"]) for item in MODEL_FILES),
        }
        return web.json_response(payload)
    except Exception as exc:  # noqa: BLE001
        return web.json_response({"error": str(exc)}, status=400)


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/start")
async def ltx_model_downloader_start(request):
    try:
        data = await request.json()
        selected, _ = _select_root(data.get("root_id"))
        job_id = _create_job(selected)
        return web.json_response(_job_payload(job_id))
    except Exception as exc:  # noqa: BLE001
        return web.json_response({"error": str(exc)}, status=400)


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/status/{{job_id}}")
async def ltx_model_downloader_status(request):
    job_id = request.match_info["job_id"]
    with _JOBS_LOCK:
        exists = job_id in _JOBS
    if not exists:
        return web.json_response({"error": "Unknown download job."}, status=404)
    return web.json_response(_job_payload(job_id))


class DenoLTXModelDownloader:
    RETURN_TYPES = ()
    FUNCTION = "run"
    CATEGORY = "Deno/Downloaders"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        choices = _root_widget_choices()
        return {
            "required": {
                "model_root": (
                    choices,
                    {"default": choices[0]},
                ),
            }
        }

    def run(self, model_root: str):
        return ()

