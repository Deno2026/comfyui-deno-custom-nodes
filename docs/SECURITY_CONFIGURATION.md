# File and translation access

Deno Custom Nodes keeps file and network permissions on the ComfyUI host. A loaded workflow, node widget, or browser request cannot grant these permissions.

## Image sources and migration

From 0.7.121, image loaders read only ComfyUI's `input` directory. External folder/file access, image URL downloads and their custom preview endpoints have been removed. `DENO_EXTERNAL_IMAGE_ROOTS` is no longer read and cannot enable those features.

Use Upload, Paste or Upload Folder to import images, then select them with Input Folder or a relative Input Path. Advanced Image Source Loader also accepts a connected IMAGE batch. Symlinks and junctions that leave input are rejected. Existing absolute paths inside input still execute, but should be selected as relative input paths for thumbnails.

Saved source strings, enabled states, order, node IDs and connections remain intact. An active external source fails with migration guidance; a disabled source is retained without being read. Recursive input folders, resizing, batch output and mixed-size image lists remain available.

## Custom translation servers

Google, MyMemory, and the built-in LibreTranslate provider use their fixed service addresses. Selecting a translation engine sends the caption fields being translated to that service. Error Help reports are displayed locally and copied only when you choose to copy them; they are not automatically sent to ChatGPT or Gemini.

For **LibreTranslate Custom URL**, the host operator must approve the server's exact origin in `DENO_TRANSLATION_ALLOWED_ORIGINS`, then restart ComfyUI. An origin is the scheme, hostname, and port, without a path, query, credentials, or fragment. Separate multiple origins with commas or semicolons.

```powershell
$env:DENO_TRANSLATION_ALLOWED_ORIGINS = 'http://127.0.0.1:5000,https://translate.example.org'
```

The node's Custom URL may include the service path, such as `https://translate.example.org/api`. Its origin must match the host setting. Approve only servers you operate or trust with your caption text. A URL stored in a workflow cannot add an approved origin.

Loopback servers support HTTP or HTTPS. Remote servers require HTTPS and public addresses; approving an origin does not enable private LAN, link-local, or cloud metadata destinations. Connections use validated addresses directly, preserve TLS hostname verification, ignore environment proxies, and reject redirects rather than forwarding caption text to another address. Responses have a size limit and requests have a timeout.

The selected engine and Custom URL remain saved as before. Unknown engine values fail explicitly instead of silently sending text to a different provider.

## Local LLM connections

Local LLM Loader and Reviewer keep their existing localhost defaults and host-controlled LAN permissions. See [Local LLM usage](../README.md#deno-local-llm-loader). API keys stay in the host environment and are never stored in workflows. The translation setting above does not grant Local LLM access or change its authentication.

## Reporting a problem

If Manager cannot update the pack, include the installed and requested DENO versions, ComfyUI and Manager versions, and the terminal error from the failed update. Registry review status and dependency-install errors are separate conditions. Do not include API keys or private workflow contents in a public report. See the [security reporting policy](https://github.com/Deno2026/comfyui-deno-custom-nodes/blob/main/SECURITY.md) for sensitive reports.
