# Risk And Gate Reference

## GREEN

Use for copy, small styling, local calculations, or existing helpers with no schema/lifecycle change.

Required gates usually include parse checks, focused tests, and self-review.

## YELLOW

Use for DOM UI, async requests, existing lifecycle/storage/migration helpers, or saved-workflow behavior without shape changes.

Required gates may include JS parse checks, relevant harnesses, fixture save/load tests, stale response tests, teardown tests, source/served identity, and runtime evidence.

## RED

Use for workflow schema/widget order changes, dynamic topology, direct host array mutation, private ComfyUI APIs, foundation API changes, migration/deletion, or cross-node state authority changes.

Before product edits, create `.codex/state/ARCHITECTURE_DECISION.md` with:

- official contract
- options
- selected invariant
- rejected approaches
- compatibility plan
- acceptance tests

## Two-Strike Rule

The same acceptance test failing after two separate code-change attempts blocks further product edits. A rerun without code changes does not increment the strike count.
