from __future__ import annotations

import hashlib
import json
import logging
import ntpath
import os
import stat
from collections.abc import Iterable
from glob import escape as escape_glob
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import unquote, urlsplit

import folder_paths
from aiohttp import web
from server import PromptServer


ROUTE_PREFIX = "/deno/ltx_model_downloader"
AUTO_MODEL_ROOT = "auto"
MODEL_FILE_EXTENSIONS = frozenset({
    ".safetensors", ".gguf", ".ckpt", ".pt", ".pth", ".bin", ".sft", ".pkl", ".onnx",
})
_LOGGER = logging.getLogger(__name__)


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


LTX25_MODEL_FILES = [
    {
        "id": "diffusion_model",
        "label": "LTX 2.5 distilled INT8 model",
        "repo": "Lightricks/LTX-2.5",
        "repo_path": "diffusion_models/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors",
        "target_subdir": "diffusion_models",
        "filename": "ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors",
        "size": 21_504_034_224,
    },
    {
        "id": "text_encoder",
        "label": "Gemma 4 text encoder with LTX 2.5 projection",
        "repo": "Lightricks/LTX-2.5",
        "repo_path": "text_encoders/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors",
        "target_subdir": "text_encoders",
        "filename": "gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors",
        "size": 15_372_971_786,
    },
    {
        "id": "video_vae",
        "label": "LTX 2.5 video VAE",
        "repo": "Lightricks/LTX-2.5",
        "repo_path": "vae/ltx-2.5-video-vae-bf16.safetensors",
        "target_subdir": "vae",
        "filename": "ltx-2.5-video-vae-bf16.safetensors",
        "size": 1_472_223_346,
    },
    {
        "id": "audio_vae",
        "label": "LTX 2.5 audio VAE",
        "repo": "Lightricks/LTX-2.5",
        "repo_path": "vae/ltx-2.5-audio-vae-bf16.safetensors",
        "target_subdir": "vae",
        "filename": "ltx-2.5-audio-vae-bf16.safetensors",
        "size": 364_866_540,
    },
    {
        "id": "spatial_upscaler",
        "label": "LTX 2.5 spatial upscaler x2",
        "repo": "Lightricks/LTX-2.5",
        "repo_path": "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
        "target_subdir": "latent_upscale_models",
        "filename": "ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
        "size": 995_778_752,
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


def _canonical_root_key(path: Path | str) -> str:
    expanded = Path(path).expanduser()
    real_path = os.path.realpath(str(expanded))
    return os.path.normcase(os.path.normpath(real_path))


def _root_id(root: str) -> str:
    canonical = _canonical_root_key(root)
    digest = hashlib.sha256(canonical.encode("utf-8", errors="ignore")).hexdigest()[:16]
    return f"root_{digest}"


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


def _looks_like_model_root(root_path: Path, source: str) -> bool:
    if source == "default":
        return True
    if root_path.name.lower() == "models":
        return True
    required_sibling_count = sum(
        1
        for name in ("unet", "text_encoders", "vae")
        if (root_path / name).is_dir()
    )
    return required_sibling_count >= 2


def _collect_model_roots() -> List[Dict]:
    roots: Dict[str, Dict] = {}

    def add(path: Path | str, source: str) -> None:
        try:
            root = _norm(path)
            canonical = _canonical_root_key(root)
        except (OSError, RuntimeError):
            return
        if not Path(root).exists():
            return
        root_path = Path(root)
        if not _looks_like_model_root(root_path, source):
            return
        rid = _root_id(canonical)
        if canonical not in roots:
            roots[canonical] = {
                "id": rid,
                "path": root,
                "source": source,
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

    return sorted(
        roots.values(),
        key=lambda item: (0 if item["source"] == "default" else 1, item["path"].casefold()),
    )


def _select_root(root_id: Optional[str], legacy_root: Optional[str]) -> Tuple[Dict, List[Dict], str, str]:
    roots = _collect_model_roots()
    if not roots:
        raise ValueError("No ComfyUI model roots were found.")
    if root_id and root_id != AUTO_MODEL_ROOT:
        for root in roots:
            if root["id"] == root_id:
                return root, roots, "explicit", "valid_explicit_root"
        return roots[0], roots, "auto", "invalid_explicit_root_fallback"
    if not root_id and isinstance(legacy_root, str) and ntpath.isabs(legacy_root):
        # Compare against already registered roots without resolving a client path.
        saved = os.path.normcase(os.path.normpath(legacy_root))
        for root in roots:
            if os.path.normcase(os.path.normpath(root["path"])) == saved:
                return root, roots, "explicit", "migrated_registered_root"
    return roots[0], roots, "auto", "auto_best_ready_files"


def _hf_file_url(item: Dict) -> str:
    # Static Hugging Face file URL only. The node never downloads it from Python.
    return f"https://huggingface.co/{item['repo']}/resolve/main/{item['repo_path']}?download=true"


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


def _ltx25_package() -> Dict:
    return {
        "id": "ltx_25_distilled_int8",
        "title": "LTX 2.5 Distilled INT8",
        "description": (
            "Official LTX 2.5 distilled INT8 model set, including the projected Gemma 4 text encoder, "
            "video/audio VAEs, and x2 spatial upscaler. Sign in to Hugging Face and complete "
            "Agree and Access before opening the download links. Files are provided under the "
            "LTX-2 Community License."
        ),
        "files": [_model_file_to_package_file(item) for item in LTX25_MODEL_FILES],
    }


def _builtin_packages() -> List[Dict]:
    return [_default_package(), _ltx25_package()]


def _default_presets_state() -> Dict:
    return {
        "active_preset_id": "ltx_23_8gb_vram",
        "presets": _builtin_packages(),
    }


DEFAULT_PRESETS_JSON = json.dumps(_default_presets_state(), indent=2)


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


def _target_path_candidates(models_root: str, relative_path: Path) -> List[Tuple[Path, Path]]:
    root = Path(models_root)
    candidates: List[Tuple[Path, Path]] = []
    seen = set()

    def add(base: Path, parts: Iterable[str]) -> None:
        path = base.joinpath(*parts)
        key = os.path.normcase(str(path)), os.path.normcase(str(base))
        if key not in seen:
            seen.add(key)
            candidates.append((path, base))

    add(root, relative_path.parts)

    relative_parts = relative_path.parts
    if len(relative_parts) < 2:
        return candidates

    folder_type = relative_parts[0]
    for model_dir in _registered_model_dirs(folder_type):
        add(model_dir, relative_parts[1:])

    return candidates


def _regular_file_size(path: Path, base: Path) -> Optional[int]:
    try:
        resolved = path.resolve()
        if not _is_relative_to_or_same(resolved, base):
            return None
        info = resolved.stat()
    except (OSError, RuntimeError, ValueError):
        return None
    return info.st_size if stat.S_ISREG(info.st_mode) else None


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
            matches = sorted(resolved_base.rglob(escape_glob(filename)), key=lambda item: item.as_posix().casefold())
        except OSError:
            continue
        for match in matches:
            size = _regular_file_size(match, resolved_base)
            if size is not None and _is_complete(size, expected_size):
                return match
    return None


def _resolve_target_file(
    models_root: str,
    target_subdir: str,
    filename: str,
    expected_size: int,
    *,
    allow_deep_scan: bool = False,
) -> Dict:
    relative_path, configured_label = _safe_relative_path(target_subdir, filename)
    root = Path(models_root)
    candidates = _target_path_candidates(models_root, relative_path)
    target = root / relative_path
    status = "missing"
    found_by = "configured"

    for index, (candidate, base) in enumerate(candidates):
        size = _regular_file_size(candidate, base)
        if size is not None and _is_complete(size, expected_size):
            target = candidate
            status = "exists"
            found_by = "registered" if index else "configured"
            break

    if status == "missing" and allow_deep_scan:
        scan_dirs = (path.parent for path, base in candidates if _is_relative_to_or_same(path.parent, base))
        scanned = _scan_for_filename(scan_dirs, relative_path.name, expected_size)
        if scanned is not None:
            target = scanned
            status = "exists"
            found_by = "subfolder"

    if status == "missing":
        for candidate, base in candidates:
            part = candidate.with_suffix(candidate.suffix + ".part")
            if _regular_file_size(part, base) is not None:
                target = candidate
                status = "partial"
                break

    return {
        "relative_path": (
            configured_label if status == "missing" else _relative_to_root_label(target, root, configured_label)
        ),
        "status": status,
        "found_by": found_by,
    }


def _is_complete(size: int, expected_size: int) -> bool:
    if expected_size <= 0:
        return size > 0
    return size >= int(expected_size * 0.98)


def _guess_filename(url: str) -> str:
    try:
        path = unquote(urlsplit(str(url)).path)
    except ValueError:
        return ""
    name = Path(path).name
    return name if name and "." in name else ""


DOWNLOAD_LINK_ERROR = "Download link must be a web address starting with http or https."


def _safe_web_link(url) -> str:
    """Return the link unchanged only when it is an http(s) web address with a host."""
    text = str(url or "").strip()
    if not text:
        return ""
    try:
        parts = urlsplit(text)
        if parts.scheme.lower() in {"http", "https"} and parts.hostname:
            return text
    except ValueError:
        pass
    return ""


def _expected_size(row: Dict) -> int:
    try:
        return max(0, int(float(row.get("size") or row.get("expected_size") or 0)))
    except (OverflowError, TypeError, ValueError):
        return 0


def _is_model_path_component(component: str) -> bool:
    if (
        not component
        or component.endswith((".", " "))
        or any(ord(char) < 32 or char in '<>:"/\\|?*' for char in component)
    ):
        return False
    basename = component.split(".", 1)[0].rstrip().upper()
    return basename not in {"CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"} and not (
        len(basename) == 4 and basename[:3] in {"COM", "LPT"} and basename[3] in "123456789¹²³"
    )


def _normalize_model_subdir(value: str) -> str:
    parts = value.replace("\\", "/").split("/")
    return "/".join(parts) if all(_is_model_path_component(part) for part in parts) else ""


def _safe_relative_path(target_subdir: str, filename: str) -> Tuple[Path, str]:
    if not filename:
        raise ValueError("Missing filename.")
    if not _is_model_path_component(filename):
        raise ValueError("Use a filename without a path.")
    if Path(filename).suffix.lower() not in MODEL_FILE_EXTENSIONS:
        raise ValueError("Use a supported model file extension.")
    subdir = _normalize_model_subdir(target_subdir)
    if not subdir:
        raise ValueError("Use a relative models subfolder.")
    parts = [*subdir.split("/"), filename]
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
        filename = str(row.get("filename", _guess_filename(url)) or "").strip()
        filename = filename if _is_model_path_component(filename) else ""
        target_subdir = _normalize_model_subdir(str(row.get("target_subdir", "checkpoints") or ""))
        label = str(row.get("label") or "").strip()
        if ntpath.isabs(label) or label.startswith(("/", "\\")):
            label = ""
        normalized_files.append(
            {
                "id": str(row.get("id") or f"file_{index + 1}"),
                "label": label or target_subdir or filename or f"File #{index + 1}",
                "url": url,
                "target_subdir": target_subdir,
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

    builtin_packages = _builtin_packages()
    builtin_ids = {package["id"] for package in builtin_packages}
    normalized = [
        _normalize_package(item)
        for item in presets
        if isinstance(item, dict) and str(item.get("id") or "") not in builtin_ids
    ]
    normalized = [*builtin_packages, *normalized]

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


def _canonicalize_builtin_package(package: Dict) -> Dict:
    """Replace stale saved copies of built-ins while preserving custom packages."""
    package_id = str(package.get("id") or "")
    for builtin in _builtin_packages():
        if builtin["id"] == package_id:
            return builtin
    return package


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
    root = Path(models_root)
    found = []
    try:
        for child in root.iterdir():
            if _is_model_path_component(child.name) and _is_relative_to_or_same(child, root) and child.is_dir():
                found.append(child.name)
    except OSError:
        pass
    for folder_name, value in getattr(folder_paths, "folder_names_and_paths", {}).items():
        if isinstance(folder_name, str) and _is_model_path_component(folder_name):
            found.append(folder_name)
        for raw_path in _paths_from_folder_paths_entry(value):
            try:
                resolved = Path(raw_path).expanduser().resolve()
            except (OSError, RuntimeError):
                continue
            if _is_relative_to_or_same(resolved, root):
                label = _normalize_model_subdir(_relative_to_root_label(resolved, root, ""))
                if label:
                    found.append(label)
    return sorted(set(common + found), key=lambda item: (item.lower() not in common, item.casefold()))


def _public_custom_file(models_root: str, row: Dict, index: int) -> Dict:
    row = _normalize_package({"files": [row]})["files"][0]
    raw_url = str(row.get("url") or "").strip()
    url = _safe_web_link(raw_url)
    filename = row["filename"]
    target_subdir = str(row.get("target_subdir") or "").strip()
    label = target_subdir or filename or f"File #{index + 1}"
    size = _expected_size(row)

    try:
        resolved = _resolve_target_file(models_root, target_subdir, filename, size)
        relative_label = resolved["relative_path"]
        error = ""
        status = resolved["status"]
        found_by = resolved["found_by"]
    except ValueError as exc:
        relative_label = ""
        status = "invalid"
        found_by = ""
        error = str(exc)

    if raw_url and not url and not error:
        error = DOWNLOAD_LINK_ERROR

    return {
        "id": str(row.get("id") or f"custom_{index + 1}"),
        "label": label,
        "url": url,
        "target_subdir": target_subdir,
        "filename": filename,
        "relative_path": relative_label,
        "size": size,
        "status": status,
        "found_by": found_by,
        "error": error,
    }


def _public_package_files(models_root: str, package: Dict) -> List[Dict]:
    normalized = _normalize_package(package)
    return [_public_custom_file(models_root, row, index) for index, row in enumerate(normalized.get("files", []))]


def _build_payload(root_id: str | None, state_value=None, package_value=None, model_root: str | None = None) -> Dict:
    selected, roots, selection_mode, selection_reason = _select_root(root_id, model_root)
    state = _parse_presets_state(state_value)
    package = (
        _canonicalize_builtin_package(_normalize_package(package_value))
        if package_value is not None
        else _active_package_from_state(state)
    )
    public_roots = [
        {
            "id": root["id"],
            "label": (
                "Default models folder"
                if root["source"] == "default" else f"Registered models folder {index + 1}"
            ),
            "existing_count": sum(
                1
                for file in _public_package_files(root["path"], package)
                if file["status"] == "exists"
            ),
        }
        for index, root in enumerate(roots)
    ]
    if selection_mode == "auto":
        selected_count = next(
            root["existing_count"] for root in public_roots if root["id"] == selected["id"]
        )
        best = max(public_roots, key=lambda root: root["existing_count"])
        if best["existing_count"] > selected_count:
            selected = next(root for root in roots if root["id"] == best["id"])
            selection_reason = "auto_highest_ready_count"

    files = _public_package_files(selected["path"], package)
    return {
        "mode": "manual_setup_helper",
        "frontend_protocol": 4,
        "selection_mode": selection_mode,
        "selection_reason": selection_reason,
        "preset_id": package["id"],
        "preset_label": package["title"],
        "package": package,
        "presets_state": state,
        "instructions": package.get("description") or "Open links, download with your browser, then move files into the shown target paths.",
        "roots": public_roots,
        "selected_root_id": selected["id"],
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
        _LOGGER.warning("LTX model folder information is unavailable.", exc_info=exc)
        return web.json_response({"error": "Model folders are unavailable. Check the ComfyUI console."}, status=500)


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/check")
async def ltx_model_downloader_check(request):
    try:
        data = await request.json()
    except (TypeError, ValueError):
        return web.json_response({"error": "Invalid JSON body."}, status=400)
    if not isinstance(data, dict):
        return web.json_response({"error": "The request must be a JSON object."}, status=400)
    try:
        return web.json_response(
            _build_payload(
                data.get("root_id"),
                data.get("presets_state"),
                data.get("package"),
                data.get("model_root"),
            )
        )
    except Exception as exc:  # noqa: BLE001
        _LOGGER.warning("LTX model folder check failed.", exc_info=exc)
        return web.json_response({"error": "Model folders are unavailable. Check the ComfyUI console."}, status=500)


class DenoLTXModelDownloader:
    DESCRIPTION = (
        "Preset-based easy model download helper.\n"
        "Includes the LTX 2.3 8GB VRAM GGUF starter set and the official LTX 2.5 Distilled INT8 set. "
        "Shows Hugging Face links, target ComfyUI model paths, and local install status without "
        "running automatic downloads. LTX 2.5 requires Hugging Face Agree and Access and is "
        "provided under the LTX-2 Community License."
    )
    RETURN_TYPES = ()
    FUNCTION = "run"
    CATEGORY = "Deno/Setup"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model_root": (
                    "STRING",
                    {"default": AUTO_MODEL_ROOT},
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
