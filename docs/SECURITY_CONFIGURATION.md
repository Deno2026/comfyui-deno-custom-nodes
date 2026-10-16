# File and translation access

Deno Custom Nodes keeps file and network permissions on the ComfyUI host. A loaded workflow, node widget, or browser request cannot grant these permissions.

## Images outside the input folder

Images in ComfyUI's `input` folder work without additional configuration. To use an external image folder, set `DENO_EXTERNAL_IMAGE_ROOTS` in the environment that starts ComfyUI, then restart ComfyUI. Specify only the folders containing the images you intend to use.

PowerShell example, before starting ComfyUI from that same terminal:

```powershell
$env:DENO_EXTERNAL_IMAGE_ROOTS = 'D:\Media\References;D:\Media\Photos'
```

On Linux and macOS, separate folders with `:` instead of `;`:

```sh
export DENO_EXTERNAL_IMAGE_ROOTS='/home/user/media/references:/home/user/media/photos'
```

Use absolute local folder paths. Drive roots, network shares, device paths, and alternate data streams are not supported. Permissions apply to the resolved path, so a symlink or junction cannot expose files outside the permitted folders. External browsing also stays inside the folder selected in the browser.

This applies to external paths in Advanced Image Source Loader and older absolute image paths saved in Multi Image Loader or MiniMax H3 reference workflows. Saved paths, enabled states, order, and connections stay intact. An enabled source outside the permitted folders fails with an error; upload the image into `input` or approve its containing folder on the host. Disabled sources do not require access.

External folder browsing and external file thumbnails require a localhost connection and reject a mismatched browser origin. Thumbnails return decoded image pixels as a PNG with metadata removed; they do not expose the original file bytes. Image loading for generation still uses the original permitted image.

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

Local LLM Loader and Reviewer keep their existing localhost defaults and host-controlled LAN permissions. See [Local LLM usage](../README.md#deno-local-llm-loader). API keys stay in the host environment and are never stored in workflows. The translation and image-folder settings above do not grant Local LLM access or change its authentication.

## Reporting a problem

If Manager cannot update the pack, include the installed and requested DENO versions, ComfyUI and Manager versions, and the terminal error from the failed update. Registry review status and dependency-install errors are separate conditions. Do not include API keys or private workflow contents in a public report. See the [security reporting policy](https://github.com/Deno2026/comfyui-deno-custom-nodes/blob/main/SECURITY.md) for sensitive reports.
