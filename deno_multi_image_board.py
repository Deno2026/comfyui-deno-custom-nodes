import io
import os
import math
import ipaddress
import socket
import urllib.error
import urllib.parse
import urllib.request
from typing import List, Tuple

import numpy as np
import torch
import torch.nn.functional as F
from aiohttp import web
from PIL import Image, ImageOps
from server import PromptServer

from .deno_resolution_common import COMMON_RATIOS, DIVISIBLE_BY_VALUES, RESIZE_METHODS, compute_aligned_ratio_dims, round_up


IMAGE_INTERPOLATION_MODES = ["lanczos", "bicubic", "bilinear", "area", "nearest", "nearest-exact"]
LOADER_MODES = ["Keep Input Ratio", "Preset Ratio", "Manual Input"]
INPUT_BROWSER_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"}
REMOTE_IMAGE_TIMEOUT_SECONDS = 20
REMOTE_IMAGE_MAX_BYTES = 64 * 1024 * 1024
REMOTE_IMAGE_MAX_REDIRECTS = 5


class _DenoNoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_REMOTE_IMAGE_OPENER = urllib.request.build_opener(_DenoNoRedirectHandler)


def _choice(value, choices, default):
    text = str(value).strip()
    return text if text in choices else default


def _safe_float(value, default, minimum, maximum):
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = float(default)
    if not math.isfinite(number):
        number = float(default)
    return min(max(number, minimum), maximum)


def _safe_int(value, default, minimum, maximum):
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        number = int(default)
    return min(max(number, minimum), maximum)


def _normalize_divisible_by(value, default="32"):
    text = str(value).strip()
    if text in DIVISIBLE_BY_VALUES:
        return text
    try:
        text = str(int(float(text)))
    except (TypeError, ValueError):
        return default
    return text if text in DIVISIBLE_BY_VALUES else default


def _looks_like_legacy_loader_without_mode(mode, ratio_preset):
    return str(mode).strip() in COMMON_RATIOS and str(ratio_preset).strip() not in COMMON_RATIOS


def _normalize_loader_inputs(
    mode,
    ratio_preset,
    megapixels,
    width,
    height,
    divisible_by,
    interpolation,
    resize_method,
):
    if _looks_like_legacy_loader_without_mode(mode, ratio_preset):
        legacy_ratio_preset = mode
        legacy_megapixels = ratio_preset
        legacy_width = megapixels
        legacy_height = width
        legacy_divisible_by = height
        legacy_interpolation = divisible_by
        legacy_resize_method = interpolation

        mode = "Preset Ratio"
        ratio_preset = legacy_ratio_preset
        megapixels = legacy_megapixels
        width = legacy_width
        height = legacy_height
        divisible_by = legacy_divisible_by
        interpolation = legacy_interpolation
        resize_method = legacy_resize_method

    return (
        _choice(mode, LOADER_MODES, "Keep Input Ratio"),
        _choice(ratio_preset, COMMON_RATIOS, "16:9"),
        _safe_float(megapixels, 1.0, 0.01, 10.0),
        _safe_int(width, 1024, 64, 8192),
        _safe_int(height, 1024, 64, 8192),
        _normalize_divisible_by(divisible_by),
        _choice(interpolation, IMAGE_INTERPOLATION_MODES, "lanczos"),
        _choice(resize_method, RESIZE_METHODS, "Center Crop (Fill)"),
    )


def _get_folder_paths():
    try:
        import folder_paths
    except ModuleNotFoundError:
        return None
    return folder_paths


def _get_comfy_utils():
    try:
        from comfy import utils as comfy_utils
    except ModuleNotFoundError:
        return None
    return comfy_utils


def _normalize_input_browser_path(relative_path: str | None) -> str | None:
    raw_path = str(relative_path or "").replace("\\", "/").strip().strip("/")
    if not raw_path or raw_path == ".":
        return ""

    normalized = os.path.normpath(raw_path).replace("\\", "/")
    if normalized in {"", "."}:
        return ""
    if os.path.isabs(raw_path) or ":" in normalized or normalized == ".." or normalized.startswith("../"):
        return None
    return normalized


