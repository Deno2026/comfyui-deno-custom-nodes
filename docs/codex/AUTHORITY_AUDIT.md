# Codex Authority Audit

Generated for the autopilot harness bootstrap.

## Base

- Repository: `Deno2026/comfyui-deno-custom-nodes`
- Bootstrap branch: `Codex/autopilot-harness-bootstrap-20260626`
- Base commit: `b88b7447cf0388aad913fc929e4a20b47f1153ba`
- Included Phase 1 foundation commit: `e4ab65fe2051ed9a89462ca9b247e0ac9a1e0eaa`
- Included Phase 2A Prompt Guide foundation commit: `95548340a452ade31440053bb2df14a96b648eee`
- Ancestry check: both Phase 1 and Phase 2A are ancestors of the base commit.

## Worktree Audit

The bootstrap was created as a dedicated worktree from the clean base commit. Existing Director, release, runtime, and local WIP worktrees were not modified.

Observed relevant clean worktrees:

- `E:/DENO-Worktrees/comfyui-deno-frontend-foundation` at Phase 1.
- `E:/DENO-Worktrees/comfyui-deno-frontend-foundation-phase2a-prompt-guide` at Phase 2A.
- `E:/DENO-Worktrees/comfyui-deno-frontend-foundation-phase2b-model-downloader` at the base commit.

## Authority Classification

| Path | Class | Autoload | Notes |
|---|---|---:|---|
| `AGENTS.md` | AUTOLOAD | Local only | Compact durable repo rules created in the worktree but kept out of public Git tracking by the existing public-boundary test. |
| `.agents/skills/deno-comfyui-node/SKILL.md` | AUTOLOAD | On trigger | Conversational DENO ComfyUI operating skill. |
| `.agents/skills/deno-comfyui-node/references/*.md` | ON_DEMAND | No | Loaded only for matching capability tags. |
| `.codex/hooks.json` | AUTOLOAD | Hook trust | Repository hook wiring; requires one-time `/hooks` trust. |
| `.codex/hooks/*.py` | AUTOLOAD | Hook trust | Startup, prompt, compaction, and stop hook implementations. |
| `.codex/state/*` | GENERATED_STATE | No | Local volatile state; ignored by Git. |
| `tools/codex_task.py` | AUTOLOAD | Tool | Concise task state and two-strike ledger tool. |
| `tools/codex_gate.py` | AUTOLOAD | Tool | Deterministic gate and evidence/contract status tool. |
| `docs/codex/AUTHORITY_AUDIT.md` | ON_DEMAND | No | This audit. |
| `docs/codex/HARNESS.md` | ON_DEMAND | No | Owner-facing trust and operation notes. |
| `docs/architecture/FRONTEND_FOUNDATION_PLAN.md` | PRODUCT_CONTRACT | No | Phase and module boundary contract. |
| `docs/architecture/FRONTEND_PLAYBOOK.md` | PRODUCT_CONTRACT | No | Frontend work read path and lifecycle matrix. |
| `docs/architecture/STATE_AUTHORITY_RULES.md` | PRODUCT_CONTRACT | No | State ownership rules. |
| `docs/architecture/VERIFICATION_GATES.md` | PRODUCT_CONTRACT | No | Capability gate source. |
| `docs/architecture/REVIEW_PACKET_SPEC.md` | PRODUCT_CONTRACT | No | Reviewer artifact specification. |
| `docs/architecture/cards/*.yaml` | PRODUCT_CONTRACT | No | Node-specific architecture cards. |
| `.github/pull_request_template.md` | ON_DEMAND | No | Draft PR reporting surface. |
| `.github/workflows/ci.yml` | ON_DEMAND | CI | Existing test suite workflow. |
| `.github/workflows/codex_harness_gate.yml` | ON_DEMAND | CI | Harness gate workflow added by this bootstrap. |
| `tests/codex_harness/**` | ON_DEMAND | Test | Harness self-tests. |

## Missing Or Local-Only Authorities At Base

The clean base commit did not track root `AGENTS.md`, `SESSION_HANDOFF.md`, `docs/DENO_NODE_RETROSPECTIVE.md`, `docs/NODE_WORK_INDEX.md`, or `docs/nodes/**`. They remain local-only operating references in other worktrees and are not made public by this bootstrap.

The bootstrap generated a compact local root `AGENTS.md` in this worktree for Codex autoload, but the PR intentionally does not track it because the repository's existing public-surface test forbids root `AGENTS.md` in `git ls-files`.

## Archive Decision

No tracked oversized incident log or chronological handoff existed in the clean base worktree, so no history was moved. The new harness stores volatile current state in ignored `.codex/state/` and can generate a concise local `SESSION_HANDOFF.md` when needed.

## Instruction Budget Targets

- Root `AGENTS.md`: <= 8 KiB.
- Automatically loaded repo docs: <= 16 KiB combined.
- Generated `SESSION_HANDOFF.md`: <= 150 lines.
