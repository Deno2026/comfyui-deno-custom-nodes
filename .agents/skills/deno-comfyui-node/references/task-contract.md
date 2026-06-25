# Task Contract Reference

The contract is internal state, not a user form.

## Required Fields

- `goal`: one sentence.
- `user_visible_behavior`: what the user should observe.
- `inferred_non_goals`: likely boundaries from the conversation and repo state.
- `assumptions`: documented assumptions when asking is unnecessary.
- `affected_product_surface`: node, docs, harness, release, or runtime surface.
- `canonical_state_owners`: workflow, node properties, localStorage, backend-derived, runtime-only, official geometry.
- `risk_level`: GREEN, YELLOW, or RED.
- `capability_tags`: examples include `saved_workflow`, `frontend_js`, `dom`, `async`, `storage`, `dynamic_slots`, `runtime_sensitive`, `release`, `harness`.
- `official_runtime_baseline`: installed/runtime or source-contract baseline used for the task.
- `saved_workflow_impact`: none, read-only, preserves shape, migrates shape, or breaking.
- `acceptance_tests`: stable IDs and human descriptions.
- `allowed_implementation_scope`: file/path families allowed for the current task.
- `verification_plan`: deterministic gates and runtime evidence.
- `release_status`: local only, draft PR, release candidate, or released.

## Update Rules

Update the active task when the user changes goal, behavior, risk, non-goals, runtime target, or release status. Do not create a new task for "continue" prompts unless the prior task is closed.
