import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.join(repoRoot, "web/js/deno_floating_tools.js");

function makeHarness(options = {}) {
  let now = 0;
  const queueSnapshots = options.queueSnapshots || null;
  let registeredExtension = null;

  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }

    static now() {
      return now;
    }
  }

  const context = {
    console,
    Date: FakeDate,
    URL,
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    document: {
      getElementById() {
        return null;
      },
      createElement() {
        return {
          append() {},
          appendChild() {},
          addEventListener() {},
          classList: { add() {}, remove() {}, toggle() {} },
          dataset: {},
          setAttribute() {},
          style: {},
        };
      },
      head: { appendChild() {} },
      body: { appendChild() {} },
      addEventListener() {},
      removeEventListener() {},
      querySelector() {
        return null;
      },
    },
    window: {
      location: { origin: "http://127.0.0.1:8188" },
    },
    navigator: {},
    app: {
      registerExtension(extension) {
        registeredExtension = extension;
      },
    },
    api: {
      addEventListener() {},
      async fetchApi(path) {
        if (!queueSnapshots) {
          throw new Error("fetchApi should not be called by SOS state harness");
        }
        assert.equal(path, "/queue");
        const snapshot = queueSnapshots.shift();
        assert.ok(snapshot, "expected a queued /queue snapshot");
        return {
          ok: true,
          async json() {
            return snapshot;
          },
        };
      },
    },
  };
  context.window = { ...context.window, ...context };
  context.globalThis = context;

  let source = fs.readFileSync(scriptPath, "utf8");
  source = source.replace(/^import .*;\r?\n/gm, "");
  source = source.replace(/import\.meta\.url/g, '"file:///deno_floating_tools.js"');
  source += `
globalThis.__sosHooks = {
  rememberExecutionError,
  clearExecutionErrorState,
  noteSosRunStartedAfterError,
  noteSosQueueStateAfterError,
  handleSosStatusEvent,
  state: () => ({
    hasError: Boolean(lastExecutionError),
    sosRunClearCandidate,
    sosQueueWasBusyAfterError,
    sosErrorStickyUntil,
    sosLastErrorAt,
    lastExecutionError,
  }),
};
`;
  vm.runInNewContext(source, context, { filename: scriptPath });
  assert.equal(registeredExtension?.name, "Deno.FloatingTools");

  return {
    hooks: context.__sosHooks,
    setNow(value) {
      now = value;
    },
  };
}

async function flushMicrotasks() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

{
  const harness = makeHarness();
  harness.setNow(5_000);
  const largeDetail = {
    prompt_id: "large-failed",
    node_id: 42,
    node_type: "HugeNode",
    exception_type: "HugeError",
    exception_message: "boom",
    traceback: Array.from({ length: 120 }, (_, index) => `trace ${index}`),
    prompt: { huge: "x".repeat(1_000_000) },
  };
  largeDetail.self = largeDetail;

  harness.hooks.rememberExecutionError(largeDetail);

  const state = harness.hooks.state();
  assert.equal(state.hasError, true);
  assert.equal(state.lastExecutionError.prompt_id, "large-failed");
  assert.equal(state.lastExecutionError.node_id, "42");
  assert.equal(state.lastExecutionError.prompt, undefined);
  assert.equal(state.lastExecutionError.self, undefined);
  assert.equal(state.lastExecutionError.traceback.length, 40);
  assert.equal(state.lastExecutionError.traceback[0], "trace 80");
  assert.equal(state.lastExecutionError.traceback[39], "trace 119");
}

{
  const harness = makeHarness();
  harness.setNow(10_000);
  harness.hooks.rememberExecutionError({ prompt_id: "failed-1", exception_message: "boom" });

  harness.hooks.handleSosStatusEvent({ exec_info: { queue_remaining: 0 } });

  assert.equal(
    harness.hooks.state().hasError,
    true,
    "idle status immediately after an error must not erase the report state",
  );
}

{
  const harness = makeHarness();
  harness.setNow(20_000);
  harness.hooks.rememberExecutionError({ prompt_id: "failed-2", exception_message: "boom" });

  harness.setNow(29_000);
  harness.hooks.noteSosRunStartedAfterError();
  assert.equal(
    harness.hooks.state().hasError,
    true,
    "execution_start keeps the error visible while the retry is running",
  );
  harness.hooks.handleSosStatusEvent({ exec_info: { queue_remaining: 0 } });
  assert.equal(
    harness.hooks.state().hasError,
    true,
    "an unconfirmed status-idle event must not clear the icon while the retry may still be running",
  );

  harness.hooks.noteSosQueueStateAfterError(false, { confirmedIdle: true });
  assert.equal(
    harness.hooks.state().hasError,
    false,
    "a retry that reaches confirmed queue idle clears the error icon even if execution_success was missed",
  );
}

{
  const harness = makeHarness();
  harness.setNow(30_000);
  harness.hooks.rememberExecutionError({ prompt_id: "failed-3", exception_message: "boom" });

  harness.setNow(30_500);
  harness.hooks.handleSosStatusEvent({ exec_info: { queue_remaining: 1 } });
  assert.equal(
    harness.hooks.state().sosQueueWasBusyAfterError,
    false,
    "the failed run's own immediate busy/idle tail must not become a retry candidate",
  );

  harness.setNow(31_200);
  harness.hooks.handleSosStatusEvent({ status: { exec_info: { queue_remaining: 1 } } });
  assert.equal(
    harness.hooks.state().sosQueueWasBusyAfterError,
    true,
    "a later queue-busy signal is treated as a new retry candidate",
  );
  harness.hooks.handleSosStatusEvent({ status: { exec_info: { queue_remaining: 0 } } });
  assert.equal(
    harness.hooks.state().hasError,
    true,
    "queue-busy fallback still waits for confirmed /queue idle before clearing",
  );
  harness.hooks.noteSosQueueStateAfterError(false, { confirmedIdle: true });
  assert.equal(harness.hooks.state().hasError, false);
}

{
  const harness = makeHarness({
    queueSnapshots: [
      { queue_running: [[1, "retry-running"]], queue_pending: [] },
      { queue_running: [], queue_pending: [] },
    ],
  });
  harness.setNow(35_000);
  harness.hooks.rememberExecutionError({ prompt_id: "failed-queue-confirm", exception_message: "boom" });
  harness.hooks.noteSosRunStartedAfterError();

  harness.hooks.handleSosStatusEvent({ exec_info: { queue_remaining: 0 } });
  await flushMicrotasks();
  assert.equal(
    harness.hooks.state().hasError,
    true,
    "status-idle confirmation must preserve the icon while /queue still has a running item",
  );

  harness.hooks.handleSosStatusEvent({ exec_info: { queue_remaining: 0 } });
  await flushMicrotasks();
  assert.equal(
    harness.hooks.state().hasError,
    false,
    "status-idle confirmation clears after /queue reports no running or pending items",
  );
}

{
  const harness = makeHarness();
  harness.setNow(40_000);
  harness.hooks.rememberExecutionError({ prompt_id: "failed-4", exception_message: "boom" });

  harness.hooks.noteSosRunStartedAfterError();
  harness.hooks.clearExecutionErrorState({ force: true });

  assert.equal(
    harness.hooks.state().hasError,
    false,
    "execution_success still force-clears the error icon directly",
  );
}
