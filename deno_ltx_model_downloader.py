from __future__ import annotations

import hashlib
import json
import os
from collections.abc import Iterable
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import unquote, urlsplit

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
    "loras",
    "controlnet",
    "upscale_models",
    "latent_upscale_models",
    "clip_vision",
    "embeddings",
    "audio_encoders",
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
            1 for item in MODEL_FILES if _public_file(root["path"], item)["status"] == "exists"
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


def _select_root(root_id: Optional[str], root_path: Optional[str] = None) -> Tuple[Dict, List[Dict]]:
    roots = _collect_model_roots()
    if not roots:
        raise RuntimeError("No ComfyUI model roots were found.")
    if root_id:
        for root in roots:
            if root["id"] == root_id:
                return root, roots
    if root_path:
        try:
            normalized_path = _norm(root_path)
        except (OSError, RuntimeError):
            normalized_path = ""
        if normalized_path:
            for root in roots:
                if root["path"] == normalized_path:
                    return root, roots
    if root_id:
        raise ValueError("Selected model root is not registered in ComfyUI.")
    return roots[0], roots


def _hf_file_url(item: Dict) -> str:
    # Static Hugging Face file URL only. The node never downloads it from Python.
    return f"https://huggingface.co/{item['repo']}/resolve/main/{item['repo_path']}?download=true"


def _hf_repo_url(item: Dict) -> str:
    return f"https://huggingface.co/{item['repo']}/blob/main/{item['repo_path']}"


def _model_file_to_package_file(item: Dict) -> Dict:
    return {
        "id": str(item["id"]),
        "label": str(item["label"]),
        "url": _hf_file_url(item),
        "target_subdir": str(item["target_subdir"]),
        "filename": str(item["filename"]),
        "size": int(item["size"]),
    }


def _default_package() -> Dict:
    return {
        "id": "ltx_23_8gb_vram",
        "title": "LTX 2.3 8GB VRAM",
        "description": "Open the official Hugging Face links, download with your browser, then move files into the shown target paths. No Python auto-download is used.",
        "files": [_model_file_to_package_file(item) for item in MODEL_FILES],
    }


def _default_presets_state() -> Dict:
    return {
        "active_preset_id": "ltx_23_8gb_vram",
        "presets": [_default_package()],
    }


DEFAULT_PRESETS_JSON = json.dumps(_default_presets_state(), indent=2)


def _target_path(models_root: str, item: Dict) -> Path:
    return Path(models_root) / item["target_subdir"] / item["filename"]


def _is_relative_to_or_same(path: Path, root: Path) -> bool:
    try:
        path_norm = os.path.normcase(str(path.expanduser().resolve()))
        root_norm = os.path.normcase(str(root.expanduser().resolve()))
        return os.path.commonpath([path_norm, root_norm]) == root_norm
    except (OSError, RuntimeError, ValueError):
        return False


def _relative_to_root_label(path: Path, root: Path, fallback: str) -> str:
    try:
        return path.expanduser().resolve().relative_to(root.expanduser().resolve()).as_posix()
    except (OSError, RuntimeError, ValueError):
        return fallback


def _registered_model_dirs(folder_name: str) -> List[Path]:
    candidates: List[Path] = []
    seen = set()

    def add(path: Path | str) -> None:
        try:
            resolved = Path(path).expanduser().resolve()
        except (OSError, RuntimeError):
            return
        key = os.path.normcase(str(resolved))
        if key not in seen:
            seen.add(key)
            candidates.append(resolved)

    folder_map = getattr(folder_paths, "folder_names_and_paths", {})
    for raw_path in _paths_from_folder_paths_entry(folder_map.get(folder_name)):
        add(raw_path)

    get_folder_paths = getattr(folder_paths, "get_folder_paths", None)
    if callable(get_folder_paths):
        try:
            for raw_path in get_folder_paths(folder_name):
                add(raw_path)
        except Exception:  # noqa: BLE001 - third-party folder_paths can raise custom errors
            pass

    return candidates