def _resolve_input_browser_dir(input_dir: str, relative_path: str) -> str | None:
    base_dir = os.path.realpath(input_dir)
    candidate_dir = os.path.realpath(os.path.join(base_dir, relative_path))

    try:
        common_path = os.path.commonpath([os.path.normcase(base_dir), os.path.normcase(candidate_dir)])
    except ValueError:
        return None

    if common_path != os.path.normcase(base_dir):
        return None
    return candidate_dir if os.path.isdir(candidate_dir) else None


def _to_input_relative_path(input_dir: str, full_path: str) -> str:
    relative = os.path.relpath(full_path, input_dir)
    if relative == ".":
        return ""
    return relative.replace("\\", "/")


def _get_input_browser_parent(relative_path: str) -> str:
    if not relative_path:
        return ""
    parent = os.path.dirname(relative_path).replace("\\", "/")
    return "" if parent == "." else parent


def _empty_input_folder_listing(relative_path: str = ""):
    return {
        "path": relative_path,
        "parent": _get_input_browser_parent(relative_path),
        "folders": [],
        "files": [],
    }


def _list_input_folder_entries(relative_path: str | None = ""):
    folder_paths = _get_folder_paths()
    if folder_paths is None or not hasattr(folder_paths, "get_input_directory"):
        return _empty_input_folder_listing()

    input_dir = folder_paths.get_input_directory()
    browser_path = _normalize_input_browser_path(relative_path)
    if browser_path is None:
        return _empty_input_folder_listing()

    current_dir = _resolve_input_browser_dir(input_dir, browser_path)
    if current_dir is None:
        return _empty_input_folder_listing(browser_path)

    folders = []
    files = []
    try:
        for name in os.listdir(current_dir):
            full_path = os.path.join(current_dir, name)
            stat = os.stat(full_path)
            if os.path.isdir(full_path):
                folders.append({
                    "name": name,
                    "path": _to_input_relative_path(input_dir, full_path),
                    "mtime": stat.st_mtime,
                })
                continue
            if os.path.isfile(full_path) and os.path.splitext(name)[1].lower() in INPUT_BROWSER_IMAGE_EXTENSIONS:
                files.append({
                    "name": _to_input_relative_path(input_dir, full_path),
                    "display_name": name,
                    "mtime": stat.st_mtime,
                    "size": stat.st_size,
                })
    except Exception as exc:
        print(f"[DenoMultiImageLoader] Failed to list input folder images: {exc}")
        return _empty_input_folder_listing(browser_path)

    return {
        "path": browser_path,
        "parent": _get_input_browser_parent(browser_path),
        "folders": sorted(folders, key=lambda item: str(item["name"]).lower()),
        "files": sorted(files, key=lambda item: (-float(item["mtime"]), str(item["name"]).lower())),
    }


def _list_input_folder_images(relative_path: str | None = ""):
    return _list_input_folder_entries(relative_path)["files"]


@PromptServer.instance.routes.get("/deno/input-folder-images")
async def deno_input_folder_images(request):
    requested_path = request.query.get("path", "")
    browser_path = _normalize_input_browser_path(requested_path)
    if browser_path is None:
        return web.json_response({"error": "Invalid input folder path."}, status=400)
    return web.json_response(_list_input_folder_entries(browser_path))


def _normalize_external_root(root_path: str | None) -> str | None:
    raw_path = str(root_path or "").strip().strip('"')
    if not raw_path:
        return None

    expanded = os.path.expanduser(os.path.expandvars(raw_path))
    if not os.path.isabs(expanded):
        return None

    root = os.path.realpath(expanded)
    return root if os.path.isdir(root) else None


def _normalize_external_relative_path(relative_path: str | None) -> str | None:
    raw_path = str(relative_path or "").replace("\\", "/").strip().strip("/")
    if not raw_path or raw_path == ".":
        return ""

    normalized = os.path.normpath(raw_path).replace("\\", "/")
    if normalized in {"", "."}:
        return ""
    if os.path.isabs(raw_path) or ":" in normalized or normalized == ".." or normalized.startswith("../"):
        return None
    return normalized


def _resolve_external_browser_dir(root_dir: str, relative_path: str) -> str | None:
    base_dir = os.path.realpath(root_dir)
    candidate_dir = os.path.realpath(os.path.join(base_dir, relative_path))

    try:
        common_path = os.path.commonpath([os.path.normcase(base_dir), os.path.normcase(candidate_dir)])
    except ValueError:
        return None

    if common_path != os.path.normcase(base_dir):
        return None
    return candidate_dir if os.path.isdir(candidate_dir) else None


