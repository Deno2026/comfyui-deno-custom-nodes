import io
import ipaddress
import os
import socket
import urllib.error
import urllib.parse
import urllib.request
from typing import List

import numpy as np
import torch
from aiohttp import web
from PIL import Image, ImageOps
from server import PromptServer

from .deno_multi_image_board import (
    IMAGE_INTERPOLATION_MODES,
    INPUT_BROWSER_IMAGE_EXTENSIONS,
    _compute_keep_input_ratio_dims,
    _resize_tensor,
    _resolve_path,
    _split_paths,
)
from .deno_resolution_common import (
    COMMON_RATIOS,
    DIVISIBLE_BY_VALUES,
    RESIZE_METHODS,
    compute_aligned_ratio_dims,
    round_up,
    validate_combo_choice,
    validate_active_ratio_preset,
)


REMOTE_IMAGE_TIMEOUT_SECONDS = 20
REMOTE_IMAGE_MAX_BYTES = 64 * 1024 * 1024
REMOTE_IMAGE_MAX_REDIRECTS = 5
ADVANCED_RESIZE_METHODS = list(dict.fromkeys([
    *RESIZE_METHODS,
    "Top Crop (Fill)",
    "Bottom Crop (Fill)",
]))


class _DenoNoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_REMOTE_IMAGE_OPENER = urllib.request.build_opener(_DenoNoRedirectHandler)


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


@PromptServer.instance.routes.get("/deno/advanced/external-folder-images")
async def deno_advanced_external_folder_images(request):
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


@PromptServer.instance.routes.get("/deno/advanced/external-image-view")
async def deno_advanced_external_image_view(request):
    if not _is_loopback_request(request):
        return web.json_response({"error": "External image previews are only available from localhost."}, status=403)

    requested_path = str(request.query.get("path", "")).strip().strip('"')
    if not requested_path or not os.path.isabs(requested_path):
        return web.json_response({"error": "Invalid image path."}, status=400)

    full_path = os.path.realpath(os.path.expanduser(os.path.expandvars(requested_path)))
    if not os.path.isfile(full_path) or os.path.splitext(full_path)[1].lower() not in INPUT_BROWSER_IMAGE_EXTENSIONS:
        return web.json_response({"error": "Image not found."}, status=404)

    return web.FileResponse(full_path)


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


def _filter_disabled_sources(sources: List[str], disabled_image_paths: str) -> List[str]:
    disabled = set(_split_paths(disabled_image_paths))
    if not disabled:
        return sources
    return [source for source in sources if source not in disabled]


def _split_input_image_batch(images) -> List[torch.Tensor]:
    if images is None:
        return []
    if isinstance(images, torch.Tensor) and hasattr(images, "ndim"):
        image_tensor = images
        if image_tensor.ndim == 3:
            image_tensor = image_tensor.unsqueeze(0)
        if image_tensor.ndim != 4:
            return []
        return [image_tensor[index:index + 1] for index in range(int(image_tensor.shape[0]))]
    if isinstance(images, (list, tuple)):
        split_images = []
        for image in images:
            split_images.extend(_split_input_image_batch(image))
        return split_images
    return []


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
                "mode": (["Keep Input Ratio", "Preset Ratio", "Manual Input"], {"default": "Keep Input Ratio"}),
                "ratio_preset": (COMMON_RATIOS, {"default": "16:9"}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.01, "max": 10.0, "step": 0.01}),
                "width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "divisible_by": (DIVISIBLE_BY_VALUES, {"default": "32"}),
                "interpolation": (IMAGE_INTERPOLATION_MODES, {"default": "lanczos"}),
                "resize_method": (ADVANCED_RESIZE_METHODS, {"default": "Center Crop (Fill)"}),
                "recursive_folders": ("BOOLEAN", {"default": False}),
                "list_output_mode": (["Original Size", "Match Batch Size"], {"default": "Original Size"}),
                "disabled_image_paths": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": {
                "images": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "INT", "INT", "INT")
    RETURN_NAMES = ("batch", "image_list", "width", "height", "image_count")
    OUTPUT_IS_LIST = (False, True, False, False, False)
    FUNCTION = "load_images"
    CATEGORY = "Deno/Image"

    @classmethod
    def VALIDATE_INPUTS(
        cls,
        mode=None,
        ratio_preset=None,
        divisible_by=None,
        interpolation=None,
        resize_method=None,
        list_output_mode=None,
    ):
        for result in (
            validate_combo_choice("mode", mode, ["Keep Input Ratio", "Preset Ratio", "Manual Input"]),
            validate_combo_choice("divisible_by", divisible_by, DIVISIBLE_BY_VALUES),
            validate_combo_choice("interpolation", interpolation, IMAGE_INTERPOLATION_MODES),
            validate_combo_choice("resize_method", resize_method, ADVANCED_RESIZE_METHODS),
            validate_combo_choice("list_output_mode", list_output_mode, ["Original Size", "Match Batch Size"]),
        ):
            if result is not True:
                return result
        return validate_active_ratio_preset(mode, ratio_preset)

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
        disabled_image_paths: str = "",
        images=None,
    ):
        source_inputs = _filter_disabled_sources(_split_paths(image_paths), disabled_image_paths)
        sources = _expand_image_sources(source_inputs, bool(recursive_folders))
        originals = _split_input_image_batch(images)
        loaded_image_count = len(originals)

        for source in sources:
            image_tensor = _image_source_to_tensor(source)
            if image_tensor is not None:
                originals.append(image_tensor)
                loaded_image_count += 1

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

        return (batch, image_list, int(width), int(height), loaded_image_count)