def _target_path_candidates(models_root: str, target_subdir: str, filename: str) -> List[Path]:
    relative_path, _relative_label = _safe_relative_path(target_subdir, filename)
    root = Path(models_root)
    candidates: List[Path] = []
    seen = set()

    def add(path: Path) -> None:
        key = os.path.normcase(str(path))
        if key not in seen:
            seen.add(key)
            candidates.append(path)

    add(root / relative_path)

    relative_parts = list(relative_path.parts)
    if len(relative_parts) < 2:
        return candidates

    folder_type = relative_parts[0]
    nested_parts = relative_parts[1:-1]
    for model_dir in _registered_model_dirs(folder_type):
        if _is_relative_to_or_same(model_dir, root):
            add(model_dir.joinpath(*nested_parts, filename))

    return candidates


def _scan_for_filename(base_dirs: Iterable[Path], filename: str, expected_size: int) -> Optional[Path]:
    if not filename:
        return None
    seen = set()
    for base_dir in base_dirs:
        try:
            resolved_base = base_dir.expanduser().resolve()
        except (OSError, RuntimeError):
            continue
        if not resolved_base.is_dir():
            continue
        base_key = os.path.normcase(str(resolved_base))
        if base_key in seen:
            continue
        seen.add(base_key)
        try:
            matches = sorted(resolved_base.rglob(filename), key=lambda item: item.as_posix().casefold())
        except OSError:
            continue
        for match in matches:
            if match.is_file() and _is_complete(match, expected_size):
                return match
    return None


def _resolve_target_file(models_root: str, target_subdir: str, filename: str, expected_size: int) -> Dict:
    relative_path, configured_label = _safe_relative_path(target_subdir, filename)
    root = Path(models_root)
    candidates = _target_path_candidates(models_root, target_subdir, filename)
    target = candidates[0] if candidates else root / relative_path
    downloaded = 0
    status = "missing"
    found_by = "configured"

    for candidate in candidates:
        if _is_complete(candidate, expected_size):
            target = candidate
            downloaded = candidate.stat().st_size
            status = "exists"
            found_by = "registered" if candidate != candidates[0] else "configured"
            break

    if status == "missing":
        scanned = _scan_for_filename((candidate.parent for candidate in candidates), filename, expected_size)
        if scanned is not None:
            target = scanned
            downloaded = scanned.stat().st_size
            status = "exists"
            found_by = "subfolder"

    if status == "missing":
        for candidate in candidates:
            part = candidate.with_suffix(candidate.suffix + ".part")
            try:
                if part.exists():
                    target = candidate
                    downloaded = part.stat().st_size
                    status = "partial"
                    break
            except OSError:
                continue

    return {
        "target": target,
        "target_path": str(target),
        "target_dir": str(target.parent),
        "relative_path": _relative_to_root_label(target, root, configured_label),
        "configured_relative_path": configured_label,
        "downloaded": downloaded,
        "status": status,
        "found_by": found_by,
    }


def _is_complete(path: Path, expected_size: int) -> bool:
    try:
        size = path.stat().st_size
    except OSError:
        return False
    if expected_size <= 0:
        return size > 0
    return size >= int(expected_size * 0.98)


def _public_file(models_root: str, item: Dict) -> Dict:
    expected_size = int(item["size"])
    resolved = _resolve_target_file(models_root, str(item["target_subdir"]), str(item["filename"]), expected_size)

    return {
        "id": item["id"],
        "label": item["label"],
        "repo": item["repo"],
        "repo_path": item["repo_path"],
        "url": _hf_file_url(item),
        "repo_url": _hf_repo_url(item),
        "relative_path": resolved["relative_path"],
        "configured_relative_path": resolved["configured_relative_path"],
        "target_path": resolved["target_path"],
        "target_dir": resolved["target_dir"],
        "size": expected_size,
        "downloaded": resolved["downloaded"],
        "status": resolved["status"],
        "found_by": resolved["found_by"],
    }


