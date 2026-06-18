# DENO Node Work Index

This file is the routing map for node work. Keep it short.

Do not put per-node debugging history, provider quirks, UI experiments, or long verification transcripts in `AGENTS.md` or `SESSION_HANDOFF.md`. Put those details in the matching node document under `docs/nodes/`.

Node documents are Product Contracts, not optional reading. They preserve the user's intent across context compaction: purpose, core values, required behaviors, UI wording, rejected paths, and "do not break" rules.

## Read Order

For any new session in this repo:

1. Read `C:\Users\aions\.codex\AGENTS.md`.
2. Read repo `AGENTS.md`.
3. Read `SESSION_HANDOFF.md` for current dirty/WIP scope.
4. Match the requested work or intended touched files against the routing tables below.
5. If creating or editing a node, read `docs/DENO_NODE_RETROSPECTIVE.md`.
6. Then read only the matching node document below.

If the user changes scope mid-session, repeat steps 4-6 before editing new files.

## Routing Protocol

Use this before opening implementation files:

1. Identify the task kind: backend, frontend/UI, runtime sync, workflow migration, release metadata, docs-only, or paused/WIP feature.
2. Identify the likely touched files.
3. Read every document listed by the first matching row in the tables below.
4. If more than one row matches, read the union of the listed documents, but do not read archive handoffs unless a row explicitly says so.
5. Before code/UI edits, confirm the matching node document has a usable Product Contract. If it does not, add a concise one before the implementation grows beyond a tiny bugfix.
6. If the user clarifies behavior during the session, update the Product Contract before or alongside the code so the intent survives handoff/context compaction.
7. If the user changes direction mid-build, such as rejecting the current approach or changing the node's philosophy/implementation point, update the Product Contract first and then resume implementation from that new baseline.
8. If no row matches a new active node, add a short `docs/nodes/<node>.md` entry and route it here before implementation continues.
9. At the end, put new lessons in the right place:
   - cross-node mistake or checklist: `docs/DENO_NODE_RETROSPECTIVE.md`
   - visual/design pattern: `docs/DENO_NODE_VISUAL_IDENTITY.md`
   - node-specific contract or pitfall: that node's `docs/nodes/...` document
   - current dirty state only: `SESSION_HANDOFF.md`
   - repo-level routing/safety/release rule: `AGENTS.md`

## Task Trigger Table

| Trigger | Read |
|---|---|
| Any node code/UI edit | `docs/DENO_NODE_RETROSPECTIVE.md` + matching node document |
| Any custom frontend, layout, canvas, resize, popup, wheel, drag, tooltip, visual polish, screenshot, or button-label work | `docs/DENO_NODE_RETROSPECTIVE.md`, `docs/DENO_NODE_VISUAL_IDENTITY.md`, matching node document |
| Substantial custom DOM frontend or repeated geometry/layout regression | above + optional `docs/CLAUDE_NODE_FRONTEND_GUIDE.md` |
| Flagship/complex visual tool design or Ideogram-style UX pattern | above + optional `docs/IDEOGRAM_DIRECTOR_DESIGN_DNA.md` |
| Runtime sync, active install, restart, served JS, `/object_info`, or canvas verification | `AGENTS.md`, `docs/DENO_NODE_RETROSPECTIVE.md`, matching node document |
| Portable-vs-Desktop mismatch, Desktop-only bug, or cross-runtime UI verification | `docs/COMFYUI_RUNTIME_MATRIX.md`, `docs/DENO_NODE_RETROSPECTIVE.md`, matching node document |
| Public workflow, saved workflow compatibility, widget order, old node IDs, migration, fixture JSON | `docs/DENO_NODE_RETROSPECTIVE.md`, matching node document, `tests/fixtures/public_workflows/` if present |
| Release prep, Manager/Registry/package metadata, `node_list.json`, `pyproject.toml`, README/search terms/changelog/screenshots | `AGENTS.md`, `docs/DENO_NODE_RETROSPECTIVE.md`, release section in `SESSION_HANDOFF.md` |
| Packaging scanner, `.comfyignore`, Registry flagged text | `docs/DENO_NODE_RETROSPECTIVE.md` registry/package sections |
| Docs-only routing cleanup | `AGENTS.md`, this file, `SESSION_HANDOFF.md` if current status changes |

## Node-Specific Documents

- Local LLM Loader / Reviewer:
  - `docs/nodes/LOCAL_LLM_LOADER_REVIEWER.md`
  - Read when touching `deno_local_llm_refiner.py`, `web/js/deno_local_llm_refiner.js`, reviewer graph behavior, Ollama/LM Studio behavior, thinking, stop/unload, or VRAM policy.
- Ideogram Director:
  - `docs/nodes/ideogram-director/README.md`
  - Read when working on Ideogram 4 JSON/bbox/director UX.
- Translator:
  - `docs/nodes/CAPTION_TRANSLATE.md`
  - Paused. Read only if the user explicitly restarts the standalone Translator node, or when
    touching `deno_translate_engine.py` for Ideogram Director's built-in translation helper.
- Random Prompt Box:
  - `docs/nodes/RANDOM_PROMPT_BOX.md`
  - Read only if the user explicitly restarts that paused feature.
