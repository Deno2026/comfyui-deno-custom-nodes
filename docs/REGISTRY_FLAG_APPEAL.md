# Comfy Registry — flagged version appeal (deno-custom-nodes)

**Status (verified via api.comfy.org):** pack `deno-custom-nodes` (publisher
`deno2026`) is **Active**, but versions **0.6.0 and 0.6.1 = NodeVersionStatusFlagged**
(automated security scan). Latest *exposed* version stays at 0.5.9. The flag is a
version-level hold by the Registry's automated scanner, not a pack ban.

This is a false-positive: every flagged behaviour is core to an AI-video toolkit,
user-initiated, and uses the same patterns as widely-allowed packs (e.g.
ComfyUI-VideoHelperSuite). Nothing in the code does eval/exec, `os.system`,
shell injection, silent network calls, pip/wheel installs, or telemetry.

## What the scanner flags + why each is safe

1. **ffmpeg via subprocess** — `deno_video_compare.py` (`subprocess.Popen`, ~L204),
   also used by the RTX preview path.
   - Encodes the A/B comparison clips. `shell=False`, fixed argument list, ffmpeg
     binary resolved via `imageio-ffmpeg` then PATH (no download). Identical
     pattern to ComfyUI-VideoHelperSuite (allowed on Registry).
2. **Temp WAV write + delete** — `deno_video_compare.py` (`wave` stdlib,
   `os.remove`, ~L144/L400). Audio mux scratch file in the temp dir, removed in
   `finally`. No arbitrary filesystem access.
3. **Remote image URL loader** — `deno_advanced_image_source_loader.py`
   (`urllib.request` + `socket.getaddrinfo`). Optional, user-pasted image URL
   only; includes a no-redirect handler / host resolution guard (SSRF hardening).
   Same category as other "load image from URL" nodes.
4. **LTX model download helper** — `deno_ltx_model_downloader.py` builds
   HuggingFace `resolve/main` URLs for an explicit, user-clicked model-download
   convenience node. Same pattern as common model-downloader nodes.
5. **Optional RTX VFX runtime** — `tools/install_rtx_vfx.bat` + `nvvfx` import.
   The BAT is run **manually by the user**, never auto-executed by a node. Nodes
   only import the runtime if already installed and otherwise show an install
   hint; no auto-download/exec.

No eval/exec/compile, no `os.system`, no shell strings, no pip/wheel install,
no telemetry/analytics, no obfuscation. License: Public Domain.

## Recovery — actions the PUBLISHER (deno2026) must do

Un-flagging is a Comfy-team review initiated by the publisher; it cannot be done
from the repo/code side (the flagged behaviours are intended features, not bugs
to remove).

1. Submit a false-positive appeal to the Comfy team with this document:
   - ComfyUI Discord → registry/security channel, **or**
   - the security contact on the Comfy forum / Registry support email.
   Include: pack `deno-custom-nodes`, versions `0.6.0`/`0.6.1`, "automated scan
   false positive", and the per-item justification above.
2. Ask them to review & whitelist 0.6.x (note parity with VideoHelperSuite and
   standard model-downloader nodes).
3. After acknowledgement, re-check `https://api.comfy.org/nodes/deno-custom-nodes/versions`
   until 0.6.x flips to `NodeVersionStatusActive` (delegate this polling to the
   light Codex model per 전역설정 §6).

### Optional, if a clean unflagged pack is wanted instead of appealing
Split the network/download/install-script nodes (advanced image URL loader, LTX
model downloader, RTX install BAT) into a separate pack, leaving a "clean" core
(Video Compare / resize / RTX-if-present) that the scanner is less likely to
flag. This is a product decision, not required to fix a false positive.