def _public_files(models_root: str) -> List[Dict]:
    return [_public_file(models_root, item) for item in MODEL_FILES]


def _guess_filename(url: str) -> str:
    path = unquote(urlsplit(str(url)).path)
    name = Path(path).name
    return name if name and "." in name else ""


def _expected_size(row: Dict) -> int:
    try:
        return max(0, int(float(row.get("size") or row.get("expected_size") or 0)))
    except (TypeError, ValueError):
        return 0


def _safe_relative_path(target_subdir: str, filename: str) -> Tuple[Path, str]:
    safe_subdir = str(target_subdir or "").replace("\\", "/").strip("/")
    safe_filename = str(filename or "").replace("\\", "/").strip("/")

    if not safe_filename:
        raise ValueError("Missing filename.")

    parts = [part for part in f"{safe_subdir}/{safe_filename}".split("/") if part]
    if not parts:
        raise ValueError("Missing target path.")
    if any(part in {".", ".."} or ":" in part for part in parts):
        raise ValueError("Target path must stay inside the selected models root.")

    relative = Path(*parts)
    return relative, "/".join(parts)


def _normalize_package(package) -> Dict:
    if not isinstance(package, dict):
        package = _default_package()

    files = package.get("files")
    if not isinstance(files, list):
        files = []

    normalized_files = []
    for index, row in enumerate(files):
        if not isinstance(row, dict):
            continue
        url = str(row.get("url") or "")
        filename = str(row.get("filename") or "").strip() or _guess_filename(url)
        normalized_files.append(
            {
                "id": str(row.get("id") or f"file_{index + 1}"),
                "label": str(row.get("label") or row.get("target_subdir") or filename or f"File #{index + 1}"),
                "url": url,
                "target_subdir": str(row.get("target_subdir") or "checkpoints"),
                "filename": filename,
                "size": _expected_size(row),
            }
        )

    return {
        "id": str(package.get("id") or "custom_preset"),
        "title": str(package.get("title") or "Custom Preset"),
        "description": str(package.get("description") or ""),
        "files": normalized_files,
    }


def _parse_presets_state(value) -> Dict:
    if isinstance(value, str) and value.strip():
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            value = _default_presets_state()
    elif not isinstance(value, dict):
        value = _default_presets_state()

    presets = value.get("presets")
    if not isinstance(presets, list):
        presets = []

    default_package = _default_package()
    normalized = [
        _normalize_package(item)
        for item in presets
        if isinstance(item, dict) and str(item.get("id") or "") != default_package["id"]
    ]
    normalized = [default_package, *normalized]

    active_id = str(value.get("active_preset_id") or normalized[0]["id"])
    if not any(item["id"] == active_id for item in normalized):
        active_id = normalized[0]["id"]

    return {
        "active_preset_id": active_id,
        "presets": normalized,
    }


def _active_package_from_state(state_value) -> Dict:
    state = _parse_presets_state(state_value)
    for package in state["presets"]:
        if package["id"] == state["active_preset_id"]:
            return package
    return state["presets"][0]


def _model_subdirs(models_root: str) -> List[str]:
    common = [
        "checkpoints",
        "unet",
        "diffusion_models",
        "text_encoders",
        "clip",
        "vae",
        "loras",
        "controlnet",
        "upscale_models",
        "latent_upscale_models",
        "clip_vision",
        "embeddings",
        "audio_encoders",
    ]
    found = []
    try:
        for child in Path(models_root).iterdir():
            if child.is_dir() and child.name not in found:
                found.append(child.name)
    except OSError:
        pass
    root = Path(models_root)
    for folder_name, value in getattr(folder_paths, "folder_names_and_paths", {}).items():
        if isinstance(folder_name, str):
            found.append(folder_name)
        for raw_path in _paths_from_folder_paths_entry(value):
            try:
                resolved = Path(raw_path).expanduser().resolve()
            except (OSError, RuntimeError):
                continue
            if _is_relative_to_or_same(resolved, root):
                found.append(_relative_to_root_label(resolved, root, resolved.name))
    return sorted(set(common + found), key=lambda item: (item.lower() not in common, item.casefold()))


