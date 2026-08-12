import fs from "node:fs";
import vm from "node:vm";

const sourcePath = process.argv[2];
if (!sourcePath) {
    throw new Error("Expected deno_ltx_model_downloader.js path.");
}

const storage = new Map();
let helpers = null;
const context = {
    app: { registerExtension() {} },
    api: {},
    window: {
        __DENO_LTX_MODEL_DOWNLOADER_TEST_HOOK__(value) {
            helpers = value;
        },
    },
    localStorage: {
        getItem(key) {
            return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
            storage.set(key, String(value));
        },
    },
    AbortController,
    URL,
    console,
};

const source = fs.readFileSync(sourcePath, "utf8").replace(/^import .*;\r?\n/gm, "");
vm.runInNewContext(source, context, { filename: sourcePath });

if (!helpers) {
    throw new Error("LTX downloader test hook was not installed.");
}

function check(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function ids(state) {
    return state.presets.map((item) => item.id);
}

const builtinIds = ["ltx_23_8gb_vram", "ltx_25_distilled_int8"];
const fresh = helpers.normalizePresetsState({});
check(JSON.stringify(ids(fresh)) === JSON.stringify(builtinIds), "fresh state must contain both built-ins");
check(fresh.active_preset_id === "ltx_23_8gb_vram", "fresh state must keep the LTX 2.3 default");
check(!helpers.hasCustomPresets(fresh), "built-in LTX 2.5 must not be mistaken for a custom preset");

const legacyOnly = helpers.normalizePresetsState({
    active_preset_id: "ltx_23_8gb_vram",
    presets: [{ id: "ltx_23_8gb_vram", title: "stale", files: [] }],
});
check(JSON.stringify(ids(legacyOnly)) === JSON.stringify(builtinIds), "LTX 2.3-only state must gain LTX 2.5");
check(legacyOnly.presets[0].files.length === helpers.DEFAULT_PACKAGE.files.length, "stale LTX 2.3 must be canonicalized");
check(legacyOnly.presets[1].files.length === 5, "LTX 2.5 must include the spatial upscaler");
const expectedLtx25Files = [
    ["diffusion_models", "ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors", 21504034224],
    ["text_encoders", "gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors", 15372971786],
    ["vae", "ltx-2.5-video-vae-bf16.safetensors", 1472223346],
    ["vae", "ltx-2.5-audio-vae-bf16.safetensors", 364866540],
    ["latent_upscale_models", "ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors", 995778752],
];
const actualLtx25Files = legacyOnly.presets[1].files.map((item) => [item.target_subdir, item.filename, item.size]);
check(JSON.stringify(actualLtx25Files) === JSON.stringify(expectedLtx25Files), "LTX 2.5 browser preset must match backend files and sizes");

const customPackage = {
    id: "my_unknown_pack",
    title: "My Unknown Pack",
    description: "preserve me",
    files: [{ id: "one", url: "https://example.com/one.safetensors", target_subdir: "checkpoints", filename: "one.safetensors", size: 1 }],
};
const customActive = helpers.normalizePresetsState({
    active_preset_id: customPackage.id,
    presets: [customPackage],
});
check(customActive.active_preset_id === customPackage.id, "custom active ID must be preserved");
check(ids(customActive).includes(customPackage.id), "unknown custom preset must be preserved");
check(customActive.presets.find((item) => item.id === customPackage.id).description === "preserve me", "custom fields must survive migration");

const staleLtx25 = helpers.normalizePresetsState({
    active_preset_id: "ltx_25_distilled_int8",
    presets: [{ id: "ltx_25_distilled_int8", title: "old", files: [] }],
});
check(staleLtx25.active_preset_id === "ltx_25_distilled_int8", "known LTX 2.5 active ID must be preserved");
check(staleLtx25.presets[1].files.length === 5, "stale LTX 2.5 must be replaced by the canonical package");

storage.clear();
let widgetCallbackCount = 0;
const legacyWidget = {
    value: JSON.stringify({
        active_preset_id: "ltx_23_8gb_vram",
        presets: [{ id: "ltx_23_8gb_vram", title: "old", files: [] }],
    }),
    callback() {
        widgetCallbackCount += 1;
    },
};
const migratedWidget = helpers.readPresetsState(legacyWidget);
check(ids(migratedWidget).includes("ltx_25_distilled_int8"), "saved workflow widget must gain LTX 2.5");
check(JSON.parse(legacyWidget.value).presets[1].files.length === 5, "saved workflow widget must persist canonical LTX 2.5 files");
check(widgetCallbackCount === 1, "saved workflow widget migration must notify ComfyUI once");

const merged = helpers.mergePresetLibrary(staleLtx25, customActive);
check(merged.active_preset_id === "ltx_25_distilled_int8", "workflow active preset must remain authoritative");
check(ids(merged).includes(customPackage.id), "browser custom preset must merge without replacing workflow state");

helpers.writeStoredPresetsState(customActive);
const reread = helpers.readStoredPresetsState();
check(reread.active_preset_id === customPackage.id, "browser storage must preserve its active preset ID");
check(ids(reread).includes(customPackage.id), "browser storage must preserve custom presets");

storage.clear();
storage.set("deno_ltx_model_downloader_presets_v1", JSON.stringify(customActive));
const migratedLegacyStorage = helpers.readStoredPresetsState();
check(migratedLegacyStorage.active_preset_id === customPackage.id, "legacy browser storage active ID must migrate");
check(ids(migratedLegacyStorage).includes("ltx_25_distilled_int8"), "legacy browser storage must gain LTX 2.5");

const fromBackend = helpers.normalizedPresetsStateFromPayload({ presets_state: customActive });
check(fromBackend.active_preset_id === customPackage.id, "backend normalized active ID must be consumed");
check(helpers.presetsStateEqual(fromBackend, customActive), "backend normalized state comparison must be stable");
check(helpers.normalizedPresetsStateFromPayload({}) === null, "missing backend state must not overwrite frontend state");
