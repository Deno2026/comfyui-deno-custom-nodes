# DENO Custom Nodes Working Notes

Before creating or changing DENO ComfyUI nodes, read:

- `docs/DENO_NODE_RETROSPECTIVE.md`

Use that retrospective as a mandatory pre-flight checklist. The goal is to avoid repeating the same UI, sync, persistence, LiteGraph, and deployment mistakes across new nodes.

After changing or updating local runtime node files and copying them into the Easy Install runtime, restart the user's SageAttention ComfyUI entrypoint unless the user explicitly says not to:

- `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\Start ComfyUI SageAttention.bat`

The intended handoff is that the user can refresh Chrome and test immediately. Do not restart for docs-only or test-only edits. If a ComfyUI queue is actively running, avoid killing it mid-run; wait for idle when practical or report the risk before forcing a restart. Before launching the SageAttention bat, stop the existing Easy Install ComfyUI `main.py` process(es) after confirming the queue is idle; do not stack multiple ComfyUI instances on the same machine.

Hard rule: never launch the SageAttention ComfyUI restart as a hidden/background process. Always run the `.bat` entrypoint in a visible console window so the user can see and control it. Do not use `Start-Process -WindowStyle Hidden` or any service-like hidden restart for this ComfyUI entrypoint.

Frontend interaction hard rule: any custom DOM widget, preview panel, or node-top overlay must preserve ComfyUI canvas navigation. Mouse wheel over a DENO node should still zoom/scroll the ComfyUI canvas unless the pointer is inside an intentional local scroll area such as a modal list. Middle-click / wheel-click drag over non-text controls should pan the ComfyUI canvas or be explicitly forwarded; do not let a DOM overlay silently swallow canvas wheel or middle-button navigation. Verify this in the real frontend before calling an interactive node done.

Preview sizing hard rule: custom preview nodes may auto-fit once for a first useful default, but they must not repeatedly overwrite a user-resized node size on later media loads or executions. Track manual resize state in node properties when needed, keep DOM media letterboxed/contained inside the chosen node box, and verify that saved workflows reopen without size jitter.
