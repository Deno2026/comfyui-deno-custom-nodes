from __future__ import annotations

import hashlib
import os
from collections.abc import Iterable
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import folder_paths
from aiohttp import web
from server import PromptServer


ROUTE_PREFIX = "/deno/ltx_model_downloader"


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

    return sorted(
        roots.values(),
        key=lambda item: (-int(item["existing_count"]), 0 if item["source"] != "default" else 1, item["path"].casefold()),
    )


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


def _hf_file_url(item: Dict) -> str:
    # Static Hugging Face file URL only. The node never downloads it from Python.
    return f"https://huggingface.co/{item['repo']}/resolve/main/{item['repo_path']}?download=true"


def _hf_repo_url(item: Dict) -> str:
    return f"https://huggingface.co/{item['repo']}/blob/main/{item['repo_path']}"


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


def _public_file(models_root: str, item: Dict) -> Dict:
    target = _target_path(models_root, item)
    part = target.with_suffix(target.suffix + ".part")
    expected_size = int(item["size"])
    exists = _is_complete(target, expected_size)
    partial = part.exists()
    downloaded = 0
    status = "missing"

    if exists:
        downloaded = target.stat().st_size
        status = "exists"
    elif partial:
        downloaded = part.stat().st_size
        status = "partial"

    return {
        "id": item["id"],
        "label": item["label"],
        "repo": item["repo"],
        "repo_path": item["repo_path"],
        "url": _hf_file_url(item),
        "repo_url": _hf_repo_url(item),
        "relative_path": f"{item['target_subdir']}/{item['filename']}",
        "target_path": str(target),
        "target_dir": str(target.parent),
        "size": expected_size,
        "downloaded": downloaded,
        "status": status,
    }


def _public_files(models_root: str) -> List[Dict]:
    return [_public_file(models_root, item) for item in MODEL_FILES]


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/info")
async def ltx_model_downloader_info(request):
    try:
        selected, roots = _select_root(request.query.get("root_id"))
        files = _public_files(selected["path"])
        payload = {
            "mode": "manual_setup_helper",
            "preset_id": "ltx_23_8gb_vram",
            "preset_label": "LTX 2.3 8GB VRAM",
            "instructions": (
                "Open each official Hugging Face file link, download it with your browser, "
                "then move the file into the shown target path. This node only checks local files."
            ),
            "roots": roots,
            "selected_root_id": selected["id"],
            "models_root": selected["path"],
            "files": files,
            "total_size": sum(int(item["size"]) for item in MODEL_FILES),
            "existing_count": sum(1 for file in files if file["status"] == "exists"),
        }
        return web.json_response(payload)
    except Exception as exc:  # noqa: BLE001
        return web.json_response({"error": str(exc)}, status=400)


class DenoLTXModelDownloader:
    DESCRIPTION = (
        "Preset-based easy model download helper.\n"
        "The first preset is the LTX 2.3 8GB VRAM GGUF starter set. "
        "Shows official Hugging Face links, target ComfyUI model paths, "
        "and local install status without running automatic downloads."
    )
    RETURN_TYPES = ()
    FUNCTION = "run"
    CATEGORY = "Deno/Setup"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        choices = _root_widget_choices()
        return {
            "required": {
                "model_root": (
                    "STRING",
                    {"default": choices[0]},
                ),
            }
        }

    def run(self, model_root: str):
        return ()
