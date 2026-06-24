# DENO Frontend Review Packet Specification

Status: Phase 1 Gate A PASS draft.

## Goal

Produce a compact ZIP that lets an independent reviewer challenge the state contract, saved workflow path, runtime identity, source-contract evidence, and risk matrix without reading a whole chat transcript.

## Command Shape

```text
python tools/build_node_review_packet.py --node <NODE_ID> --runtime <URL> --include-upstream
```

The command is a future target. This Phase 1 document defines the packet, not the tool.

## Required Structure

```text
00_MANIFEST.md
01_SCOPE.md
02_GIT_STATE/
03_SOURCE/
04_ARCHITECTURE_CARD.yaml
05_UPSTREAM_RUNTIME_BASELINE.md
06_FIXTURES/
07_TEST_RESULTS/
08_BROWSER_EVIDENCE/
09_CONSOLE_NETWORK/
10_RISK_MATRIX.md
11_OPEN_QUESTIONS.md
12_SOURCE_CONTRACT/
13_NEW_FILE_EVIDENCE/
```

## Manifest Fields

- Repo path or repo-relative identity.
- Branch and HEAD.
- Dirty files.
- Runtime URL and queue state when behavior proof is claimed.
- Backend version and frontend package version.
- Source/runtime/served hashes.
- Source-contract excerpt manifest and official raw-source hash match result.
- Fixture pass/fail status, including failed saved-shape and console/network evidence.
- `startupBaselineErrors` and `actionPhaseErrors` recorded separately.
- Included files and exclusions.
- Packet SHA256.

Public/tracked packet specifications must not require local absolute paths, current PID values, personal paths, or session records.

## Evidence Labels

Every claim must be one of:

- `VERIFIED`
- `INFERRED`
- `UNVERIFIED`

Do not merge evidence levels. A screenshot is behavior evidence, not serialization evidence. A unit test is build/contract evidence, not real-canvas behavior evidence.

## Git Evidence For New Files

If architecture docs are untracked, normal `git diff` may be empty. Review packets must include one of:

- non-empty `git diff --no-index /dev/null <new-file>` evidence for each new file
- a `NEW_FILES_MANIFEST` plus the full file originals

Keep failures and `UNVERIFIED` rows in the packet. Do not include only successful evidence.

## Public vs Local Location Policy

Tracked/public repo may contain:

- technical architecture rules
- node architecture cards
- verification gates
- review packet specification

Local/internal only:

- `SESSION_HANDOFF`
- runtime absolute paths and current PID values
- incident casebook/history
- personal operations notes

Public docs must not include personal information, local absolute paths, current PIDs, or session transcripts.

## Prohibited Packet Patterns

- Include only successful tests while dropping failures.
- Use whole JSON string search instead of inspecting `output[nodeId].inputs`.
- Use a fresh-node screenshot as saved workflow proof.
- Claim third-party extension compatibility when that extension was not loaded and exercised.
- Treat manually injected state as actual pointer/network lifecycle proof.
- Include unrelated repo history just because it is available.

## Reviewer Response Format

```text
PASS | PASS WITH NOTES | BLOCK

Blockers:
High:
Notes:
Verified:
Unverified:
Recommended next action:
```

## Minimum Risk Matrix

Each packet should challenge at least these cells:

- Fresh node.
- Current saved node.
- Legacy saved node.
- Current clipboard: graph.add -> configure.
- Vintage/template clipboard: configure -> graph.add.
- Queue Prompt.
- Runtime source/served identity.
- Installed frontend source-contract identity.
- Missing optional resources.
- Active missing resources.
- Resize grow/shrink.
- Wheel and middle-click.
- Console/network errors.
- Declared runtime matrix.

For console/network evidence, preserve startup/runtime baseline failures instead of deleting them. The hard gate is no new error attributable to the scoped pilot actions.
