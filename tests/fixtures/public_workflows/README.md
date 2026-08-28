# Public workflow regression fixtures

This folder contains verbatim public DENO workflows distributed through Google
Drive (`ComfyUI-20260610T064803Z-3-001.zip`, 2026-06-10) plus small saved-node
contract fixtures created when a public node schema needs a permanent regression
guard. `tests/test_public_workflow_migration.py` uses both kinds to verify that
saved workflows keep loading against current node code.

Do not edit the distributed legacy fixtures. They intentionally preserve their
original saved widget layouts (including the legacy `DenoLTXPromptGuide v0.3.8`
7-value layout). Small contract fixtures may be updated only alongside an
explicit migration. All fixtures are excluded from the published package via
`.comfyignore` (`tests/`).

| fixture | source name | notable DENO nodes |
|---|---|---|
| minimax_h3_acc_loader_v0794_three_output.json | v0.7.92-v0.7.94 saved-contract fixture | DenoMiniMaxH3AccLoader (`MODEL`, `SAMPLER`, `SIGMAS`; graph migration) |
| minimax_h3_acc_loader_v0795.json | v0.7.95 saved-contract fixture | DenoMiniMaxH3AccLoader (`MODEL` only) |
| minimax_h3_acc_loader_v0796.json | v0.7.96 saved-contract fixture | DenoMiniMaxH3AccLoader (`MODEL` only; serialized combo and named widget no-op) |
| bernini_workflow.json | Bernini workflow (Deno) (0604 fixed) | DenoBerniniPromptGuide (v0.7.28) |
| ltx23_8gb_vram.json | LTX2.3 8GB VRAM workflow | DenoLTXPromptGuide **(v0.3.8 legacy 7-value)**, Sequencer, MultiLora, PresetLoader |
| ltx23_8gb_vram_audio_to_video.json | LTX2.3 8GB VRAM + Audio to Video | same as above (MultiLora 61-value) |
| ltx23_audio_to_video.json | LTX2.3 Audio to Video | DenoLTXSequencer (legacy 8-value) |
| rtx_2pass_upscale.json | RTX 2pass upscale workflow | DenoRTXVFXVideoFinisher (v0.7.4) |
| z_image_turbo.json | Z image turbo | DenoResolutionSetup |
