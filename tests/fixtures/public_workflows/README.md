# Public workflow regression fixtures

Verbatim copies of public DENO ComfyUI workflows that were distributed via
Google Drive (`ComfyUI-20260610T064803Z-3-001.zip`, 2026-06-10). They are used
by `tests/test_public_workflow_migration.py` to guard that saved public
workflows keep loading against the current node code.

Do not edit these files. They intentionally preserve the original saved widget
layouts (including the legacy `DenoLTXPromptGuide v0.3.8` 7-value layout) so the
migration logic stays covered. They are excluded from the published package via
`.comfyignore` (`tests/`).

| fixture | source name | notable DENO nodes |
|---|---|---|
| bernini_workflow.json | Bernini workflow (Deno) (0604 fixed) | DenoBerniniPromptGuide (v0.7.28) |
| ltx23_8gb_vram.json | LTX2.3 8GB VRAM workflow | DenoLTXPromptGuide **(v0.3.8 legacy 7-value)**, Sequencer, MultiLora, PresetLoader |
| ltx23_8gb_vram_audio_to_video.json | LTX2.3 8GB VRAM + Audio to Video | same as above (MultiLora 61-value) |
| ltx23_audio_to_video.json | LTX2.3 Audio to Video | DenoLTXSequencer (legacy 8-value) |
| rtx_2pass_upscale.json | RTX 2pass upscale workflow | DenoRTXVFXVideoFinisher (v0.7.4) |
| z_image_turbo.json | Z image turbo | DenoResolutionSetup |
