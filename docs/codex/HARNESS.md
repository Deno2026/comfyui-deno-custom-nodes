# Codex Autopilot Harness

This harness lets the owner speak naturally while Codex maintains an internal task contract, deterministic gates, and a concise local state file.

The compact root `AGENTS.md` remains local-only in this repository. Public Git tracking carries the skill, hooks, tools, tests, and `docs/codex` guidance instead, because the existing release safety test forbids root agent instructions in the public Git surface.

## Owner Flow

Normal prompts can stay conversational:

```text
This node seems to lose values after saving. Please check it.
Continue.
Only match official ComfyUI behavior.
```

Codex updates `.codex/state/ACTIVE_TASK.json` and chooses the required checks internally.

## One-Time Hook Trust

Repository hooks live under `.codex/hooks.json` and `.codex/hooks/*.py`.

After reviewing this PR, trust the project hooks once through Codex `/hooks`. The hooks only read prompts, maintain local `.codex/state/`, snapshot checkpoints, and run the deterministic gate. They do not call paid APIs, push, publish, or release.

## Local State

Generated files under `.codex/state/` are ignored:

- `ACTIVE_TASK.json`
- `ACTIVE_TASK.md`
- `CHECKPOINT.md`
- `FAILURE_LEDGER.json`
- `ESCALATION.md`
- `GATE_RESULT.json`
- `GATE_RESULT.md`

These files are the resume authority for compaction and new sessions.

## Gate

Run:

```text
python tools/codex_gate.py --mode local
```

The gate records both `evidence_status` and `contract_status`. `UNVERIFIED` is not a pass.
