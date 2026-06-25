---
name: deno-comfyui-node
description: Repository-local operating workflow for DENO ComfyUI custom node creation, modification, debugging, migration, frontend work, saved-workflow compatibility, runtime verification, release preparation, and Codex harness tasks. Use when the user naturally asks to change, fix, review, verify, release, or continue work in this repo.
---

# DENO ComfyUI Node Skill

Use this skill to turn ordinary user conversation into a concise internal task contract, then run the correct implementation and verification loop without asking the user to fill out a template.

## First Move

1. Read root `AGENTS.md`.
2. Run or inspect `tools/codex_task.py status`.
3. If the user materially changed the request, update the active task with `tools/codex_task.py update --prompt "<latest intent>"`.
4. Read only the reference files needed for the inferred capability tags.

## Internal Contract

Keep the formal contract in `.codex/state/ACTIVE_TASK.json` and `.codex/state/ACTIVE_TASK.md`. Include:

- goal
- user-visible behavior
- inferred non-goals
- assumptions
- affected product surface
- canonical state owners
- risk level
- capability tags
- official runtime/upstream baseline
- saved-workflow impact
- acceptance tests
- allowed implementation scope
- verification plan
- release status

Do not dump this structure to the user unless requested. Summarize only the practical plan and current blocker.

## Risk And Escalation

- GREEN: copy, small styling, local calculation, existing helper use with no schema or lifecycle change.
- YELLOW: DOM UI, async requests, existing lifecycle/storage/migration helper use, saved-workflow behavior without shape changes.
- RED: schema or widget order change, dynamic slot topology, raw `node.inputs`/`node.widgets`/`target_slot` surgery, private ComfyUI API use, foundation public API change, data migration/deletion, or cross-node state authority change.

For RED work, create `.codex/state/ARCHITECTURE_DECISION.md` before product implementation. Resolve the design from official ComfyUI sources when possible. Ask one concise question only when a real product decision remains.

If the same acceptance test fails after two separate code-change attempts, stop product edits, write `.codex/state/ESCALATION.md`, and ask for design/GPT Pro review only if architecture remains unresolved.

## Verification

Run `tools/codex_gate.py` after implementation. It selects checks from changed paths, risk, capability tags, and recorded evidence.

Never treat a single executed scenario as contract PASS. Record both:

- `evidence_status`
- `contract_status`

Use `UNVERIFIED` for missing runtime surfaces.

## References

- `references/task-contract.md`: contract fields and update rules.
- `references/risk-and-gates.md`: capability tags and gate expectations.
- `references/runtime-evidence.md`: runtime proof labels and surface policy.

## Scripts

- `scripts/run-gate.ps1`: Windows wrapper for the deterministic gate.
