# LTX Model Download Helper

## Product Contract

`DenoLTXModelDownloader` is a manual setup helper for beginner-friendly LTX and workflow model packs.

The node must show official source links, intended ComfyUI target paths, and lightweight local install status. It must never download, copy, move, or delete model files from Python.

The node is an outputless setup helper. Keep the public node id `DenoLTXModelDownloader`, display name `(Deno) Easy Model Download Helper`, required widgets `model_root` and `presets_json`, and `OUTPUT_NODE = True` for saved workflow compatibility.

## Startup Contract

ComfyUI and ComfyUI EZi Desktop query `/object_info` before the UI is ready. That path calls `INPUT_TYPES()`, sometimes more than once. `INPUT_TYPES()` must stay lightweight:

- no recursive model-folder scans
- no network requests
- no download helper work
- no package status counting
- no user model-folder traversal beyond cheap registered-root discovery

The startup default may choose a registered models root, but it must not inspect every model file to rank roots.

## Install Status Contract

The helper route may check direct configured target paths and ComfyUI-registered folder paths. It should avoid deep recursive scans by default because user model folders can be huge, linked, offline, or shared across runtimes.

If a future UI adds an explicit "deep scan" action, keep it opt-in and make the cost visible to the user. Do not attach deep scan to page load, node creation, `/object_info`, or normal status refresh.

## Verification Matrix

- `DenoLTXModelDownloader.INPUT_TYPES()` returns required widgets without calling `Path.rglob`.
- The default helper payload returns files and root status without calling `Path.rglob`.
- Direct configured target paths still report `exists`.
- Registered model folder aliases still report `exists`.
- Invalid custom filenames/target paths stop with a clear `invalid` file status.
- Public package still contains no backend auto-download code.