def _to_external_relative_path(root_dir: str, full_path: str) -> str:
    relative = os.path.relpath(full_path, root_dir)
    if relative == ".":
        return ""
    return relative.replace("\\", "/")


def _get_external_browser_parent(relative_path: str) -> str:
    if not relative_path:
        return ""
    parent = os.path.dirname(relative_path).replace("\\", "/")
    return "" if parent == "." else parent


def _empty_external_folder_listing(root_path: str | None = None, relative_path: str = ""):
    return {
        "root": root_path or "",
        "path": relative_path,
        "parent": _get_external_browser_parent(relative_path),
        "folders": [],
        "files": [],
    }


def _is_loopback_request(request) -> bool:
    remote = getattr(request, "remote", None) or ""
    if not remote and getattr(request, "transport", None) is not None:
        peername = request.transport.get_extra_info("peername")
        if peername:
            remote = peername[0]

    try:
        return ipaddress.ip_address(str(remote)).is_loopback
    except ValueError:
        return str(remote).lower() in {"localhost", "::1"}


def _list_external_folder_entries(root_path: str | None, relative_path: str | None = ""):
    root_dir = _normalize_external_root(root_path)
    if root_dir is None:
        return _empty_external_folder_listing()

    browser_path = _normalize_external_relative_path(relative_path)
    if browser_path is None:
        return _empty_external_folder_listing(root_dir)

    current_dir = _resolve_external_browser_dir(root_dir, browser_path)
    if current_dir is None:
        return _empty_external_folder_listing(root_dir, browser_path)

    folders = []
    files = []
    try:
        for name in os.listdir(current_dir):
            full_path = os.path.join(current_dir, name)
            stat = os.stat(full_path)
            if os.path.isdir(full_path):
                folders.append({
                    "name": name,
                    "path": _to_external_relative_path(root_dir, full_path),
                    "mtime": stat.st_mtime,
                })
                continue
            if os.path.isfile(full_path) and os.path.splitext(name)[1].lower() in INPUT_BROWSER_IMAGE_EXTENSIONS:
                files.append({
                    "name": _to_external_relative_path(root_dir, full_path),
                    "display_name": name,
                    "path": os.path.realpath(full_path),
                    "mtime": stat.st_mtime,
                    "size": stat.st_size,
                })
    except Exception as exc:
        print(f"[DenoAdvancedImageSourceLoader] Failed to list external folder images: {exc}")
        return _empty_external_folder_listing(root_dir, browser_path)

    return {
        "root": root_dir,
        "path": browser_path,
        "parent": _get_external_browser_parent(browser_path),
        "folders": sorted(folders, key=lambda item: str(item["name"]).lower()),
        "files": sorted(files, key=lambda item: (-float(item["mtime"]), str(item["name"]).lower())),
    }


@PromptServer.instance.routes.get("/deno/external-folder-images")
async def deno_external_folder_images(request):
    if not _is_loopback_request(request):
        return web.json_response({"error": "External folder browsing is only available from localhost."}, status=403)

    root_path = request.query.get("root", "")
    requested_path = request.query.get("path", "")
    root_dir = _normalize_external_root(root_path)
    if root_dir is None:
        return web.json_response({"error": "Invalid external folder path."}, status=400)

    browser_path = _normalize_external_relative_path(requested_path)
    if browser_path is None:
        return web.json_response({"error": "Invalid external subfolder path."}, status=400)

    return web.json_response(_list_external_folder_entries(root_dir, browser_path))


@PromptServer.instance.routes.get("/deno/external-image-view")
async def deno_external_image_view(request):
    if not _is_loopback_request(request):
        return web.json_response({"error": "External image previews are only available from localhost."}, status=403)

    requested_path = str(request.query.get("path", "")).strip().strip('"')
    if not requested_path or not os.path.isabs(requested_path):
        return web.json_response({"error": "Invalid image path."}, status=400)

    full_path = os.path.realpath(os.path.expanduser(os.path.expandvars(requested_path)))
    if not os.path.isfile(full_path) or os.path.splitext(full_path)[1].lower() not in INPUT_BROWSER_IMAGE_EXTENSIONS:
        return web.json_response({"error": "Image not found."}, status=404)

    return web.FileResponse(full_path)