- LTX Prompt Guide:
  - `docs/nodes/LTX_PROMPT_GUIDE.md`
  - Read when touching `deno_ltx_prompt_guide.py`, `web/js/deno_ltx_prompt_guide.js`, or saved prompt-guide workflow migration.
- LTX Model Download Helper:
  - `docs/nodes/LTX_MODEL_DOWNLOADER.md`
  - Read when touching `deno_ltx_model_downloader.py`, `web/js/deno_ltx_model_downloader.js`, or manual model setup helper behavior.
- Multi LoRA Loaders:
  - `docs/nodes/MULTI_LORA_LOADERS.md`
  - Read when touching `deno_multi_lora_loader.py`, `deno_ltx_multi_lora_loader.py`, `web/js/deno_multi_lora.js`, `web/js/deno_ltx_multi_lora.js`, or saved missing-LoRA compatibility.

## File Trigger Table

| File or path | Matching document |
|---|---|
| `deno_local_llm_refiner.py` | `docs/nodes/LOCAL_LLM_LOADER_REVIEWER.md` |
| `web/js/deno_local_llm_refiner.js` | `docs/nodes/LOCAL_LLM_LOADER_REVIEWER.md` |
| `tests/test_local_llm_reviewer_graph_transform.py` | `docs/nodes/LOCAL_LLM_LOADER_REVIEWER.md` |
| `deno_ideogram_director.py` | `docs/nodes/ideogram-director/README.md` |
| `web/js/deno_ideogram_director.js` | `docs/nodes/ideogram-director/README.md` |
| `web/js/styles/` | `docs/nodes/ideogram-director/README.md` |
| `docs/nodes/ideogram-director/` | `docs/nodes/ideogram-director/README.md` |
| `deno_caption_translate.py` | `docs/nodes/CAPTION_TRANSLATE.md` only after explicit user restart |
| `deno_translate_engine.py` | `docs/nodes/CAPTION_TRANSLATE.md` |
| `docs/nodes/CAPTION_TRANSLATE.md` | `docs/nodes/CAPTION_TRANSLATE.md` |
| `deno_random_prompt_box.py` | `docs/nodes/RANDOM_PROMPT_BOX.md` only after explicit user restart |
| `web/js/deno_random_prompt_box.js` | `docs/nodes/RANDOM_PROMPT_BOX.md` only after explicit user restart |
| `deno_ltx_prompt_guide.py` | `docs/nodes/LTX_PROMPT_GUIDE.md` |
| `web/js/deno_ltx_prompt_guide.js` | `docs/nodes/LTX_PROMPT_GUIDE.md` |
| `deno_ltx_model_downloader.py` | `docs/nodes/LTX_MODEL_DOWNLOADER.md` |
| `web/js/deno_ltx_model_downloader.js` | `docs/nodes/LTX_MODEL_DOWNLOADER.md` |
| `deno_multi_lora_loader.py` | `docs/nodes/MULTI_LORA_LOADERS.md` |
| `deno_ltx_multi_lora_loader.py` | `docs/nodes/MULTI_LORA_LOADERS.md` |
| `web/js/deno_multi_lora.js` | `docs/nodes/MULTI_LORA_LOADERS.md` |
| `web/js/deno_ltx_multi_lora.js` | `docs/nodes/MULTI_LORA_LOADERS.md` |
| `node_list.json`, `pyproject.toml`, `README.md`, `docs/README.*.md`, `CHANGELOG.md` | release/metadata rows above |
| `.comfyignore` | packaging scanner row above |
| `tests/fixtures/public_workflows/`, `tests/test_public_workflow_migration.py` | public workflow migration row above |
| `SESSION_HANDOFF.md` | keep compact current state only; do not append a transcript |
| `AGENTS.md` | repo-level routing/safety/release rules only |

## Stable Released Nodes

Most other DENO nodes are stable and already released. For those, do not read old handoff history by default.

Use the common checklist plus the current source, tests, `/object_info`, and real canvas verification for the changed node. Open archive history only when debugging a regression that clearly depends on old behavior.

## Optional Deep Frontend References

Do not read these during normal startup. Use them only for substantial custom frontend work, repeated geometry/layout regressions, or a flagship node design pass.

- `docs/CLAUDE_NODE_FRONTEND_GUIDE.md`: long frontend layout audit and copy-ready LiteGraph patterns.
- `docs/IDEOGRAM_DIRECTOR_DESIGN_DNA.md`: Ideogram Director visual/interaction DNA and Verdant Pro reference.

## Where Information Belongs

- `AGENTS.md`: repo-level routing, safety, runtime/release rules.
- `SESSION_HANDOFF.md`: compact current state and links, not a work log.
- `docs/DENO_NODE_RETROSPECTIVE.md`: reusable mistakes and pre-flight checklist shared by all nodes.
- `docs/COMFYUI_RUNTIME_MATRIX.md`: Portable/Easy-Install/Desktop runtime discovery and dual-runtime verification gates.
- `docs/nodes/<node>.md`: Product Contract, current node contract, active WIP, node-specific pitfalls, verification matrix.
- `docs/handoff_archive/`: old history only. Do not read during normal startup.
- `tmp/` or `scratch/`: temporary code/artifacts only. Do not keep durable docs there.
