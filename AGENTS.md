# DENO Custom Nodes Working Notes

Before creating or changing DENO ComfyUI nodes, read:

- `docs/DENO_NODE_RETROSPECTIVE.md`

Use that retrospective as a mandatory pre-flight checklist. The goal is to avoid repeating the same UI, sync, persistence, LiteGraph, and deployment mistakes across new nodes.

After changing or updating local runtime node files and copying them into the Easy Install runtime, restart the user's SageAttention ComfyUI entrypoint unless the user explicitly says not to:

- `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\Start ComfyUI SageAttention.bat`

The intended handoff is that the user can refresh Chrome and test immediately. Do not restart for docs-only or test-only edits. If a ComfyUI queue is actively running, avoid killing it mid-run; wait for idle when practical or report the risk before forcing a restart.

Hard rule: never launch the SageAttention ComfyUI restart as a hidden/background process. Always run the `.bat` entrypoint in a visible console window so the user can see and control it. Do not use `Start-Process -WindowStyle Hidden` or any service-like hidden restart for this ComfyUI entrypoint.