def _split_paths(image_paths: str) -> List[str]:
    return [line.strip() for line in (image_paths or "").splitlines() if line.strip()]


def _round_down(value: float, multiple: int) -> int:
    return max(multiple, int(math.floor(float(value) / multiple) * multiple))


def _round_nearest(value: float, multiple: int) -> int:
    return max(multiple, int(math.floor((float(value) / multiple) + 0.5) * multiple))


def _compute_keep_input_ratio_dims(source_width: int, source_height: int, megapixels: float, divisible_by: int) -> Tuple[int, int]:
    effective_alignment = int(divisible_by)
    total_pixels = max(0.01, float(megapixels)) * 1_000_000
    source_area = max(1.0, float(source_width * source_height))
    source_aspect = float(source_width) / float(source_height)

    scale = math.sqrt(total_pixels / source_area)
    base_width = max(float(effective_alignment), float(source_width) * scale)
    base_height = max(float(effective_alignment), float(source_height) * scale)

    rounders = (_round_down, _round_nearest, round_up)
    candidates = set()

    for rounder in rounders:
        width_candidate = rounder(base_width, effective_alignment)
        exact_height = width_candidate / source_aspect
        for height_rounder in rounders:
            candidates.add((width_candidate, height_rounder(exact_height, effective_alignment)))

    for rounder in rounders:
        height_candidate = rounder(base_height, effective_alignment)
        exact_width = height_candidate * source_aspect
        for width_rounder in rounders:
            candidates.add((width_rounder(exact_width, effective_alignment), height_candidate))

    candidates.add((
        _round_nearest(base_width, effective_alignment),
        _round_nearest(base_height, effective_alignment),
    ))

    def candidate_score(dims: Tuple[int, int]) -> Tuple[float, float, float]:
        width_candidate, height_candidate = dims
        area_error = abs((width_candidate * height_candidate) - total_pixels) / total_pixels
        ratio_error = abs((width_candidate / height_candidate) - source_aspect) / source_aspect
        distance_error = (
            abs(width_candidate - base_width) / base_width
            + abs(height_candidate - base_height) / base_height
        )
        return (area_error, ratio_error, distance_error)

    return min(candidates, key=candidate_score)


def _read_image_size(path: str) -> tuple[int, int] | None:
    resolved_path = _resolve_path(path)
    if resolved_path is None:
        return None
    try:
        with Image.open(resolved_path) as image:
            image = ImageOps.exif_transpose(image)
            return image.size
    except Exception as exc:
        print(f"[DenoMultiImageLoader] Failed to read image size {path}: {exc}")
        return None


def _resolve_path(path: str) -> str | None:
    if os.path.exists(path):
        return path

    folder_paths = _get_folder_paths()
    if folder_paths is None:
        return None

    fallback_path = os.path.join(folder_paths.get_input_directory(), path)
    return fallback_path if os.path.exists(fallback_path) else None


def _is_remote_image_url(source: str) -> bool:
    parsed = urllib.parse.urlparse(str(source or "").strip())
    return parsed.scheme.lower() in {"http", "https"} and bool(parsed.netloc)


def _is_safe_remote_image_url(source: str) -> bool:
    parsed = urllib.parse.urlparse(str(source or "").strip())
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        return False
    if parsed.username or parsed.password:
        return False

    try:
        addr_infos = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False

    for addr_info in addr_infos:
        ip_text = addr_info[4][0]
        try:
            address = ipaddress.ip_address(ip_text)
        except ValueError:
            return False
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_multicast
            or address.is_reserved
            or address.is_unspecified
        ):
            return False
    return True