def _public_custom_file(models_root: str, row: Dict, index: int) -> Dict:
    row = _normalize_package({"files": [row]})["files"][0]
    url = str(row.get("url") or "").strip()
    filename = str(row.get("filename") or "").strip() or _guess_filename(url)
    target_subdir = str(row.get("target_subdir") or "").strip()
    label = target_subdir or filename or f"File #{index + 1}"
    size = _expected_size(row)

    try:
        resolved = _resolve_target_file(models_root, target_subdir, filename, size)
        relative_label = resolved["relative_path"]
        error = ""
        target_path = resolved["target_path"]
        target_dir = resolved["target_dir"]
        status = resolved["status"]
        downloaded = resolved["downloaded"]
        found_by = resolved["found_by"]
    except ValueError as exc:
        relative_label = ""
        target_path = ""
        target_dir = ""
        status = "invalid"
        downloaded = 0
        found_by = ""
        error = str(exc)

    return {
        "id": str(row.get("id") or f"custom_{index + 1}"),
        "label": label,
        "url": url,
        "target_subdir": target_subdir,
        "filename": filename,
        "relative_path": relative_label,
        "target_path": target_path,
        "target_dir": target_dir,
        "size": size,
        "downloaded": downloaded,
        "status": status,
        "found_by": found_by,
        "error": error,
    }


def _public_package_files(models_root: str, package: Dict) -> List[Dict]:
    normalized = _normalize_package(package)
    return [_public_custom_file(models_root, row, index) for index, row in enumerate(normalized.get("files", []))]


def _build_payload(root_id: str | None, state_value=None, package_value=None, model_root: str | None = None) -> Dict:
    selected, roots = _select_root(root_id, model_root)
    state = _parse_presets_state(state_value)
    package = _normalize_package(package_value) if package_value is not None else _active_package_from_state(state)
    files = _public_package_files(selected["path"], package)
    roots = [
        {
            **root,
            "existing_count": sum(
                1
                for file in _public_package_files(root["path"], package)
                if file["status"] == "exists"
            ),
        }
        for root in roots
    ]
    return {
        "mode": "manual_setup_helper",
        "preset_id": package["id"],
        "preset_label": package["title"],
        "package": package,
        "presets_state": state,
        "instructions": package.get("description") or "Open links, download with your browser, then move files into the shown target paths.",
        "roots": roots,
        "selected_root_id": selected["id"],
        "models_root": selected["path"],
        "model_subdirs": _model_subdirs(selected["path"]),
        "files": files,
        "total_size": sum(int(item["size"]) for item in files),
        "existing_count": sum(1 for file in files if file["status"] == "exists"),
    }


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/info")
async def ltx_model_downloader_info(request):
    try:
        return web.json_response(
            _build_payload(
                request.query.get("root_id"),
                _default_presets_state(),
                model_root=request.query.get("model_root"),
            )
        )
    except Exception as exc:  # noqa: BLE001
        return web.json_response({"error": str(exc)}, status=400)


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/check")
async def ltx_model_downloader_check(request):
    try:
        data = await request.json()
        return web.json_response(
            _build_payload(
                data.get("root_id"),
                data.get("presets_state"),
                data.get("package"),
                data.get("model_root"),
            )
        )
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
                "presets_json": (
                    "STRING",
                    {
                        "default": DEFAULT_PRESETS_JSON,
                        "multiline": True,
                    },
                ),
            }
        }

    def run(self, model_root: str, presets_json: str = DEFAULT_PRESETS_JSON):
        return ()
