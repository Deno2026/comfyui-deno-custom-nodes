# File and translation access

Deno Custom Nodes keeps file and network permissions on the ComfyUI host. A loaded workflow, node widget, or browser request cannot grant these permissions.

## Image sources and migration

From 0.7.121, image loaders read only ComfyUI's `input` directory. External folder/file access, image URL downloads and their custom preview endpoints have been removed. `DENO_EXTERNAL_IMAGE_ROOTS` is no longer read and cannot enable those features.

Use Upload, Paste or Upload Folder to import images, then select them with Input Folder or a relative Input Path. Advanced Image Source Loader also accepts a connected IMAGE batch. Symlinks and junctions that leave input are rejected. Existing absolute paths inside input still execute, but should be selected as relative input paths for thumbnails.

Saved source strings, enabled states, order, node IDs and connections remain intact. An active external source fails with migration guidance; a disabled source is retained without being read. Recursive input folders, resizing, batch output and mixed-size image lists remain available.

## Translation services

From 0.7.122, Ideogram translation uses only the built-in Google, MyMemory, and LibreTranslate HTTPS services (`translate.googleapis.com`, `api.mymemory.translated.net`, and `libretranslate.com`). `LibreTranslate Custom URL` and `DENO_TRANSLATION_ALLOWED_ORIGINS` have been retired.

Connections use validated public addresses directly, preserve TLS hostname verification, ignore environment proxies, and reject redirects rather than forwarding caption text to another address. Responses have a size limit and requests have a timeout.

Existing node IDs, sockets, and saved `libretranslate_url` widget values remain intact. Workflows that still have `LibreTranslate Custom URL` selected fail with instructions to choose `Google`, `MyMemory`, or `LibreTranslate` instead of silently sending text to a different provider. Unknown engine values also fail explicitly.

## Local LLM connections

The Local LLM Loader contacts Ollama at `127.0.0.1:11434` or LM Studio at `127.0.0.1:1234` on the ComfyUI host. If LM Studio requires authentication, configure its API key on that host. See the [Local LLM guide](../README.md#deno-local-llm-loader-and-deno-local-llm-reviewer) for setup and migration.

From 0.7.130, the node sends live previews only to the browser that submitted the execution. **Save Result in Files** is off by default. Enable it before running if you want the final answer embedded in a new PNG or workflow file.

The Easy Model Download Helper uses registered paths on the ComfyUI host. Its panel shows relative model destinations and saves the selected folder by ID.

## Reporting a problem

If Manager cannot update the pack, include the installed and requested DENO versions, ComfyUI and Manager versions, and the terminal error from the failed update. Registry review status and dependency-install errors are separate conditions. Do not include API keys or private workflow contents in a public report. See the [security reporting policy](https://github.com/Deno2026/comfyui-deno-custom-nodes/blob/main/SECURITY.md) for sensitive reports.