def _read_remote_image_bytes(source: str) -> bytes:
    if not _is_safe_remote_image_url(source):
        raise ValueError("Remote image URL is not allowed.")

    current_source = source
    response = None
    for _redirect_count in range(REMOTE_IMAGE_MAX_REDIRECTS + 1):
        request = urllib.request.Request(
            current_source,
            headers={"User-Agent": "DENO-ComfyUI-Custom-Nodes/0.4"},
            method="GET",
        )
        try:
            response = _REMOTE_IMAGE_OPENER.open(request, timeout=REMOTE_IMAGE_TIMEOUT_SECONDS)
            break
        except urllib.error.HTTPError as exc:
            if exc.code not in {301, 302, 303, 307, 308}:
                raise

            redirect_target = exc.headers.get("Location")
            if not redirect_target:
                raise ValueError("Remote image redirect did not include a Location header.")

            current_source = urllib.parse.urljoin(current_source, redirect_target)
            if not _is_safe_remote_image_url(current_source):
                raise ValueError("Remote image redirect target is not allowed.")
    else:
        raise ValueError("Remote image redirected too many times.")

    if response is None:
        raise ValueError("Remote image request failed.")

    with response:
        content_type = str(response.headers.get("Content-Type", "")).lower()
        if content_type and not (
            content_type.startswith("image/")
            or content_type.startswith("application/octet-stream")
            or content_type.startswith("binary/octet-stream")
        ):
            raise ValueError(f"Remote URL did not return an image content type: {content_type}")

        chunks = []
        total = 0
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > REMOTE_IMAGE_MAX_BYTES:
                raise ValueError("Remote image is too large.")
            chunks.append(chunk)
        return b"".join(chunks)


def _open_image_source(source: str) -> Image.Image | None:
    raw_source = str(source or "").strip().strip('"')
    if not raw_source:
        return None

    try:
        if _is_remote_image_url(raw_source):
            return Image.open(io.BytesIO(_read_remote_image_bytes(raw_source)))

        resolved_path = _resolve_path(raw_source)
        if resolved_path is None:
            return None
        return Image.open(resolved_path)
    except (OSError, ValueError, urllib.error.URLError) as exc:
        print(f"[DenoAdvancedImageSourceLoader] Failed to open image source {raw_source}: {exc}")
        return None


def _source_is_directory(source: str) -> bool:
    raw_source = str(source or "").strip().strip('"')
    return bool(raw_source) and os.path.isdir(os.path.expanduser(os.path.expandvars(raw_source)))


def _expand_image_sources(sources: List[str], recursive_folders: bool = False) -> List[str]:
    expanded = []
    for source in sources:
        raw_source = str(source or "").strip().strip('"')
        if not raw_source:
            continue

        local_candidate = os.path.expanduser(os.path.expandvars(raw_source))
        if os.path.isdir(local_candidate):
            try:
                if recursive_folders:
                    walker = os.walk(
                        local_candidate,
                        onerror=lambda exc: print(f"[DenoAdvancedImageSourceLoader] Failed to scan folder {local_candidate}: {exc}"),
                    )
                else:
                    walker = [(local_candidate, [], os.listdir(local_candidate))]
            except OSError as exc:
                print(f"[DenoAdvancedImageSourceLoader] Failed to scan folder {local_candidate}: {exc}")
                continue

            folder_files = []
            for current_dir, _folder_names, file_names in walker:
                for file_name in file_names:
                    full_path = os.path.join(current_dir, file_name)
                    if os.path.isfile(full_path) and os.path.splitext(full_path)[1].lower() in INPUT_BROWSER_IMAGE_EXTENSIONS:
                        folder_files.append(os.path.realpath(full_path))
            expanded.extend(sorted(folder_files, key=lambda item: item.lower()))
            continue

        expanded.append(raw_source)

    return expanded


def _image_source_to_tensor(source: str) -> torch.Tensor | None:
    image = _open_image_source(source)
    if image is None:
        print(f"[DenoAdvancedImageSourceLoader] Missing image source: {source}")
        return None

    try:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image_np = np.asarray(image).astype(np.float32) / 255.0
        return torch.from_numpy(image_np)[None, ...]
    except Exception as exc:
        print(f"[DenoAdvancedImageSourceLoader] Failed to load {source}: {exc}")
        return None


