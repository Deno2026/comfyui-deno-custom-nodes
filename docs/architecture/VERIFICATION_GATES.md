# DENO Frontend Verification Gates

Status: Phase 1 Gate A PASS draft.

## Evidence Levels

| Level | What it proves | Examples |
|---|---|---|
| Build proof | Files parse and unit-level contracts hold | `node --check`, pytest, pure harness |
| Deployment proof | The runtime is serving the expected files | source/runtime hashes, served JS marker, `/object_info`, process identity |
| Source-contract proof | Installed ComfyUI/frontend source is identified for the API being used | dist-info, RECORD, source map with `sourcesContent`, tag/source hash comparison |
| Contract proof | Frontend/backend/workflow payloads agree | input names, widget order, `graphToPrompt().output[nodeId].inputs` |
| Behavior proof | A user path works in a real canvas | click, resize, wheel, modal, save/reload, console logs |
| Compatibility proof | Old workflows and declared runtimes still work | legacy fixtures, current saved fixture, Portable/Desktop/EZi surfaces |

`UNVERIFIED` is never a PASS. A result can be `PASS WITH NOTES` only when hard gates pass and clearly scoped soft gates remain unverified.

## Source-Contract Gate

Before a foundation module uses a ComfyUI frontend API, record:

- installed package version and installed asset/map path
- installed sourceContent hash when available
- official tag/commit/hash comparison for the installed version
- latest upstream tag/commit/hash comparison
- public/private/internal classification
- Phase 2 usable contract
- whether a compat adapter is required

If exact installed source cannot be secured for a private/internal API, keep that API `UNVERIFIED` and exclude the dependent module from Phase 2A.

## Capability Gates

### Dynamic Inputs

- 0 to 1 to max to 1 to 0.
- Mode A to mode B and back.
- Real link on active row.
- Real link on legacy or high row when supported.
- Current clipboard lifecycle: graph.add -> configure.
- Vintage/template clipboard lifecycle: configure -> graph.add.
- Save, reload, native draw/arrange.
- Queue Prompt exact key allowlist.
- No off-node socket, duplicate socket, stale live widget binding, or hidden hit region.

### Saved Workflow Migration

- Legacy fixture raw values.
- Current saved fixture raw values.
- Visible restored values row by row.
- Re-save round trip.
- Current clipboard: graph.add -> configure.
- Vintage/template clipboard: configure -> graph.add.
- Queue Prompt exact inputs.
- Missing optional resource while disabled/off/hidden.
- Enabled missing resource fails with a clear field name.

### Prompt Guide Phase 2A Acceptance

Gate A accepted the evidence collection. The current Prompt Guide fixture's canonical saved-shape failure is the deterministic failing acceptance test for Phase 2A.

Phase 2A must prove:

- first save writes the canonical 5 values
- reload restores the exact visible values
- second save writes the canonical 5 values
- current clipboard path passes: graph.add -> configure
- vintage/template clipboard path passes: configure -> graph.add
- Queue Prompt inputs are exact
- no new Prompt Guide action-phase console errors

Record `startupBaselineErrors` separately from `actionPhaseErrors`. Startup/userdata 404s or pre-initialization warnings observed before pilot actions are baseline evidence, not action failures.

### DOM Panel

- Mount once.
- Remove and recreate.
- Resize grow and shrink.
- CJK text and long text.
- Small viewport.
- Wheel inside scroll region.
- Wheel and middle-click on blank area.
- Listener, observer, timer teardown.

### localStorage

- Empty storage.
- Valid current storage.
- Legacy storage migration.
- Corrupt JSON recovery.
- Workflow active selection overrides storage.
- Cross-workflow contamination absent.

### Async Requests

- Latest request wins.
- Out-of-order response ignored.
- Abort or dispose.
- Node removed before response.
- Loading, error, success state.
- Backend-derived state not promoted to explicit user intent.

### Overlay

- Single instance per node/tool.
- Escape close.
- Outside-click close when intended.
- Viewport clamp.
- Focus restore or safe focus loss.
- Cleanup on node removal.

### Manual Sizing

- Initial auto-fit.
- User grows.
- User shrinks to content minimum.
- Content expands beyond manual baseline.
- Content contracts back to manual baseline.
- Save and reload.
- Vue Nodes path only when claimed.

## Runtime Policy

| Surface | Default |
|---|---|
| Installed official ComfyUI runtime | HARD for local behavior claims |
| Portable / Easy-Install user baseline | HARD for public UI fixes |
| Official Desktop | HARD when claimed or surface-sensitive |
| Easy-Install Desktop / EZi WebView | HARD when claimed or surface-sensitive |
| Vue Nodes | HARD only if touched or claimed |
| Third-party extension behavior | OUT OF SCOPE unless explicitly claimed |

## Active Queue Rule

If `/queue` is running or pending, do not restart or sync the active runtime. Read-only API checks are allowed. Runtime behavior proof must be marked `UNVERIFIED` or moved to a disposable runtime.
