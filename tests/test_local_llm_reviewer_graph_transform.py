import shutil
import subprocess
import textwrap
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_reviewer_graph_transform_submit_modes(tmp_path):
    node = shutil.which("node")
    if not node:
        pytest.skip("node executable is required for the frontend graph-transform harness")

    script_path = tmp_path / "reviewer_graph_transform_harness.cjs"
    script_path.write_text(
        textwrap.dedent(
            f"""
            const fs = require("fs");
            const vm = require("vm");

            const sourcePath = {str(REPO_ROOT / "web" / "js" / "deno_local_llm_refiner.js")!r};
            const source = fs
                .readFileSync(sourcePath, "utf8")
                .replace(/^import\\s+\\{{[^}}]+\\}}\\s+from\\s+["'][^"']+["'];\\r?\\n/gm, "");

            const graph = {{
                links: {{}},
                _nodes: [],
                getNodeById(id) {{
                    return this._nodes.find((node) => Number(node.id) === Number(id));
                }},
                setDirtyCanvas() {{}},
            }};
            const animationFrames = new Map();
            let nextAnimationFrame = 1;
            function flushAnimationFrames() {{
                const callbacks = Array.from(animationFrames.values());
                animationFrames.clear();
                for (const callback of callbacks) {{
                    callback();
                }}
            }}
            const context = {{
                console,
                process,
                Date,
                Math,
                JSON,
                Number,
                String,
                Boolean,
                Array,
                Object,
                Set,
                Map,
                URL,
                URLSearchParams,
                app: {{
                    graph,
                    registerExtension(extension) {{
                        context.capturedExtension = extension;
                    }},
                }},
                api: {{
                    addEventListener() {{}},
                    apiURL(path) {{ return path; }},
                }},
                window: {{
                    addEventListener() {{}},
                    setTimeout() {{ return 0; }},
                    requestAnimationFrame(callback) {{
                        const id = nextAnimationFrame++;
                        animationFrames.set(id, callback);
                        return id;
                    }},
                    cancelAnimationFrame(id) {{
                        animationFrames.delete(id);
                    }},
                }},
                queueMicrotask(callback) {{
                    callback();
                }},
                document: {{
                    addEventListener() {{}},
                    querySelectorAll() {{ return []; }},
                    querySelector() {{ return null; }},
                }},
                LiteGraph: {{
                    NODE_WIDGET_HEIGHT: 24,
                    WIDGET_BGCOLOR: "#222",
                    WIDGET_OUTLINE_COLOR: "#555",
                }},
                Image: class {{
                    constructor() {{
                        this.naturalWidth = 0;
                        this.naturalHeight = 0;
                    }}
                    set src(value) {{
                        this._src = value;
                    }}
                }},
                capturedExtension: null,
                capturedApi: null,
            }};
            context.globalThis = context;
            context.__DENO_LOCAL_LLM_REVIEWER_TEST_HOOK__ = (api) => {{
                context.capturedApi = api;
            }};

            function assert(condition, message) {{
                if (!condition) {{
                    throw new Error(message);
                }}
            }}

            function keys(object) {{
                return Object.keys(object).sort().join(",");
            }}

            vm.createContext(context);
            vm.runInContext(source, context, {{ filename: sourcePath }});

            const api = context.capturedApi;
            assert(api, "reviewer graph test API was not exposed");
            assert(context.capturedExtension, "Local LLM extension must register for configure/onSerialize hooks");
            const uiGraphA = {{ name: "workflow-a" }};
            const uiGraphB = {{ name: "workflow-b" }};
            context.app.canvas = {{ graph: uiGraphA }};
            const uiOwnerA = {{ id: 12, type: "DenoLocalLLMRefiner", graph: uiGraphA }};
            const uiOwnerB = {{ id: 12, type: "DenoLocalLLMRefiner", graph: uiGraphB }};
            const overlayA = {{ isConnected: true, removeCalls: 0, remove() {{ this.isConnected = false; this.removeCalls += 1; }} }};
            const overlayB = {{ isConnected: true, removeCalls: 0, remove() {{ this.isConnected = false; this.removeCalls += 1; }} }};
            api.ownLocalLLMBodyOverlay(uiOwnerA, overlayA);
            api.ownLocalLLMBodyOverlay(uiOwnerB, overlayB);
            api.closeLocalLLMOwnedUi(uiOwnerA);
            assert(overlayA.removeCalls === 1, "Removing one Loader must close its owned body overlay");
            assert(overlayB.removeCalls === 0, "Same-id Loader in another workflow must keep its own body overlay");

            const tabOverlay = {{ isConnected: true, removeCalls: 0, remove() {{ this.isConnected = false; this.removeCalls += 1; }} }};
            api.ownLocalLLMBodyOverlay(uiOwnerA, tabOverlay);
            context.app.canvas.graph = uiGraphB;
            flushAnimationFrames();
            assert(tabOverlay.removeCalls === 1, "A body overlay must close when its owning workflow tab is no longer active");
            assert(overlayB.removeCalls === 0, "Tab cleanup must not close the active same-id node's overlay");

            let previousOnRemovedCalls = 0;
            const cleanupOwner = {{
                id: 13,
                type: "DenoLocalLLMRefiner",
                graph: uiGraphB,
                onRemoved() {{ previousOnRemovedCalls += 1; }},
            }};
            const cleanupOverlay = {{ isConnected: true, removeCalls: 0, remove() {{ this.isConnected = false; this.removeCalls += 1; }} }};
            api.installLocalLLMNodeCleanup(cleanupOwner);
            api.ownLocalLLMBodyOverlay(cleanupOwner, cleanupOverlay);
            cleanupOwner.onRemoved();
            assert(cleanupOverlay.removeCalls === 1, "Node removal must close only that node's owned UI");
            assert(previousOnRemovedCalls === 1, "Node cleanup must preserve the existing onRemoved callback exactly once");
            api.closeLocalLLMOwnedUi(uiOwnerB);

            const ttlNode = {{ id: 91, type: "DenoLocalLLMRefiner" }};
            const ttlGraph = {{ getNodeById(id) {{ return Number(id) === 91 ? ttlNode : null; }} }};
            api.rememberLocalLLMPromptGraph("ttl-prompt", ttlGraph);
            assert(
                api.localLLMNodeForExecutionDetail({{ prompt_id: "ttl-prompt", node_id: 91 }}) === ttlNode,
                "A live prompt mapping must resolve its exact Loader"
            );
            api.pruneLocalLLMPromptGraphs(Date.now() + 25 * 60 * 60 * 1000);
            assert(
                api.localLLMNodeForExecutionDetail({{ prompt_id: "ttl-prompt", node_id: 91 }}) === null,
                "A stale prompt mapping must expire instead of leaking into a later workflow"
            );
            const normalizedReviewerValues = api.normalizeReviewerSerializedValues(["Pass", true, "REVIEWER STATE", null, null]);
            assert(normalizedReviewerValues.length === 3, "Reviewer serialization must keep only the three backend widgets");
            assert(normalizedReviewerValues[0] === "Pass", "Reviewer serialization must preserve Pass mode");
            assert(normalizedReviewerValues[1] === true, "Reviewer serialization must preserve approve_once");
            assert(normalizedReviewerValues[2] === "REVIEWER STATE", "Reviewer serialization must preserve reviewer_state");
            const reviewerInfo = {{ widgets_values: ["Review", false, "STATE", null, null] }};
            api.normalizeReviewerWidgetValues(reviewerInfo);
            assert(reviewerInfo.widgets_values.length === 3, "Reviewer widget-value normalizer must strip generated custom widget nulls");
            const gateNodeType = {{
                prototype: {{
                    configure(info) {{
                        this.__baseConfigureValues = [...info.widgets_values];
                        return "configured";
                    }},
                    onSerialize(info) {{
                        info.widgets_values = ["Review", false, "SERIALIZED STATE", null, null];
                        return "serialized";
                    }},
                }},
            }};
            context.capturedExtension.beforeRegisterNodeDef(gateNodeType, {{ name: "DenoAIReviewGate" }});
            const configuredGate = {{}};
            const configuredInfo = {{ widgets_values: ["Pass", false, "CONFIGURED STATE", null, null] }};
            assert(gateNodeType.prototype.configure.call(configuredGate, configuredInfo) === "configured", "Reviewer configure wrapper must preserve the original return");
            assert(configuredInfo.widgets_values.length === 3, "Reviewer configure wrapper must compact saved widget values before restore");
            assert(configuredGate.__baseConfigureValues.length === 3, "Reviewer base configure must only receive canonical widget values");
            const serializedGateInfo = {{ widgets_values: [] }};
            assert(gateNodeType.prototype.onSerialize.call({{}}, serializedGateInfo) === "serialized", "Reviewer serialize wrapper must preserve the original return");
            assert(serializedGateInfo.widgets_values.length === 3, "Reviewer serialize wrapper must strip generated widget nulls");
            assert(serializedGateInfo.widgets_values[2] === "SERIALIZED STATE", "Reviewer serialize wrapper must keep reviewer_state");
            assert(api.previewTextDialogTitle({{ error: "bad" }}, "result") === "Error", "Result popup title must switch to Error when node state has an error");
            assert(api.previewTextDialogBody({{ answer: "final answer" }}, "result") === "final answer", "Result popup must read live answer text from node state");
            assert(api.previewTextDialogBody({{ thinking: "live thinking" }}, "thinking") === "live thinking", "Thinking popup must read live thinking text from node state");
            const stateNode = {{ id: 44, properties: {{}}, setDirtyCanvas() {{}} }};
            const savedState = api.setLocalLLMNodeState(stateNode, {{
                status: "done",
                provider: "vLLM",
                model: "Qwen3-VL-2B-Thinking-FP8",
                answer: "saved answer",
                thinking: "saved thinking",
                index: 2,
                total: 3,
                updatedAt: 1234,
            }});
            assert(savedState.answer === "saved answer", "Loader state setter must return the saved answer");
            assert(stateNode.properties.deno_local_llm_state.answer === "saved answer", "Loader state must persist into node.properties");
            const restoredStateNode = {{ id: 45, properties: {{ deno_local_llm_state: stateNode.properties.deno_local_llm_state }} }};
            const restoredState = api.restoreLocalLLMStateFromProperties(restoredStateNode);
            assert(restoredState.answer === "saved answer", "Loader state must restore from workflow properties");
            assert(restoredStateNode.__denoLocalLLMState.thinking === "saved thinking", "Restored Loader state must hydrate the visible node state");
            const lazyRestoredStateNode = {{ id: 145, properties: {{ deno_local_llm_state: stateNode.properties.deno_local_llm_state }} }};
            assert(api.getLocalLLMNodeState(lazyRestoredStateNode).thinking === "saved thinking", "Loader preview state must lazily restore Thinking from workflow properties");
            const progressStateNode = {{ id: 146, properties: {{}}, setDirtyCanvas() {{}} }};
            api.setLocalLLMNodeState(progressStateNode, {{
                status: "done",
                provider: "vLLM",
                model: "Qwen3-VL-2B-Thinking-FP8",
                answer: "kept answer",
                thinking: "kept thinking",
            }});
            api.setLocalLLMNodeState(progressStateNode, api.localLLMProgressStatePatch(progressStateNode, {{
                status: "done",
                provider: "vLLM",
                model: "Qwen3-VL-2B-Thinking-FP8",
                answer: "kept answer",
            }}));
            assert(api.getLocalLLMNodeState(progressStateNode).thinking === "kept thinking", "Progress updates without Thinking must not wipe the saved Thinking preview");
            api.setLocalLLMNodeState(progressStateNode, api.localLLMProgressStatePatch(progressStateNode, {{
                status: "running",
                provider: "vLLM",
                model: "Qwen3-VL-2B-Thinking-FP8",
                index: 0,
                total: 1,
                answer: "",
                thinking: "",
            }}));
            assert(api.getLocalLLMNodeState(progressStateNode).thinking === "", "A real new run start must clear old Thinking text");
            const liveDialog = {{
                overlay: {{ isConnected: true }},
                kind: "result",
                fallbackTitle: "Result",
                fallbackText: "Waiting for run output.",
                titleElement: {{ textContent: "" }},
                textBox: {{ value: "old", scrollHeight: 1000, scrollTop: 900, clientHeight: 100 }},
            }};
            assert(api.setPreviewTextDialogContent(liveDialog, {{ answer: "new streamed answer" }}), "Connected preview dialog must accept live updates");
            assert(liveDialog.titleElement.textContent === "Result", "Live result dialog title must stay Result for normal answers");
            assert(liveDialog.textBox.value === "new streamed answer", "Live result dialog body must update without reopening");
            assert(liveDialog.textBox.scrollTop === 1000, "Live dialog should auto-follow only when already near the bottom");
            liveDialog.textBox.scrollTop = 120;
            api.setPreviewTextDialogContent(liveDialog, {{ answer: "next answer" }});
            assert(liveDialog.textBox.value === "next answer", "Live dialog should continue updating while open");
            assert(liveDialog.textBox.scrollTop === 120, "Live dialog must not force-scroll when the user is reading older text");
            liveDialog.overlay.isConnected = false;
            assert(!api.setPreviewTextDialogContent(liveDialog, {{ answer: "ignored" }}), "Disconnected preview dialog must be treated as closed");
            const savedLoaderValues = [
                "LM Studio",
                "gemma3:1b",
                "codex/missing-saved-lm-studio-model",
                "Refresh Models",
                "Stop LLM",
                "Unload LLM",
                "http://127.0.0.1:8000/v1",
                "",
                "",
                false,
                1,
                "fixed",
                "Unload after run",
                5,
                "Auto: unload only before first LLM call",
                "Prompt text",
                "System Prompt",
                "",
            ];
            const normalizedLoaderValues = api.normalizeLocalLLMLoaderSerializedValues(savedLoaderValues);
            assert(normalizedLoaderValues.length === 13, "Loader configure migration must keep only real serialized widgets");
            assert(normalizedLoaderValues[0] === "LM Studio", "Loader configure migration must preserve saved provider");
            assert(normalizedLoaderValues[2] === "codex/missing-saved-lm-studio-model", "Loader configure migration must preserve saved LM Studio model");
            assert(normalizedLoaderValues[3] === "http://127.0.0.1:8000/v1", "Loader configure migration must remove generated button values before legacy fields");
            assert(normalizedLoaderValues[12] === "Prompt text", "Loader configure migration must preserve the prompt widget value");
            const normalizedInfo = {{ widgets_values: [...savedLoaderValues] }};
            api.normalizeLocalLLMLoaderWidgetValues(normalizedInfo);
            assert(normalizedInfo.widgets_values[2] === "codex/missing-saved-lm-studio-model", "Loader configure migration wrapper must update info.widgets_values in place");
            const loaderNodeType = function () {{}};
            loaderNodeType.prototype.configure = function (info) {{
                this.properties = info.properties || {{}};
                return "configured";
            }};
            loaderNodeType.prototype.onSerialize = function (info) {{
                info.widgets_values = [
                    ...info.widgets_values,
                    "Refresh Models",
                    "Stop LLM",
                    "Unload LLM",
                ];
                return "serialized";
            }};
            const loaderNodeData = {{
                name: "DenoLocalLLMRefiner",
                input: {{
                    required: {{
                        provider: [["Ollama", "LM Studio", "llama.cpp", "vLLM", "Custom"], {{ default: "Ollama" }}],
                        ollama_model: [["gemma3:1b"], {{ default: "gemma3:1b" }}],
                        lm_studio_model: [["google/gemma-4-e4b"], {{ default: "google/gemma-4-e4b" }}],
                        custom_server_url: ["STRING", {{ default: "http://127.0.0.1:8000/v1" }}],
                        custom_model: ["STRING", {{ default: "" }}],
                        system_prompt: ["STRING", {{ default: "" }}],
                        thinking: ["BOOLEAN", {{ default: false }}],
                        seed: ["INT", {{ default: 1 }}],
                        seed_mode: [["fixed", "randomize", "increment", "decrement"], {{ default: "fixed" }}],
                        model_memory: [["Unload after run", "Keep loaded"], {{ default: "Unload after run" }}],
                        keep_minutes: ["INT", {{ default: 5 }}],
                        comfy_vram_policy: [[
                            "Auto: unload only before first LLM call",
                            "Always unload before each LLM call",
                            "Never unload before LLM call",
                        ], {{ default: "Auto: unload only before first LLM call" }}],
                        prompt: ["STRING", {{ default: "" }}],
                    }},
                }},
            }};
            context.capturedExtension.beforeRegisterNodeDef(loaderNodeType, loaderNodeData);
            const configuredLoader = new loaderNodeType();
            configuredLoader.id = 46;
            configuredLoader.type = "DenoLocalLLMRefiner";
            configuredLoader.widgets = [];
            const configureInfo = {{
                widgets_values: [...savedLoaderValues],
                properties: {{
                    deno_local_llm_state: {{
                        status: "done",
                        provider: "vLLM",
                        model: "Qwen3-VL-2B-Thinking-FP8",
                        answer: "workflow answer",
                        thinking: "workflow thinking",
                        index: 1,
                        total: 1,
                        updatedAt: 2222,
                    }},
                }},
            }};
            assert(configuredLoader.configure(configureInfo) === "configured", "Loader configure wrapper must preserve the original configure result");
            assert(configuredLoader.__denoLocalLLMState.answer === "workflow answer", "Loader configure must restore saved result state from properties");
            const sameIdOtherWorkflowNode = {{ id: 46, type: "DenoLocalLLMRefiner", properties: {{}} }};
            assert(
                api.getLocalLLMNodeState(sameIdOtherWorkflowNode).answer !== "workflow answer",
                "Loader state must be scoped to the actual node object, not a node id reused by another workflow"
            );
            const serializedInfo = {{ widgets_values: [...savedLoaderValues], properties: {{}} }};
            assert(configuredLoader.onSerialize(serializedInfo) === "serialized", "Loader serialize wrapper must preserve the original serialize result");
            assert(serializedInfo.widgets_values.length === 13, "Loader serialize must remove generated buttons and keep canonical widget count");
            assert(serializedInfo.properties.deno_local_llm_state.answer === "workflow answer", "Loader serialize must include saved result state in properties");
            const modelChoices = api.modelChoiceValuesWithSavedValue(
                [{{ id: "google/gemma-4-e4b" }}, {{ id: "google/gemma-4-12b" }}],
                "codex/missing-saved-lm-studio-model"
            );
            assert(modelChoices[0] === "Missing saved model: codex/missing-saved-lm-studio-model", "Model refresh must mark saved missing models instead of showing them as installed");
            assert(api.hasUsableSavedModelValue(modelChoices[0]), "Missing saved model display must still preserve the original model id");
            const comboNode = {{
                widgets: [
                    {{ name: "provider", options: {{ values: ["Ollama", "LM Studio"] }} }},
                    {{ name: "ollama_model", options: {{ values: ["gemma3:1b"] }} }},
                    {{ name: "lm_studio_model", options: {{ values: ["google/gemma-4-e4b"] }} }},
                ],
            }};
            api.preserveLocalLLMLoaderSavedComboOptions(comboNode, normalizedLoaderValues);
            assert(
                comboNode.widgets[2].options.values[0] === "codex/missing-saved-lm-studio-model",
                "Loader configure must add saved missing LM Studio model before combo restore can replace it"
            );
            api.applyLocalLLMLoaderSavedWidgetValues(comboNode, normalizedLoaderValues);
            assert(
                comboNode.widgets[2].value === "Missing saved model: codex/missing-saved-lm-studio-model",
                "After configure, the visible combo value must clearly say the saved model is missing on this PC"
            );
            const savedExistingComboNode = {{
                widgets: [
                    {{ name: "lm_studio_model", options: {{ values: ["google/gemma-4-e4b", "google/gemma-4-12b"] }} }},
                ],
            }};
            api.preserveWidgetOption(savedExistingComboNode.widgets[0], "google/gemma-4-12b");
            assert(
                savedExistingComboNode.widgets[0].options.values.join(",") === "google/gemma-4-12b,google/gemma-4-e4b",
                "Loader configure must move an existing saved LM Studio model before the default model"
            );
            const currentSavedLoaderValuesWithPromptAfterSystemPromptButton = [
                "LM Studio",
                "gemma3:1b",
                "google/gemma-4-12b",
                "Refresh Models",
                "Stop LLM",
                "Unload LLM",
                "http://127.0.0.1:8000/v1",
                "",
                "Return only the final prompt.",
                false,
                123,
                "fixed",
                "Unload after run",
                5,
                "Auto: unload only before first LLM call",
                "",
                "System Prompt",
                "a cat drinking water",
            ];
            const normalizedPromptAfterButton = api.normalizeLocalLLMLoaderSerializedValues(currentSavedLoaderValuesWithPromptAfterSystemPromptButton);
            assert(normalizedPromptAfterButton.length === 13, "Loader current saved values with prompt after System Prompt button must normalize to 13 widgets");
            assert(normalizedPromptAfterButton[0] === "LM Studio", "Loader prompt-after-button values must preserve provider");
            assert(normalizedPromptAfterButton[2] === "google/gemma-4-12b", "Loader prompt-after-button values must preserve selected LM Studio model");
            assert(normalizedPromptAfterButton[5] === "Return only the final prompt.", "Loader prompt-after-button values must preserve system prompt");
            assert(normalizedPromptAfterButton[12] === "a cat drinking water", "Loader prompt-after-button values must restore the Prompt textarea value");
            const currentSavedLoaderValuesWithOldButtons = [
                "LM Studio",
                "qwen3.6:35b-a3b",
                "google/gemma-4-12b",
                "Refresh Models",
                "Stop LLM",
                "Unload LLM",
                "http://127.0.0.1:8000/v1",
                "",
                "fixed",
                false,
                2,
                "fixed",
                "Unload after run",
                1,
                "Auto: unload only before first LLM call",
                "Prompt text",
                "System Prompt",
                "System Prompt text",
            ];
            const normalizedCurrentSaved = api.normalizeLocalLLMLoaderSerializedValues(currentSavedLoaderValuesWithOldButtons);
            assert(normalizedCurrentSaved.length === 13, "Loader current saved values with old buttons must normalize to the current 13 widgets");
            assert(normalizedCurrentSaved[0] === "LM Studio", "Loader current saved values must preserve provider");
            assert(normalizedCurrentSaved[2] === "google/gemma-4-12b", "Loader current saved values must preserve selected LM Studio model");
            assert(normalizedCurrentSaved[5] === "System Prompt text", "Loader current saved values must move the real system prompt into the current slot");
            assert(normalizedCurrentSaved[6] === false, "Loader current saved values must keep thinking in the current slot");
            assert(normalizedCurrentSaved[7] === 2, "Loader current saved values must keep seed in the current slot");
            assert(normalizedCurrentSaved[12] === "Prompt text", "Loader current saved values must keep the prompt in the current slot");
            const currentSavedLoaderValuesWithThinkingOn = [...currentSavedLoaderValuesWithOldButtons];
            currentSavedLoaderValuesWithThinkingOn[9] = true;
            const normalizedThinkingOn = api.normalizeLocalLLMLoaderSerializedValues(currentSavedLoaderValuesWithThinkingOn);
            assert(normalizedThinkingOn[6] === true, "Loader saved Thinking On value must stay on during current-value normalization");
            const currentOllamaSavedValuesWithButtonsBeforeHiddenLmRows = [
                "Ollama",
                "gemma4:31b-it-qat",
                "Refresh Models",
                "Stop LLM",
                "Unload LLM",
                "google/gemma-4-12b-qat",
                "http://127.0.0.1:8000/v1",
                "",
                "Return only the final prompt.",
                true,
                1,
                "fixed",
                "Unload after run",
                1,
                "Auto: unload only before first LLM call",
                "",
                "System Prompt",
                "",
            ];
            const normalizedOllamaButtonsBeforeHiddenRows = api.normalizeLocalLLMLoaderSerializedValues(currentOllamaSavedValuesWithButtonsBeforeHiddenLmRows);
            assert(normalizedOllamaButtonsBeforeHiddenRows.length === 13, "Loader Ollama saved values with buttons before hidden rows must normalize to 13 widgets");
            assert(normalizedOllamaButtonsBeforeHiddenRows[0] === "Ollama", "Loader Ollama button-before-hidden-row values must preserve provider");
            assert(normalizedOllamaButtonsBeforeHiddenRows[1] === "gemma4:31b-it-qat", "Loader Ollama button-before-hidden-row values must preserve selected Ollama model");
            assert(normalizedOllamaButtonsBeforeHiddenRows[2] === "google/gemma-4-12b-qat", "Loader Ollama button-before-hidden-row values must preserve hidden LM Studio model without shifting it into buttons");
            assert(normalizedOllamaButtonsBeforeHiddenRows[5] === "Return only the final prompt.", "Loader Ollama button-before-hidden-row values must preserve system prompt");
            assert(normalizedOllamaButtonsBeforeHiddenRows[6] === true, "Loader Ollama saved Thinking On must restore to the visible Thinking toggle after F5");
            assert(normalizedOllamaButtonsBeforeHiddenRows[7] === 1, "Loader Ollama button-before-hidden-row values must keep seed in the current slot");
            assert(normalizedOllamaButtonsBeforeHiddenRows[8] === "fixed", "Loader Ollama button-before-hidden-row values must keep seed mode in the current slot");
            const currentVllmSavedValuesWithButtonsAfterCustomModel = [
                "vLLM",
                "gemma3:1b",
                "google/gemma-4-12b",
                "http://127.0.0.1:8000/v1",
                "Qwen3-VL-2B-Thinking-FP8",
                "Refresh Models",
                "Stop LLM",
                "Unload LLM",
                "Return only the final prompt.",
                true,
                42,
                "fixed",
                "Unload after run",
                5,
                "Auto: unload only before first LLM call",
                "Prompt text",
                "Refresh Models",
                "Stop LLM",
                "Unload LLM",
            ];
            const normalizedVllmButtonsAfterCustomModel = api.normalizeLocalLLMLoaderSerializedValues(currentVllmSavedValuesWithButtonsAfterCustomModel);
            assert(normalizedVllmButtonsAfterCustomModel.length === 13, "Loader vLLM saved values with generated buttons after custom_model must normalize to 13 widgets");
            assert(normalizedVllmButtonsAfterCustomModel[0] === "vLLM", "Loader vLLM button-after-custom-model values must preserve provider");
            assert(normalizedVllmButtonsAfterCustomModel[3] === "http://127.0.0.1:8000/v1", "Loader vLLM button-after-custom-model values must preserve server URL");
            assert(normalizedVllmButtonsAfterCustomModel[4] === "Qwen3-VL-2B-Thinking-FP8", "Loader vLLM button-after-custom-model values must preserve custom model");
            assert(normalizedVllmButtonsAfterCustomModel[5] === "Return only the final prompt.", "Loader vLLM button-after-custom-model values must preserve system prompt");
            assert(normalizedVllmButtonsAfterCustomModel[6] === true, "Loader vLLM button-after-custom-model values must preserve Thinking");
            assert(normalizedVllmButtonsAfterCustomModel[7] === 42, "Loader vLLM button-after-custom-model values must preserve seed");
            assert(normalizedVllmButtonsAfterCustomModel[12] === "Prompt text", "Loader vLLM button-after-custom-model values must preserve prompt");
            const clonedClipboardShiftNode = {{
                widgets: [
                    {{ name: "provider", value: "vLLM" }},
                    {{ name: "ollama_model", value: "gemma4:31b-it-qat" }},
                    {{ name: "deno_local_llm_refresh_models", value: "google/gemma-4-12b-qat" }},
                    {{ name: "deno_local_llm_stop_llm", value: "http://127.0.0.1:8000/v1" }},
                    {{ name: "deno_local_llm_unload_llm", value: "Qwen3-VL-2B-Thinking-FP8" }},
                    {{ name: "lm_studio_model", value: "google/gemma-4-12b-qat" }},
                    {{ name: "custom_server_url", value: "http://127.0.0.1:8000/v1" }},
                    {{ name: "custom_model", value: "Qwen3-VL-2B-Thinking-FP8" }},
                    {{ name: "system_prompt", value: "SYSTEM PROMPT SHOULD SURVIVE COPY" }},
                    {{ name: "thinking", value: true }},
                    {{ name: "seed", value: 9876 }},
                    {{ name: "seed_mode", value: "fixed" }},
                    {{ name: "model_memory", value: "Unload after run" }},
                    {{ name: "keep_minutes", value: 5 }},
                    {{ name: "comfy_vram_policy", value: "Auto: unload only before first LLM call" }},
                    {{ name: "deno_local_llm_preview", value: "" }},
                    {{ name: "deno_local_llm_system_prompt_button", value: "System Prompt" }},
                    {{ name: "prompt", value: "Prompt should survive copy" }},
                ],
            }};
            const cloneShiftedValues = [
                "vLLM",
                "gemma4:31b-it-qat",
                "google/gemma-4-12b-qat",
                "http://127.0.0.1:8000/v1",
                "Qwen3-VL-2B-Thinking-FP8",
                "google/gemma-4-12b-qat",
                "http://127.0.0.1:8000/v1",
                "Qwen3-VL-2B-Thinking-FP8",
                "SYSTEM PROMPT SHOULD SURVIVE COPY",
                true,
                9876,
                "fixed",
                "Unload after run",
            ];
            const normalizedCloneClipboard = api.localLLMLoaderSerializedValuesFromWidgets(clonedClipboardShiftNode, cloneShiftedValues);
            assert(normalizedCloneClipboard.length === 13, "Loader clone clipboard serialization must stay at 13 canonical widgets");
            assert(normalizedCloneClipboard[4] === "Qwen3-VL-2B-Thinking-FP8", "Loader clone clipboard serialization must keep custom model in the model slot");
            assert(normalizedCloneClipboard[5] === "SYSTEM PROMPT SHOULD SURVIVE COPY", "Loader clone clipboard serialization must not shift LM Studio model into system prompt");
            assert(normalizedCloneClipboard[6] === true, "Loader clone clipboard serialization must keep Thinking in the Thinking slot");
            assert(normalizedCloneClipboard[7] === 9876, "Loader clone clipboard serialization must keep seed in the seed slot");
            assert(normalizedCloneClipboard[10] === 5, "Loader clone clipboard serialization must recover keep minutes after clone shifting");
            assert(normalizedCloneClipboard[12] === "Prompt should survive copy", "Loader clone clipboard serialization must recover prompt after clone shifting");
            api.resetLocalLLMGeneratedWidgetValues(clonedClipboardShiftNode);
            assert(api.getWidget(clonedClipboardShiftNode, "deno_local_llm_refresh_models").value === "Refresh Models", "Loader reload cleanup must reset Refresh Models button value after ComfyUI shifts saved model text into it");
            assert(api.getWidget(clonedClipboardShiftNode, "deno_local_llm_stop_llm").value === "Stop LLM", "Loader reload cleanup must reset Stop LLM button value after ComfyUI shifts saved URL into it");
            assert(api.getWidget(clonedClipboardShiftNode, "deno_local_llm_unload_llm").value === "Unload LLM", "Loader reload cleanup must reset Unload LLM button value after ComfyUI shifts saved model text into it");
            assert(api.getWidget(clonedClipboardShiftNode, "deno_local_llm_system_prompt_button").value === "System Prompt", "Loader reload cleanup must reset System Prompt button value after ComfyUI restore");
            function makeCopiedLoaderNode(id) {{
                const node = {{
                    id,
                    type: "DenoLocalLLMRefiner",
                    title: "DenoLocalLLMRefiner",
                    graph,
                    widgets: [
                        {{ name: "provider", label: "Provider", type: "combo", value: "Ollama", options: {{ values: ["Ollama", "LM Studio", "llama.cpp", "vLLM", "Custom"] }} }},
                        {{ name: "ollama_model", label: "Ollama Model", type: "combo", value: "gemma3:1b", options: {{ values: ["gemma3:1b"] }} }},
                        {{ name: "lm_studio_model", label: "LM Studio Model", type: "combo", value: "google/gemma-4-e4b", options: {{ values: ["google/gemma-4-e4b"] }} }},
                        {{ name: "custom_server_url", label: "Server URL", type: "text", value: "http://127.0.0.1:8000/v1" }},
                        {{ name: "thinking", label: "Thinking", type: "toggle", value: false }},
                        {{ name: "seed", label: "Seed", type: "number", value: 1 }},
                        {{ name: "seed_mode", label: "Seed Mode", type: "combo", value: "fixed", options: {{ values: ["fixed", "randomize", "increment", "decrement"] }} }},
                        {{ name: "model_memory", label: "Model After Run", type: "combo", value: "Unload after run", options: {{ values: ["Unload after run", "Keep loaded"] }} }},
                        {{ name: "keep_minutes", label: "Keep Minutes", type: "number", value: 5 }},
                        {{ name: "comfy_vram_policy", label: "Unload ComfyUI Models Setting", type: "combo", value: "Auto: unload only before first LLM call", options: {{ values: ["Auto: unload only before first LLM call", "Always unload before each LLM call", "Never unload before LLM call"] }} }},
                        {{ name: "prompt", label: "Prompt", type: "text", value: "" }},
                    ],
                    inputs: [],
                    outputs: [{{ name: "result", type: "STRING", links: [] }}],
                    properties: {{
                        deno_local_llm_state: {{
                            status: "done",
                            provider: "vLLM",
                            model: "Qwen3-VL-2B-Thinking-FP8",
                            answer: "copied answer",
                            thinking: "copied thinking",
                        }},
                    }},
                    size: [560, 320],
                    addWidget(type, label, value, callback, options = {{}}) {{
                        const widget = {{ type, label, name: label, value, callback, options: {{ ...options }} }};
                        this.widgets.push(widget);
                        return widget;
                    }},
                    addCustomWidget(widget) {{
                        this.widgets.push(widget);
                        return widget;
                    }},
                    setSize(size) {{
                        this.size = size;
                    }},
                    computeSize() {{
                        return [560, 340];
                    }},
                    setDirtyCanvas() {{}},
                }};
                return node;
            }}
            const copiedLoaderNode = makeCopiedLoaderNode(148);
            copiedLoaderNode.__denoLocalLLMSavedWidgetValues = [...normalizedVllmButtonsAfterCustomModel];
            api.setupNode(copiedLoaderNode);
            assert(api.getWidget(copiedLoaderNode, "provider").value === "vLLM", "Loader copy/paste setup must restore the saved provider");
            assert(api.getWidget(copiedLoaderNode, "custom_model").value === "Qwen3-VL-2B-Thinking-FP8", "Loader copy/paste setup must restore a late-created custom model widget");
            assert(api.getWidget(copiedLoaderNode, "system_prompt").value === "Return only the final prompt.", "Loader copy/paste setup must restore a late-created system prompt widget");
            assert(api.getWidget(copiedLoaderNode, "thinking").value === true, "Loader copy/paste setup must restore Thinking On");
            assert(api.getWidget(copiedLoaderNode, "seed").value === 42, "Loader copy/paste setup must restore the saved seed");
            assert(api.getWidget(copiedLoaderNode, "prompt").value === "Prompt text", "Loader copy/paste setup must restore the saved prompt text");
            assert(api.getLocalLLMNodeState(copiedLoaderNode).thinking === "copied thinking", "Loader copy/paste setup must restore saved Thinking preview state");
            const staleFirstRunNode = {{
                widgets: [
                    {{ name: "provider", value: "Ollama", options: {{ values: ["Ollama", "LM Studio"] }} }},
                    {{ name: "ollama_model", value: "gemma3:1b", options: {{ values: ["gemma3:1b", "qwen3.6:35b-a3b", "gemma4:31b-it-qat"] }} }},
                    {{ name: "lm_studio_model", value: "google/gemma-4-e4b", options: {{ values: ["google/gemma-4-e4b", "google/gemma-4-12b"] }} }},
                    {{ name: "custom_server_url", value: "http://127.0.0.1:8000/v1" }},
                    {{ name: "custom_model", value: "" }},
                    {{ name: "system_prompt", value: "fixed" }},
                    {{ name: "thinking", value: true }},
                    {{ name: "seed", value: 1 }},
                    {{ name: "seed_mode", value: "fixed" }},
                    {{ name: "model_memory", value: "Unload after run" }},
                    {{ name: "keep_minutes", value: 1 }},
                    {{ name: "comfy_vram_policy", value: "Auto: unload only before first LLM call" }},
                    {{ name: "prompt", value: "" }},
                ],
            }};
            api.applyLocalLLMLoaderSavedWidgetValues(staleFirstRunNode, normalizedCurrentSaved);
            assert(staleFirstRunNode.widgets[0].value === "LM Studio", "Loader first-run repair must restore saved provider before queue submit");
            assert(staleFirstRunNode.widgets[2].value === "google/gemma-4-12b", "Loader first-run repair must restore saved LM Studio model before queue submit");
            assert(staleFirstRunNode.widgets[2].options.values[0] === "google/gemma-4-12b", "Loader first-run repair must keep saved LM Studio model first in the combo");
            assert(staleFirstRunNode.widgets[5].value === "System Prompt text", "Loader first-run repair must clear shifted seed-mode text from system prompt");
            assert(staleFirstRunNode.widgets[7].value === 2, "Loader first-run repair must restore saved seed before queue submit");
            assert(staleFirstRunNode.widgets[12].value === "Prompt text", "Loader first-run repair must restore saved prompt textarea before queue submit");
            staleFirstRunNode.widgets[6].value = false;
            api.applyLocalLLMLoaderSavedWidgetValues(staleFirstRunNode, normalizedThinkingOn);
            assert(staleFirstRunNode.widgets[6].value === true, "Loader first-run repair must restore saved Thinking On before queue submit");
            staleFirstRunNode.widgets[6].value = false;
            api.applyLocalLLMLoaderSavedWidgetValues(staleFirstRunNode, normalizedOllamaButtonsBeforeHiddenRows);
            assert(staleFirstRunNode.widgets[0].value === "Ollama", "Loader first-run repair must restore saved Ollama provider from button-before-hidden-row values");
            assert(staleFirstRunNode.widgets[1].value === "gemma4:31b-it-qat", "Loader first-run repair must restore saved Ollama model from button-before-hidden-row values");
            assert(staleFirstRunNode.widgets[6].value === true, "Loader first-run repair must restore saved Ollama Thinking On after F5");
            const seedModeNode = {{
                id: 77,
                type: "DenoLocalLLMRefiner",
                graph,
                widgets: [
                    {{ name: "seed", value: 10 }},
                    {{ name: "seed_mode", value: "increment" }},
                ],
            }};
            graph._nodes = [seedModeNode];
            const seedOutput = {{
                "77": {{
                    class_type: "DenoLocalLLMRefiner",
                    inputs: {{ seed: 10, seed_mode: "increment" }},
                }},
            }};
            assert(api.applyLocalLLMAfterGenerateSeedModes(seedOutput) === true, "Loader Seed Mode increment must update the visible seed after queue submit");
            assert(seedModeNode.widgets[0].value === 11, "Loader Seed Mode increment must add one for the next queued run");
            seedModeNode.widgets[1].value = "decrement";
            assert(api.applyLocalLLMAfterGenerateSeedModes(seedOutput) === true, "Loader Seed Mode decrement must update the visible seed after queue submit");
            assert(seedModeNode.widgets[0].value === 10, "Loader Seed Mode decrement must subtract one for the next queued run");
            seedModeNode.widgets[1].value = "fixed";
            assert(api.applyLocalLLMAfterGenerateSeedModes(seedOutput) === false, "Loader Seed Mode fixed must not mutate the visible seed");
            assert(seedModeNode.widgets[0].value === 10, "Loader Seed Mode fixed must preserve the seed");
            seedModeNode.widgets[1].value = "randomize";
            assert(api.applyLocalLLMAfterGenerateSeedModes(seedOutput) === true, "Loader Seed Mode randomize must update the visible seed after queue submit");
            assert(seedModeNode.widgets[0].value >= 0 && seedModeNode.widgets[0].value <= 0xFFFFFFFF, "Loader Seed Mode randomize must stay within the backend seed range");
            graph._nodes = [];
            assert(
                api.localLLMExecutionErrorMessage({{
                    node_id: 2,
                    exception_message: "The number of tokens to keep from the initial prompt is greater than the context length (n_keep: 6667>= n_ctx: 4096).",
                }}).includes("Context window is too small"),
                "Loader execution errors must turn LM Studio context failures into a readable node message"
            );
            assert(
                api.isLocalLLMOwnExecutionError({{
                    node_id: 2,
                    node_type: "DenoLocalLLMRefiner",
                    exception_message: "LM Studio server returned HTTP 500",
                }}) === true,
                "Loader must keep its own provider execution errors"
            );
            assert(
                api.isLocalLLMOwnExecutionError({{
                    node_id: 999,
                    node_type: "DenoIdeogramDirector",
                    exception_message: "The incoming prompt is not valid JSON.",
                }}) === false,
                "Loader must ignore Ideogram Director execution errors"
            );
            assert(
                api.isLocalLLMOwnExecutionError({{
                    node_id: 999,
                    exception_message: "Incoming Prompt needs review on the Ideogram Director node.",
                }}) === false,
                "Loader must ignore downstream incoming-prompt errors even if ComfyUI omits node_type"
            );
            assert(
                api.reviewerControlTooltip("review").includes("pass or block"),
                "Review button tooltip must explain the gate decision"
            );
            assert(
                api.reviewerControlTooltip("pass").includes("Bypass review"),
                "Pass button tooltip must explain that it bypasses the review"
            );
            assert(
                api.reviewerControlTooltip("approve").includes("current reviewed result"),
                "Approve Once tooltip must explain the one-result approval"
            );
            assert(
                api.reviewerControlTooltip("regenerate").includes("upstream path"),
                "Regenerate tooltip must explain that it reruns upstream"
            );
            assert(
                api.reviewerControlTooltip("retry").includes("rerun up to 3 times"),
                "Retry tooltip must explain the auto-rerun limit"
            );
            assert(
                api.reviewerControlTooltip("seed").includes("seed changes"),
                "Seed tooltip must explain the retry seed target"
            );
            assert(
                api.reviewerWidgetDrawWidth({{ size: [420, 220] }}, 980) === 420,
                "Reviewer widgets must draw inside the actual node width after approve/preview refresh"
            );
            assert(
                api.reviewerWidgetLayoutWidth({{ size: [420, 220] }}, 980) === 420,
                "Reviewer widget layout must prefer the real node width over a stale computed width"
            );
            assert(
                api.reviewerRefreshSize({{ size: [420, 220] }}, [980, 246])[0] === 420,
                "Reviewer refresh must not expand node width from stale computed widget width"
            );
            const previewMeasureContext = {{
                measureText(value) {{
                    return {{ width: String(value || "").length * 6 }};
                }},
            }};
            const longPreviewText = "A mystical forest where bioluminescent plants glow in soft neon hues, a majestic white stag with crystalline antlers.";
            const wrappedPreview = api.splitPreviewLinesForWidth(previewMeasureContext, longPreviewText, api.previewTextWidth(520, false));
            assert(
                wrappedPreview[0].includes("bioluminescent plants glow"),
                "Loader preview text must wrap by measured pixel width instead of clipping to a half-width character count"
            );
            assert(
                wrappedPreview[0].length > 45,
                "Wide Loader preview panels must use most of the available text width"
            );
            const legacyPromptOutput = {{
                "2": {{ class_type: "DenoLocalLLMRefiner", inputs: {{ user_prompt: ["1", 0] }} }},
            }};
            api.migrateLocalLLMPromptInputNames(legacyPromptOutput);
            assert(
                legacyPromptOutput["2"].inputs.prompt[0] === "1" && !("user_prompt" in legacyPromptOutput["2"].inputs),
                "Legacy user_prompt links must migrate to the canonical prompt input"
            );
            const shiftedPromptWidget = {{ value: "Auto: unload only before first LLM call" }};
            const repairedShiftedPrompt = api.repairPromptWidgetValue(shiftedPromptWidget);
            assert(repairedShiftedPrompt === true && shiftedPromptWidget.value === "", "Shifted UI option values must be cleared from Prompt");
            const realPromptWidget = {{ value: "A calm forest with soft morning light" }};
            const repairedRealPrompt = api.repairPromptWidgetValue(realPromptWidget);
            assert(repairedRealPrompt === false && realPromptWidget.value.includes("forest"), "Real prompt text must be preserved");
            const urlPromptWidget = {{ value: "https://example.com/reference.png use this composition and lighting" }};
            const repairedUrlPrompt = api.repairPromptWidgetValue(urlPromptWidget);
            assert(
                repairedUrlPrompt === false && urlPromptWidget.value.startsWith("https://example.com/reference.png"),
                "A real prompt that starts with a URL must never be erased as shifted legacy data"
            );
            assert(
                api.normalizeServerUrlValue("127.0.0.1:8080/v1") === "http://127.0.0.1:8080/v1",
                "Scheme-less local server addresses must be normalized instead of silently replaced"
            );
            assert(api.normalizeServerUrlValue("127.0.0.1:99999/v1") === "", "Out-of-range server ports must be rejected");
            assert(api.isShiftedCustomModelValue("model:1234") === false, "A colon-bearing saved model id must not be misclassified as a server URL");
            let originalBeforeQueuedCalls = 0;
            let originalAfterQueuedCalls = 0;
            const queueLifecycleNode = {{
                widgets: [
                    {{ name: "provider", value: "Custom" }},
                    {{
                        name: "custom_server_url",
                        value: "127.0.0.1:8080/v1",
                        beforeQueued() {{ originalBeforeQueuedCalls += 1; }},
                    }},
                    {{
                        name: "seed",
                        value: 40,
                        afterQueued() {{ originalAfterQueuedCalls += 1; }},
                    }},
                    {{ name: "seed_mode", value: "increment" }},
                ],
                setDirtyCanvas() {{}},
            }};
            api.installLocalLLMQueueCallbacks(queueLifecycleNode);
            queueLifecycleNode.widgets[1].beforeQueued();
            assert(originalBeforeQueuedCalls === 1, "Server URL wrapper must preserve the original beforeQueued callback");
            assert(queueLifecycleNode.widgets[1].value === "http://127.0.0.1:8080/v1", "Queue preflight must normalize a scheme-less server URL in place");
            assert(queueLifecycleNode.widgets[2].value === 40, "Seed must not change before a queue succeeds");
            queueLifecycleNode.widgets[2].afterQueued();
            assert(originalAfterQueuedCalls === 1, "Seed wrapper must preserve the original afterQueued callback");
            assert(queueLifecycleNode.widgets[2].value === 41, "Increment seed mode must advance exactly once after a successful queue");
            api.installLocalLLMQueueCallbacks(queueLifecycleNode);
            queueLifecycleNode.widgets[2].afterQueued({{ isPartialExecution: true }});
            assert(originalAfterQueuedCalls === 2, "Repeated setup must not stack the original afterQueued callback");
            assert(queueLifecycleNode.widgets[2].value === 42, "A successful partial queue must preserve the existing once-per-queue seed behavior");
            const rollbackCallbackValues = [];
            const rollbackWidget = {{
                value: 42,
                callback(value) {{ rollbackCallbackValues.push(value); }},
            }};
            const rollbackChange = {{ widget: rollbackWidget, node: queueLifecycleNode, oldSeed: 41, newSeed: 42 }};
            assert(api.restoreReviewerRetrySeed(rollbackChange) === true, "A seed changed for a rejected queue must be restorable");
            assert(rollbackWidget.value === 41, "Rejected queue rollback must restore the original seed");
            assert(rollbackCallbackValues.join(",") === "41", "Rejected queue rollback must preserve the seed callback contract");
            rollbackWidget.value = 99;
            assert(api.restoreReviewerRetrySeed(rollbackChange) === false, "Rollback must not overwrite a seed the user changed while preflight was open");
            assert(rollbackWidget.value === 99, "Guarded rollback must preserve the user's newer seed value");
            assert(
                api.reviewerQueueResultAccepted({{ prompt_id: null, deno_ideogram_director: "preflight_waiting" }}) === false,
                "Reviewer retry must not report Ideogram preflight waiting as a queued run"
            );
            assert(api.reviewerQueueResultAccepted(null) === true, "Legacy queue helpers that resolve null must keep their previous accepted behavior");
            assert(api.reviewerQueueResultAccepted(true) === true, "Reviewer retry must accept a normal queued result");

            const seedGenerator = {{
                id: 1,
                type: "KSampler",
                title: "KSampler",
                widgets: [{{ name: "seed", value: 100 }}],
                inputs: [],
                outputs: [],
                setDirtyCanvas() {{}},
            }};
            const llmNode = {{
                id: 2,
                type: "DenoLocalLLMRefiner",
                title: "(Deno) Local LLM Loader",
                widgets: [{{ name: "seed", value: 50 }}],
                inputs: [{{ name: "prompt", link: 41 }}],
                outputs: [],
                setDirtyCanvas() {{}},
            }};
            const retryReviewer = {{
                id: 3,
                type: "DenoAIReviewGate",
                title: "(Deno) Local LLM Reviewer",
                pos: [20, 30],
                properties: {{}},
                widgets: [],
                inputs: [
                    {{ name: "review", link: 42 }},
                    {{ name: "image", link: 43 }},
                ],
                outputs: [],
                setDirtyCanvas() {{}},
            }};
            const fallbackSampler = {{
                id: 8,
                type: "KSampler",
                title: "Fallback KSampler",
                widgets: [{{ name: "noise_seed", value: 700 }}],
                inputs: [],
                outputs: [],
                setDirtyCanvas() {{}},
            }};
            graph.links = {{
                "41": {{ origin_id: 9, target_id: 2 }},
                "42": {{ origin_id: 2, target_id: 3 }},
                "43": {{ origin_id: 1, target_id: 3 }},
            }};
            graph._nodes = [
                seedGenerator,
                llmNode,
                retryReviewer,
                fallbackSampler,
                {{ id: 9, type: "DenoPromptText", widgets: [], inputs: [], outputs: [] }},
            ];
            context.app.canvas = {{ graph_mouse: [50, 50] }};
            assert(
                api.reviewerHoverKeyFromGraphMouse(retryReviewer, {{ review: [15, 6, 100, 26] }}) === "review",
                "Reviewer tooltip hover must be detected from canvas graph mouse movement"
            );
            const seedCandidates = api.collectReviewerSeedCandidates(retryReviewer);
            assert(seedCandidates.length === 2, "Reviewer retry must find both upstream seed widgets");
            const selectableSeedCandidates = api.collectReviewerSelectableSeedCandidates(retryReviewer);
            assert(
                selectableSeedCandidates.some((candidate) => candidate.key === "8:noise_seed" && candidate.scope === "graph"),
                "Reviewer seed picker must expose graph fallback seed widgets for manual selection"
            );
            const autoSeedChange = api.incrementReviewerRetrySeed(retryReviewer);
            assert(autoSeedChange.nodeId === "1", "Auto retry must prefer the generation seed over the Local LLM seed");
            assert(seedGenerator.widgets[0].value === 101, "Auto retry must increment the selected generation seed by one");
            assert(llmNode.widgets[0].value === 50, "Auto retry must not change the Local LLM seed when a generation seed exists");
            assert(fallbackSampler.widgets[0].value === 700, "Auto retry must not change graph fallback seeds");
            retryReviewer.properties.deno_auto_retry_seed_target = "2:seed";
            const manualSeedChange = api.incrementReviewerRetrySeed(retryReviewer);
            assert(manualSeedChange.nodeId === "2", "Manual seed target must increment the selected upstream seed");
            assert(llmNode.widgets[0].value === 51, "Manual seed target must increment only the selected seed");
            retryReviewer.properties.deno_auto_retry_seed_target = "8:noise_seed";
            const fallbackSeedChange = api.incrementReviewerRetrySeed(retryReviewer);
            assert(fallbackSeedChange.nodeId === "8", "Manual graph fallback seed target must increment the selected seed");
            assert(fallbackSampler.widgets[0].value === 701, "Manual graph fallback target must increment only that seed");
            retryReviewer.properties.deno_auto_retry_seed_target = "999:seed";
            const missingManualSeedChange = api.incrementReviewerRetrySeed(retryReviewer);
            assert(missingManualSeedChange === null, "Missing manual seed target must stop instead of falling back to another seed");
            assert(seedGenerator.widgets[0].value === 101, "Missing manual seed target must not change the generation seed");
            assert(llmNode.widgets[0].value === 51, "Missing manual seed target must not change the Local LLM seed");
            assert(fallbackSampler.widgets[0].value === 701, "Missing manual seed target must not change graph fallback seeds");

            retryReviewer.properties.deno_auto_retry_seed_target = "auto";
            seedGenerator.widgets[0].value = 1086783801454194;
            const highSeedChange = api.incrementReviewerRetrySeed(retryReviewer);
            assert(highSeedChange.oldSeed === 1086783801454194, "High ComfyUI sampler seed must be read without 32-bit clamping");
            assert(seedGenerator.widgets[0].value === 1086783801454195, "High ComfyUI sampler seed must increment by one instead of wrapping to zero");
            seedGenerator.widgets[0].options = {{ max: 1086783801454195 }};
            const maxSeedChange = api.incrementReviewerRetrySeed(retryReviewer);
            assert(maxSeedChange.newSeed === 0, "Seed must wrap only when the widget max is actually reached");
            delete seedGenerator.widgets[0].options;

            seedGenerator.widgets[0].value = 200;
            llmNode.widgets[0].value = 60;
            fallbackSampler.widgets[0].value = 800;
            api.setReviewerAutoRetryEnabled(retryReviewer, false);
            api.setReviewerSeedTarget(retryReviewer, "auto");
            const retryOffResult = api.maybeAutoRetryReviewer(retryReviewer, {{ passed: false }});
            assert(retryOffResult === false, "Retry Off must ignore failed reviews");
            assert(seedGenerator.widgets[0].value === 200, "Retry Off must not change seed on failure");

            api.setReviewerAutoRetryEnabled(retryReviewer, true);
            const passResult = api.maybeAutoRetryReviewer(retryReviewer, {{ passed: true }});
            assert(passResult === false, "Passing reviews must not auto-rerun");
            assert(seedGenerator.widgets[0].value === 200, "Passing reviews must not change seed");
            assert(retryReviewer._denoReviewerAutoRetryAttempt === 0, "Passing reviews must reset retry count");

            api.setReviewerAutoRetryEnabled(retryReviewer, true);
            const firstFailResult = api.maybeAutoRetryReviewer(retryReviewer, {{ passed: false }});
            assert(firstFailResult === true, "Failed review with Retry On must request an auto-rerun");
            assert(seedGenerator.widgets[0].value === 201, "Failed auto-rerun must increment the chosen seed");
            assert(llmNode.widgets[0].value === 60, "Auto-rerun must not change Local LLM seed when generation seed exists");
            assert(fallbackSampler.widgets[0].value === 800, "Auto-rerun must not change graph fallback seed in Auto mode");
            assert(retryReviewer._denoReviewerAutoRetryAttempt === 1, "First failed auto-rerun must record attempt 1");

            retryReviewer._denoReviewerAutoRetryBusy = true;
            const busyRetryResult = api.maybeAutoRetryReviewer(retryReviewer, {{ passed: false }});
            assert(busyRetryResult === false, "Busy auto-rerun must not start another retry");
            assert(seedGenerator.widgets[0].value === 201, "Busy auto-rerun must not increment seed twice");
            retryReviewer._denoReviewerAutoRetryBusy = false;

            retryReviewer._denoReviewerAutoRetryActive = true;
            retryReviewer._denoReviewerAutoRetryAttempt = 3;
            const limitResult = api.maybeAutoRetryReviewer(retryReviewer, {{ passed: false }});
            assert(limitResult === false, "Auto-rerun must stop after 3 failed attempts");
            assert(seedGenerator.widgets[0].value === 201, "Retry limit must not increment seed again");
            assert(
                String(retryReviewer.__denoLocalLLMGateState.reason || "").includes("Blocked after 3 auto retries"),
                "Retry limit must show a clear blocked message"
            );

            api.setReviewerAutoRetryEnabled(retryReviewer, true);
            api.setReviewerSeedTarget(retryReviewer, "999:seed");
            const missingManualRetryResult = api.maybeAutoRetryReviewer(retryReviewer, {{ passed: false }});
            assert(missingManualRetryResult === false, "Auto-rerun must stop when the selected manual seed target is missing");
            assert(seedGenerator.widgets[0].value === 201, "Missing manual seed target must not fall back to generation seed");
            assert(
                String(retryReviewer.__denoLocalLLMGateState.reason || "").includes("selected seed target"),
                "Missing manual seed target must explain that the selected seed was not found"
            );

            const noSeedReviewer = {{
                id: 10,
                type: "DenoAIReviewGate",
                title: "(Deno) Local LLM Reviewer",
                properties: {{}},
                widgets: [],
                inputs: [{{ name: "review", link: 50 }}],
                outputs: [],
                setDirtyCanvas() {{}},
            }};
            graph.links = {{
                "50": {{ origin_id: 11, target_id: 10 }},
            }};
            graph._nodes = [
                noSeedReviewer,
                {{ id: 11, type: "DenoPromptText", widgets: [], inputs: [], outputs: [] }},
            ];
            api.setReviewerAutoRetryEnabled(noSeedReviewer, true);
            const noSeedRetryResult = api.maybeAutoRetryReviewer(noSeedReviewer, {{ passed: false }});
            assert(noSeedRetryResult === false, "Auto-rerun must stop when no upstream seed exists");
            assert(
                String(noSeedReviewer.__denoLocalLLMGateState.reason || "").includes("upstream seed"),
                "Missing Auto seed must ask the user to pick a seed target"
            );

            const regenerateOutput = {{
                "1": {{ class_type: "ImageGenerator", inputs: {{}} }},
                "2": {{ class_type: "DenoLocalLLMRefiner", inputs: {{ prompt: ["1", 0] }} }},
                "3": {{ class_type: "DenoAIReviewGate", inputs: {{ review: ["2", 0], image: ["1", 0] }} }},
                "4": {{ class_type: "SaveImage", inputs: {{ images: ["3", 0] }} }},
                "5": {{ class_type: "ParallelOutput", inputs: {{ images: ["1", 0] }} }},
            }};
            api.applyReviewerRegenerateMode(regenerateOutput, "3", regenerateOutput["3"]);
            assert(keys(regenerateOutput) === "1,2,3", "Regenerate must keep only the reviewer and its upstream path");

            const submitReviewer = {{
                id: 3,
                type: "DenoAIReviewGate",
                widgets: [{{ name: "review_mode", value: "Pass" }}],
                inputs: [],
                outputs: [],
                setDirtyCanvas() {{}},
                _denoReviewerSubmitMode: "regenerate",
            }};
            graph._nodes = [submitReviewer];
            const mixedSubmitOutput = {{
                "1": {{ class_type: "ImageGenerator", inputs: {{}} }},
                "2": {{ class_type: "DenoLocalLLMRefiner", inputs: {{ prompt: ["1", 0] }} }},
                "3": {{ class_type: "DenoAIReviewGate", inputs: {{ review: ["2", 0], image: ["1", 0], review_mode: "Pass" }} }},
                "4": {{ class_type: "SaveImage", inputs: {{ images: ["3", 0] }} }},
            }};
            api.applyReviewerSubmitModes(mixedSubmitOutput);
            assert(keys(mixedSubmitOutput) === "1,2,3", "Regenerate submit mode must win over a stale Pass widget value");

            const passOutput = {{
                "1": {{ class_type: "ImageGenerator", inputs: {{}} }},
                "2": {{ class_type: "DenoLocalLLMRefiner", inputs: {{ prompt: ["7", 0] }} }},
                "3": {{ class_type: "DenoAIReviewGate", inputs: {{ review: ["2", 0], image: ["1", 0], review_mode: "Pass" }} }},
                "4": {{ class_type: "SaveImage", inputs: {{ images: ["3", 0] }} }},
                "5": {{ class_type: "PreviewAny", inputs: {{ source: ["7", 0] }} }},
                "7": {{ class_type: "DenoPromptText", inputs: {{ text: "shared prompt" }} }},
            }};
            api.applyReviewerPassMode(passOutput, "3", passOutput["3"]);
            assert(keys(passOutput) === "1,3,4,5,7", "Pass mode must remove only the review-only LLM branch");
            assert(passOutput["3"].inputs.review === "Manual pass.", "Pass mode must replace the review link with a literal manual pass");
            assert(passOutput["3"].inputs.review_mode === "Pass", "Pass mode must preserve pass mode for the gate");
            assert(passOutput["4"].inputs.images[0] === "3", "Pass mode must keep downstream image consumers connected to the gate");
            assert(passOutput["5"].inputs.source[0] === "7", "Pass mode must keep shared side-dependencies");

            graph.links = {{
                "30": {{ target_id: "4" }},
            }};
            const gateNode = {{
                id: 3,
                type: "DenoAIReviewGate",
                outputs: [{{ links: [30] }}],
                __denoLocalLLMGateState: {{
                    snapshot: {{
                        filename: "deno_llm_reviewer_3.npy",
                        subfolder: "deno_llm_reviewer",
                        type: "temp",
                    }},
                }},
            }};
            graph._nodes = [
                gateNode,
                {{ id: 4, type: "SaveImage", outputs: [] }},
                {{ id: 6, type: "FilenamePrefix", outputs: [] }},
            ];
            const approveOutput = {{
                "1": {{ class_type: "ImageGenerator", inputs: {{}} }},
                "2": {{ class_type: "DenoLocalLLMRefiner", inputs: {{ prompt: ["1", 0] }} }},
                "3": {{ class_type: "DenoAIReviewGate", inputs: {{ review: ["2", 0], image: ["1", 0] }} }},
                "4": {{ class_type: "SaveImage", inputs: {{ images: ["1", 0], filename_prefix: ["6", 0] }} }},
                "5": {{ class_type: "ParallelOutput", inputs: {{ images: ["1", 0] }} }},
                "6": {{ class_type: "FilenamePrefix", inputs: {{}} }},
            }};
            api.applyReviewerApproveOnceMode(approveOutput, "3", approveOutput["3"], gateNode);
            assert(keys(approveOutput) === "3,4,6", "Approve Once must keep the gate, downstream path, and downstream side-dependencies");
            assert(!("image" in approveOutput["3"].inputs), "Approve Once with a snapshot must detach the upstream image input");
            assert(approveOutput["3"].inputs.approve_once === true, "Approve Once must inject a one-shot approval flag");
            const reviewerState = JSON.parse(approveOutput["3"].inputs.reviewer_state);
            assert(reviewerState.snapshot_image.filename === "deno_llm_reviewer_3.npy", "Approve Once must pass the saved snapshot descriptor");
            assert(approveOutput["4"].inputs.images[0] === "3" && approveOutput["4"].inputs.images[1] === 0, "Downstream image links must reroute to the reviewer output");
            assert(approveOutput["4"].inputs.filename_prefix[0] === "6", "Downstream side-dependencies must stay connected");

            (async () => {{
                const workflowNodeA = {{ id: 77, type: "DenoLocalLLMRefiner", properties: {{}} }};
                const workflowNodeB = {{ id: 77, type: "DenoLocalLLMRefiner", properties: {{}} }};
                const workflowGraphA = {{
                    _nodes: [workflowNodeA],
                    getNodeById(id) {{ return String(id) === "77" ? workflowNodeA : null; }},
                }};
                const workflowGraphB = {{
                    _nodes: [workflowNodeB],
                    getNodeById(id) {{ return String(id) === "77" ? workflowNodeB : null; }},
                }};
                const promptBundleA = {{ workflow: {{ id: "duplicated-workflow-id" }}, output: {{}} }};
                api.rememberLocalLLMPromptBundleGraph(promptBundleA, workflowGraphA);
                const promptApi = {{
                    async queuePrompt() {{ return {{ prompt_id: "prompt-from-workflow-a" }}; }},
                }};
                assert(api.installLocalLLMApiQueuePromptHook(promptApi) === true, "The internal prompt API hook must install once");
                await promptApi.queuePrompt(0, promptBundleA, {{}});
                context.app.graph = workflowGraphB;
                assert(
                    api.localLLMNodeForExecutionDetail({{ prompt_id: "prompt-from-workflow-a", node_id: 77 }}) === workflowNodeA,
                    "Progress must stay on the submitted graph even after another workflow with the same node id becomes active"
                );
                assert(
                    api.localLLMNodeForExecutionDetail({{ prompt_id: "unknown-prompt", node_id: 77 }}) === null,
                    "An unknown prompt id must never fall back to the active same-id node"
                );
                assert(
                    api.localLLMNodeForExecutionDetail({{ node_id: 77 }}) === null,
                    "Unscoped progress must not mutate a guessed same-id node"
                );
            }})().catch((error) => {{
                console.error(error);
                process.exitCode = 1;
            }});
            """
        ),
        encoding="utf-8",
    )

    subprocess.run([node, str(script_path)], cwd=REPO_ROOT, check=True, capture_output=True, text=True)