def _resize_tensor(
    image: torch.Tensor,
    width: int,
    height: int,
    resize_method: str,
    interpolation: str,
) -> torch.Tensor:
    _, source_height, source_width, _ = image.shape

    if width <= 0:
        width = source_width
    if height <= 0:
        height = source_height

    image_nchw = image.movedim(-1, 1)

    if resize_method == "Fit (Letterbox/Pillarbox)":
        scale = min(width / source_width, height / source_height)
        target_width = max(1, int(round(source_width * scale)))
        target_height = max(1, int(round(source_height * scale)))
        resized = _interpolate_tensor(image_nchw, target_height, target_width, interpolation)

        pad_width = max(0, width - target_width)
        pad_height = max(0, height - target_height)
        resized = F.pad(
            resized,
            (
                pad_width // 2,
                pad_width - (pad_width // 2),
                pad_height // 2,
                pad_height - (pad_height // 2),
            ),
            value=0.0,
        )
    elif resize_method == "Center Crop (Fill)":
        scale = max(width / source_width, height / source_height)
        target_width = max(1, int(round(source_width * scale)))
        target_height = max(1, int(round(source_height * scale)))
        resized = _interpolate_tensor(image_nchw, target_height, target_width, interpolation)
        crop_x = max(0, (target_width - width) // 2)
        crop_y = max(0, (target_height - height) // 2)
        resized = resized[:, :, crop_y:crop_y + height, crop_x:crop_x + width]
    else:
        resized = _interpolate_tensor(image_nchw, height, width, interpolation)

    resized = resized.movedim(1, -1).clamp(0.0, 1.0)

    return resized


def _interpolate_tensor(image_nchw: torch.Tensor, height: int, width: int, interpolation: str) -> torch.Tensor:
    comfy_utils = _get_comfy_utils()
    if interpolation == "lanczos" and comfy_utils is not None:
        return comfy_utils.common_upscale(image_nchw, width, height, "lanczos", "disabled")

    kwargs = {}
    if interpolation in {"bilinear", "bicubic"}:
        kwargs["align_corners"] = False
    return F.interpolate(image_nchw, size=(height, width), mode=interpolation, **kwargs)


class DenoMultiImageLoader:
    DESCRIPTION = (
        "Minor-upgrade multi image loader for ComfyUI with drag reorder, "
        "paste/upload support, and stable batch output.\n"
        "YouTube: https://www.youtube.com/@Denoise-AI"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_paths": ("STRING", {"default": "", "multiline": True}),
                "mode": (LOADER_MODES, {"default": "Keep Input Ratio"}),
                "ratio_preset": (COMMON_RATIOS, {"default": "16:9"}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.01, "max": 10.0, "step": 0.01}),
                "width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "divisible_by": (DIVISIBLE_BY_VALUES, {"default": "32"}),
                "interpolation": (IMAGE_INTERPOLATION_MODES, {"default": "lanczos"}),
                "resize_method": (RESIZE_METHODS, {"default": "Center Crop (Fill)"}),
            }
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT")
    RETURN_NAMES = ("multi_output", "width", "height")
    FUNCTION = "load_images"
    CATEGORY = "Deno/Image"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def _load_single_image(
        self,
        path: str,
        width: int,
        height: int,
        interpolation: str,
        resize_method: str,
    ) -> torch.Tensor | None:
        resolved_path = _resolve_path(path)
        if resolved_path is None:
            print(f"[DenoMultiImageLoader] Missing image: {path}")
            return None

        try:
            image = Image.open(resolved_path)
            image = ImageOps.exif_transpose(image).convert("RGB")
            image_np = np.asarray(image).astype(np.float32) / 255.0
            image_tensor = torch.from_numpy(image_np)[None, ...]
            image_tensor = _resize_tensor(image_tensor, width, height, resize_method, interpolation)
            return image_tensor
        except Exception as exc:
            print(f"[DenoMultiImageLoader] Failed to load {path}: {exc}")
            return None

    def load_images(
        self,
        image_paths: str,
        mode: str,
        ratio_preset: str,
        megapixels: float,
        width: int,
        height: int,
        divisible_by,
        interpolation: str,
        resize_method: str,
    ):
        (
            mode,
            ratio_preset,
            megapixels,
            width,
            height,
            divisible_by,
            interpolation,
            resize_method,
        ) = _normalize_loader_inputs(
            mode=mode,
            ratio_preset=ratio_preset,
            megapixels=megapixels,
            width=width,
            height=height,
            divisible_by=divisible_by,
            interpolation=interpolation,
            resize_method=resize_method,
        )
        paths = _split_paths(image_paths)

        if mode == "Preset Ratio":
            width, height = compute_aligned_ratio_dims(ratio_preset, megapixels, int(divisible_by))
        elif mode == "Keep Input Ratio":
            first_size = _read_image_size(paths[0]) if paths else None
            if first_size is not None:
                width, height = _compute_keep_input_ratio_dims(first_size[0], first_size[1], megapixels, int(divisible_by))
            else:
                width = round_up(width, int(divisible_by))
                height = round_up(height, int(divisible_by))
        else:
            width = round_up(width, int(divisible_by))
            height = round_up(height, int(divisible_by))

        loaded_images = []
        for path in paths:
            image_tensor = self._load_single_image(
                path=path,
                width=width,
                height=height,
                interpolation=interpolation,
                resize_method=resize_method,
            )
            if image_tensor is not None:
                loaded_images.append(image_tensor)

        if loaded_images:
            can_batch = all(image.shape == loaded_images[0].shape for image in loaded_images)
            multi_output = torch.cat(loaded_images, dim=0) if can_batch else torch.zeros((1, 64, 64, 3), dtype=torch.float32)
        else:
            multi_output = torch.zeros((1, 64, 64, 3), dtype=torch.float32)

        return (multi_output, int(width), int(height))


class DenoAdvancedImageSourceLoader:
    DESCRIPTION = (
        "Advanced image source loader for users who need external folders, "
        "absolute file paths, web URLs, batch output, and mixed-size image-list output.\n"
        "Use the standard Multi Image Loader for simpler input-folder workflows.\n"
        "YouTube: https://www.youtube.com/@Denoise-AI"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_paths": ("STRING", {"default": "", "multiline": True}),
                "mode": (LOADER_MODES, {"default": "Keep Input Ratio"}),
                "ratio_preset": (COMMON_RATIOS, {"default": "16:9"}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.01, "max": 10.0, "step": 0.01}),
                "width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "divisible_by": (DIVISIBLE_BY_VALUES, {"default": "32"}),
                "interpolation": (IMAGE_INTERPOLATION_MODES, {"default": "lanczos"}),
                "resize_method": (RESIZE_METHODS, {"default": "Center Crop (Fill)"}),
                "recursive_folders": ("BOOLEAN", {"default": False}),
                "list_output_mode": (["Original Size", "Match Batch Size"], {"default": "Original Size"}),
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "INT", "INT", "INT")
    RETURN_NAMES = ("batch", "image_list", "width", "height", "image_count")
    OUTPUT_IS_LIST = (False, True, False, False, False)
    FUNCTION = "load_images"
    CATEGORY = "Deno/Image"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def load_images(
        self,
        image_paths: str,
        mode: str,
        ratio_preset: str,
        megapixels: float,
        width: int,
        height: int,
        divisible_by,
        interpolation: str,
        resize_method: str,
        recursive_folders: bool,
        list_output_mode: str,
    ):
        (
            mode,
            ratio_preset,
            megapixels,
            width,
            height,
            divisible_by,
            interpolation,
            resize_method,
        ) = _normalize_loader_inputs(
            mode=mode,
            ratio_preset=ratio_preset,
            megapixels=megapixels,
            width=width,
            height=height,
            divisible_by=divisible_by,
            interpolation=interpolation,
            resize_method=resize_method,
        )
        list_output_mode = _choice(list_output_mode, ["Original Size", "Match Batch Size"], "Original Size")
        sources = _expand_image_sources(_split_paths(image_paths), bool(recursive_folders))
        originals = []
        loaded_source_count = 0

        for source in sources:
            image_tensor = _image_source_to_tensor(source)
            if image_tensor is not None:
                originals.append(image_tensor)
                loaded_source_count += 1

        if mode == "Preset Ratio":
            width, height = compute_aligned_ratio_dims(ratio_preset, megapixels, int(divisible_by))
        elif mode == "Keep Input Ratio" and originals:
            _, source_height, source_width, _ = originals[0].shape
            width, height = _compute_keep_input_ratio_dims(int(source_width), int(source_height), megapixels, int(divisible_by))
        else:
            width = round_up(width, int(divisible_by))
            height = round_up(height, int(divisible_by))

        if not originals:
            blank = torch.zeros((1, int(height), int(width), 3), dtype=torch.float32)
            return (blank, [blank], int(width), int(height), 0)

        batch_images = [
            _resize_tensor(
                image=image_tensor,
                width=width,
                height=height,
                resize_method=resize_method,
                interpolation=interpolation,
            )
            for image_tensor in originals
        ]
        batch = torch.cat(batch_images, dim=0)

        if list_output_mode == "Match Batch Size":
            image_list = batch_images
        else:
            image_list = originals

        return (batch, image_list, int(width), int(height), loaded_source_count)
