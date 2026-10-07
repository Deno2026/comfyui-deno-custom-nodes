import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = path.join(root, "web/js/deno_minimax_h3_audio.js");
const noop = () => {};
class Target {
    constructor() { this.events = new Map(); }
    addEventListener(type, fn, options = {}) {
        const list = this.events.get(type) || [];
        list.push(fn);
        this.events.set(type, list);
        options.signal?.addEventListener("abort", () => this.removeEventListener(type, fn), { once: true });
    }
    removeEventListener(type, fn) { this.events.set(type, (this.events.get(type) || []).filter((entry) => entry !== fn)); }
    emit(type, options = {}) {
        const event = { type, target: this, button: 0, preventDefault: noop, stopPropagation: noop, ...options };
        this[`on${type}`]?.(event);
        for (const fn of this.events.get(type) || []) fn(event);
    }
}
function match(element, selector) {
    const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (attr) return element.getAttribute(attr[1]) !== null && (attr[2] === undefined || element.getAttribute(attr[1]) === attr[2]);
    return element.tag === selector;
}
class Element extends Target {
    constructor(tag, doc) {
        super(); this.tag = tag; this.doc = doc; this.children = []; this.parentElement = null;
        this.dataset = {}; this.attrs = {}; this.style = {}; this.textContent = ""; this.paused = true;
        this.offsetHeight = 100;
    }
    append(...items) { for (const item of items) { item.remove(); item.parentElement = this; this.children.push(item); } }
    appendChild(item) { this.append(item); return item; }
    replaceChildren(...items) { for (const child of [...this.children]) child.remove(); this.append(...items); }
    remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) {
        if (name.startsWith("data-")) return this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] ?? null;
        return this.attrs[name] ?? null;
    }
    removeAttribute(name) { delete this.attrs[name]; if (name === "src") this.src = ""; }
    querySelectorAll(selector) { return this.children.flatMap((item) => [...(match(item, selector) ? [item] : []), ...item.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    contains(item) { return this === item || this.children.some((child) => child.contains(item)); }
    get isConnected() { return this === this.doc.body || Boolean(this.parentElement?.isConnected); }
    getBoundingClientRect() { const index = this.parentElement?.children.indexOf(this) || 0; return { top: index * 70, bottom: index * 70 + 64, height: 64 }; }
    focus() { this.doc.activeElement = this; }
    click() { this.emit("click"); }
    async play() { this.paused = false; }
    pause() { this.paused = true; this.onpause?.(); }
    load() {}
}
const document = { createElement: (tag) => new Element(tag, document), createElementNS: (_, tag) => new Element(tag, document) };
document.body = document.createElement("body");
const window = new Target();
window.location = { href: "http://localhost:8188/", origin: "http://localhost:8188" };
let uuid = 0;
let frameId = 0;
const frames = new Map();
const observers = [];
class LayoutObserver {
    constructor(callback) { this.callback = callback; this.targets = new Set(); this.disconnected = false; observers.push(this); }
    observe(target) { this.targets.add(target); }
    disconnect() { this.disconnected = true; this.targets.clear(); }
    emit() { if (!this.disconnected) this.callback([...this.targets].map((target) => ({ target }))); }
}
const context = {
    console, document, window, AbortController, URL, FormData,
    CSS: { escape: (value) => value }, crypto: { randomUUID: () => `added-${++uuid}` }, queueMicrotask,
    ResizeObserver: LayoutObserver,
    requestAnimationFrame(callback) { const id = ++frameId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
};
vm.runInNewContext(fs.readFileSync(sourcePath, "utf8").replace(/^export /gm, ""), context, { filename: sourcePath });
const { parseH3AudioSources: parse, reconcileH3AudioOutputs: reconcile, setupH3AudioPanel: setup } = context;
const plain = (value) => JSON.parse(JSON.stringify(value));
const rows = ["first", "second", "third"].map((id) => ({ id, path: `${id}.wav`, enabled: true }));
const seed = () => ({
    id: 10, properties: {}, outputs: [
        { name: "ref_images", type: "DENO_MINIMAX_H3_REFERENCE_IMAGES", links: [1] },
        { name: "image_list", type: "IMAGE", links: [2] },
        ...rows.map((row, index) => ({ name: `audio_${index + 1}`, type: "AUDIO", links: [] })),
    ],
    graph: { links: {}, setDirtyCanvas: noop, change: noop, getNodeById: () => null },
    setDirtyCanvas: noop,
    addOutput(name, type) { this.outputs.push({ name, type, links: [] }); },
    removeOutput(slot) {
        for (const id of this.outputs[slot].links) delete this.graph.links[id];
        this.outputs.splice(slot, 1);
        for (let index = slot; index < this.outputs.length; ++index) {
            for (const id of this.outputs[index].links) this.graph.links[id].origin_slot--;
        }
    },
});
assert.throws(() => parse("not JSON"));
for (const malformed of ["", null, false, "null", "false"]) {
    assert.throws(() => parse(malformed), "invalid saved values must not turn into an empty audio list");
}
assert.throws(() => parse(JSON.stringify([{ ...rows[0], futureField: "retain me" }])));
assert.throws(() => parse(JSON.stringify([{ ...rows[0], enabled: "false" }])));
assert.throws(() => parse(JSON.stringify([rows[0], rows[0]])));
assert.throws(() => parse(JSON.stringify([...rows, { id: "fourth", path: "fourth.wav", enabled: true }])));
assert.equal(parse(JSON.stringify(rows)).length, 3);

// Real reported journey: only the third registered file is active. Physical
// output identity stays third, while the prompt tag and visible label are 1.
const node = seed();
reconcile(node, rows);
for (let index = 0; index < rows.length; ++index) {
    const id = index + 50;
    node.outputs[index + 2].links.push(id);
    node.graph.links[id] = { origin_id: node.id, origin_slot: index + 2, target_id: 20, target_slot: index };
}
const originalImageOutputs = node.outputs.slice(0, 2);
const disabled = rows.map((row, index) => ({ ...row, enabled: index === 2 }));
reconcile(node, disabled);
assert.deepEqual(node.outputs.slice(0, 2), originalImageOutputs);
assert.deepEqual(node.outputs.slice(2).map((output) => output.label), ["Audio · off", "Audio · off", "Audio 1"]);
assert.equal(node.graph.links[52].origin_slot, 4);
assert.ok(node.graph.links[50] && node.graph.links[51], "disable must keep every cable");

reconcile(node, [disabled[2], disabled[0], disabled[1]]);
assert.equal(node.graph.links[52].origin_slot, 2, "moving third audio to first must move its cable with it");
assert.equal(node.graph.links[50].origin_slot, 3);
assert.equal(node.graph.links[51].origin_slot, 4);
reconcile(node, [disabled[2], disabled[1]]);
assert.equal(node.graph.links[50], undefined, "remove only the deleted file's cable");
assert.equal(node.graph.links[51].origin_slot, 3, "remaining cable stays on second file");
assert.equal(node.graph.links[52].origin_slot, 2);
assert.deepEqual(plain(node.properties.denoH3AudioOutputIds), ["third", "second"]);

// A restored workflow with damaged identity must preserve the original graph.
const before = JSON.stringify(node.outputs);
node.properties.denoH3AudioOutputIds = ["bad", "bad"];
assert.throws(() => reconcile(node, []));
assert.equal(JSON.stringify(node.outputs), before);
node.properties.denoH3AudioOutputIds = ["third", "second"];
node.graph.links[52].origin_id = 999;
assert.throws(() => reconcile(node, []));
assert.equal(JSON.stringify(node.outputs), before, "unresolved cable check must happen before removing any output");

// Frontend 1.53.6 output descriptors derive links from graph topology using
// node.outputs.indexOf(descriptor). An object move changes this getter before
// origin_slot is updated; only a pre-move snapshot retains file identity.
function seedDerivedSlots() {
    const current = seed();
    const descriptor = (output) => {
        Object.defineProperty(output, "links", { configurable: true, get() {
            const slot = current.outputs.indexOf(output);
            return Object.entries(current.graph.links)
                .filter(([, link]) => link.origin_id === current.id && link.origin_slot === slot)
                .map(([id]) => Number(id));
        } });
        return output;
    };
    for (const output of current.outputs.slice(2)) descriptor(output);
    current.addOutput = function (name, type) { this.outputs.push(descriptor({ name, type })); };
    current.removeOutput = function (slot) {
        for (const id of this.outputs[slot].links) delete this.graph.links[id];
        this.outputs.splice(slot, 1);
        for (const link of Object.values(this.graph.links)) if (link.origin_id === this.id && link.origin_slot > slot) link.origin_slot--;
    };
    return current;
}
const derived = seedDerivedSlots();
reconcile(derived, rows);
for (let index = 0; index < 3; ++index) derived.graph.links[index + 4] = {
    origin_id: derived.id, origin_slot: index + 2, target_id: 20, target_slot: index,
};
reconcile(derived, disabled);
reconcile(derived, [disabled[2], disabled[0], disabled[1]]);
assert.deepEqual(derived.outputs.slice(2).map((output) => [...output.links]), [[6], [4], [5]],
    "native derived slots must move the original third file's cable to output 2");
assert.deepEqual([4, 5, 6].map((id) => derived.graph.links[id].origin_slot), [3, 4, 2]);
assert.deepEqual([4, 5, 6].map((id) => derived.graph.links[id].target_slot), [0, 1, 2],
    "reordering must leave consumer inputs and cable IDs intact");
reconcile(derived, [disabled[2], disabled[1]]);
assert.equal(derived.graph.links[4], undefined, "native removal disconnects only the removed file");
assert.deepEqual(derived.outputs.slice(2).map((output) => [...output.links]), [[6], [5]]);
assert.equal(derived.graph.links[5].origin_slot, 3);
reconcile(derived, [disabled[1], disabled[2]]);
assert.deepEqual(derived.outputs.slice(2).map((output) => [...output.links]), [[5], [6]], "a second native reorder preserves file identity");

// Missing identities cannot be hidden by multiple unmapped static slots.
const unidentified = seedDerivedSlots();
unidentified.properties.denoH3AudioOutputIds = [];
unidentified.graph.links[99] = { origin_id: unidentified.id, origin_slot: 2, target_id: 20, target_slot: 0 };
const unidentifiedBefore = JSON.stringify(unidentified.graph.links);
assert.throws(() => reconcile(unidentified, []));
assert.equal(JSON.stringify(unidentified.graph.links), unidentifiedBefore);

let failInfo = false;
let inputAudioFiles = [];
let uploadedAudioCount = 0;
const requests = [];
const api = { async fetchApi(url, options) {
    requests.push({ url, options });
    if (url === "/upload/image") return { ok: true, status: 200, json: async () => ({ name: `added-${++uploadedAudioCount}.wav`, subfolder: "deno-h3-reference-audio" }) };
    if (url.startsWith("/deno/h3/input-audios")) return { ok: true, status: 200, json: async () => ({ path: "", parent: "", folders: [], files: inputAudioFiles }) };
    return { ok: !failInfo, status: failInfo ? 404 : 200, json: async () => failInfo ? { error: "File missing" } : {
        duration: 2.5, sample_rate: 48000, channels: 2, peaks: [0, 0.7, 0.2], preview_url: "/deno/h3/reference-audio-preview?path=test.wav",
    } };
} };
const createActionButton = (label) => { const button = document.createElement("button"); button.textContent = label; return button; };
const flush = async () => {
    for (let index = 0; index < 20; ++index) {
        await Promise.resolve();
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach((callback) => callback());
    }
};
function makeUi(initial, locale = "en") {
    const node = seed();
    node.widgets = [{ name: "audio_sources", value: JSON.stringify(initial) }];
    const layoutUpdates = [];
    node.__denoUpdateLoaderAudioHeight = (height, options) => layoutUpdates.push({ height, ...options });
    node.contentChangeCalls = 0;
    node.__denoBeginLoaderContentChange = () => { node.contentChangeCalls += 1; };
    const container = document.createElement("div");
    document.body.append(container);
    setup(node, container, { app: { graph: node.graph, extensionManager: { setting: { get: () => locale } } }, api, createActionButton });
    return { node, container, panel: node.__denoH3Audio.section, layoutUpdates };
}
// Observe intrinsic section space, including disabled rows, and batch resize work.
const layoutUi = makeUi(rows);
const layoutObserver = observers.find((observer) => observer.targets.has(layoutUi.panel));
assert.ok(layoutObserver, "audio layout must observe its own section");
layoutUi.panel.offsetHeight = 298;
await flush();
assert.deepEqual(layoutUi.layoutUpdates.at(-1), { height: 298, reset: true },
    "the first measured audio layout initializes a saved-size-preserving baseline");
const layoutList = layoutUi.panel.querySelector("[data-deno-audio-list]");
assert.doesNotMatch(layoutList.style.cssText, /overflow-y\s*:\s*auto|max-height\s*:/,
    "bounded audio rows must use natural space instead of a private scrolling viewport");
assert.equal(layoutList.style.height, undefined, "opening rows must not force a one-row list height");
assert.doesNotMatch(layoutUi.panel.style.cssText, /max-height\s*:\s*58%/,
    "audio must not borrow a fixed percentage of the image gallery");
const beforeObserverBatch = layoutUi.layoutUpdates.length;
layoutUi.panel.offsetHeight = 229;
layoutObserver.emit(); layoutObserver.emit(); layoutObserver.emit();
assert.equal(layoutUi.layoutUpdates.length, beforeObserverBatch, "observer changes apply asynchronously");
await flush();
assert.equal(layoutUi.layoutUpdates.length, beforeObserverBatch + 1, "one frame coalesces repeated resize notifications");
assert.deepEqual(layoutUi.layoutUpdates.at(-1), { height: 229, reset: false });
const beforeToggleContentChanges = layoutUi.node.contentChangeCalls;
layoutUi.panel.querySelector("[data-deno-audio-use]").click();
await flush();
assert.ok(layoutUi.node.contentChangeCalls > beforeToggleContentChanges,
    "audio mutations capture size before native output reconciliation");
assert.equal(layoutUi.panel.querySelectorAll("[data-deno-audio-id]").length, 3,
    "disabled audio remains a full saved row and keeps its natural space");
assert.equal(layoutUi.layoutUpdates.at(-1).height, 229, "Use must not collapse a disabled row");
layoutUi.panel.querySelector("[data-deno-audio-disclosure]").click();
layoutUi.panel.offsetHeight = 33;
layoutObserver.emit();
await flush();
assert.deepEqual(layoutUi.layoutUpdates.at(-1), { height: 33, reset: false }, "collapse returns the measured header space");
layoutUi.node.onConfigure({});
layoutUi.panel.offsetHeight = 160;
await flush();
assert.deepEqual(layoutUi.layoutUpdates.at(-1), { height: 160, reset: true },
    "loading another saved workflow resets the height baseline");
const beforeDispose = layoutUi.layoutUpdates.length;
layoutObserver.emit();
assert.ok(frames.size > 0, "precondition: node has a pending layout frame");
layoutUi.node.onRemoved();
assert.equal(layoutObserver.disconnected, true, "node disposal disconnects its size observer");
await flush();
assert.equal(layoutUi.layoutUpdates.length, beforeDispose, "removed nodes must never apply pending layout measurements");

const ui = makeUi(rows);
await flush();
const audioItems = () => ui.panel.querySelectorAll("[data-deno-audio-id]");
const badges = () => audioItems().map((item) => item.querySelector("[data-deno-audio-index]").textContent);
const use = (index) => audioItems()[index].querySelector("[data-deno-audio-use]").click();
assert.deepEqual(badges(), ["<Audio 1>", "<Audio 2>", "<Audio 3>"]);
use(0); use(1); await flush();
assert.deepEqual(badges(), ["Off", "Off", "<Audio 1>"]);
assert.equal(ui.node.outputs[4].label, "Audio 1");
assert.equal(audioItems()[2].querySelector("[data-deno-audio-meta]").textContent, "0:02.5 · 48,000 Hz");
const play = audioItems()[0].querySelector("[data-deno-audio-play]");
play.click(); await flush();
assert.equal(play.textContent, "Ⅱ", "disabled audio remains available for preview");
assert.equal(JSON.parse(ui.node.widgets[0].value)[0].enabled, false, "preview does not change generation state");
ui.panel.querySelector("[data-deno-audio-disclosure]").click();
assert.equal(play.textContent, "▶", "closing audio section must pause playback");
ui.panel.querySelector("[data-deno-audio-disclosure]").click();

// Keyboard reorder protects file identity without mouse-only affordances.
audioItems()[2].querySelector('[aria-label="Reorder audio"]').emit("keydown", { key: "ArrowUp" });
await flush();
assert.deepEqual(JSON.parse(ui.node.widgets[0].value).map((row) => row.id), ["first", "third", "second"]);
assert.deepEqual(badges(), ["Off", "<Audio 1>", "Off"]);
const saved = { value: ui.node.widgets[0].value, properties: plain(ui.node.properties), outputs: plain(ui.node.outputs) };
const reopened = makeUi([]);
reopened.node.widgets[0].value = saved.value;
reopened.node.properties = saved.properties;
reopened.node.outputs = saved.outputs;
reopened.node.onConfigure({});
await flush();
assert.deepEqual(reopened.panel.querySelectorAll("[data-deno-audio-index]").map((element) => element.textContent), ["Off", "<Audio 1>", "Off"]);
assert.equal(reopened.node.outputs.length, 5);

// A corrupt restored widget must not erase saved outputs or their cables.
// The schema owns the legitimate [] default; empty/null/false are damage.
for (const malformed of ["", null, false, "null", "false", JSON.stringify([{ ...rows[0], futureField: "retain me" }])]) {
    const damaged = makeUi([]);
    damaged.node.properties = plain(saved.properties);
    damaged.node.outputs = plain(saved.outputs);
    for (let index = 2; index < damaged.node.outputs.length; ++index) {
        const linkId = 100 + index;
        damaged.node.outputs[index].links = [linkId];
        damaged.node.graph.links[linkId] = { origin_id: damaged.node.id, origin_slot: index, target_id: 20, target_slot: index - 2 };
    }
    const outputsBefore = JSON.stringify(damaged.node.outputs);
    const linksBefore = JSON.stringify(damaged.node.graph.links);
    const idsBefore = JSON.stringify(damaged.node.properties.denoH3AudioOutputIds);
    damaged.node.widgets[0].value = malformed;
    damaged.node.onConfigure({});
    await flush();
    assert.equal(damaged.node.widgets[0].value, malformed, "restore must preserve unreadable saved data for recovery");
    assert.equal(JSON.stringify(damaged.node.outputs), outputsBefore, "restore must preserve every saved audio output");
    assert.equal(JSON.stringify(damaged.node.graph.links), linksBefore, "restore must preserve every saved audio cable");
    assert.equal(JSON.stringify(damaged.node.properties.denoH3AudioOutputIds), idsBefore);
    assert.ok(damaged.panel.querySelector("[data-deno-audio-status]").textContent, "damaged saved state must explain recovery");
    damaged.node.onRemoved();
}

// Failed metadata is visible and retry recovers without replacing the source.
failInfo = true;
const failed = makeUi([rows[0]]);
await flush();
const failureMeta = failed.panel.querySelector("[data-deno-audio-meta]");
assert.equal(failureMeta.textContent, "Preview unavailable · Retry");
const failedValue = failed.node.widgets[0].value;
failInfo = false; failureMeta.click(); await flush();
assert.equal(failureMeta.textContent, "0:02.5 · 48,000 Hz");
assert.equal(failed.node.widgets[0].value, failedValue);

// No audio source = exactly the existing two image outputs. Video drops do not
// reach the upload endpoint. Clear removes only audio state and audio outputs.
const empty = makeUi([]);
assert.equal(empty.node.outputs.length, 2);
const uploadCount = requests.filter((request) => request.url === "/upload/image").length;
empty.panel.emit("drop", { dataTransfer: { files: [{ name: "clip.mp4", type: "video/mp4" }] } });
await flush();
assert.equal(requests.filter((request) => request.url === "/upload/image").length, uploadCount);
assert.ok(empty.panel.querySelector("[data-deno-audio-status]").textContent.includes("Video files are not supported"));
ui.panel.querySelectorAll("button").find((button) => button.textContent === "Clear audio").click();
assert.equal(ui.node.widgets[0].value, "[]");
assert.equal(ui.node.outputs.length, 2);
assert.equal(ui.node.outputs[0].name, "ref_images");
const ko = makeUi(disabled, "ko");
await flush();
assert.ok(ko.panel.querySelectorAll("button").some((button) => button.textContent === "오디오 추가"));
assert.deepEqual(ko.panel.querySelectorAll("[data-deno-audio-index]").map((item) => item.textContent), ["꺼짐", "꺼짐", "<Audio 1>"]);
assert.equal(ko.node.outputs[2].label, "Audio · 꺼짐");
assert.equal(ko.node.outputs[4].label, "Audio 1");
assert.ok(ko.panel.querySelector("[data-deno-audio-disclosure]").textContent.includes("1/3개 사용"));
assert.equal(ko.panel.querySelector("[data-deno-audio-play]").getAttribute("aria-label"), "오디오 미리듣기 재생");

// HTTP LAN tabs lack crypto.randomUUID. Exercise all three real add paths
// rather than substituting a direct helper call for upload/drop/Input Folder.
const originalCrypto = context.crypto;
const originalLocation = window.location;
context.crypto = {};
window.location = { href: "http://192.168.0.20:8188/", origin: "http://192.168.0.20:8188" };
const lan = makeUi([]);
await flush();
lan.panel.querySelector("input").emit("change", { target: { files: [{ name: "upload.wav", type: "audio/wav" }] } });
await flush();
assert.equal(JSON.parse(lan.node.widgets[0].value).length, 1, "LAN upload must append a file without randomUUID");
lan.panel.emit("drop", { dataTransfer: { files: [{ name: "drop.wav", type: "audio/wav" }] } });
await flush();
assert.equal(JSON.parse(lan.node.widgets[0].value).length, 2, "LAN drop must append a file without randomUUID");
inputAudioFiles = [{ name: "lan-folder.wav", display_name: "lan-folder.wav" }];
lan.panel.querySelectorAll("button").find((button) => button.textContent === "Input Folder").click();
await flush();
document.body.querySelectorAll("button").find((button) => button.textContent === "lan-folder.wav").click();
document.body.querySelectorAll("button").find((button) => button.textContent === "Add selected (1)").click();
await flush();
const lanRows = JSON.parse(lan.node.widgets[0].value);
assert.equal(lanRows.length, 3, "LAN Input Folder must append a third file without randomUUID");
assert.equal(new Set(lanRows.map((row) => row.id)).size, 3, "LAN file identities must remain distinct");
for (const row of lanRows) assert.match(row.id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
const lanSaved = lan.node.widgets[0].value;
lan.node.onConfigure({});
await flush();
assert.equal(lan.node.widgets[0].value, lanSaved, "restoring a LAN workflow must preserve stable IDs");
assert.deepEqual(plain(lan.node.properties.denoH3AudioOutputIds), lanRows.map((row) => row.id));
context.crypto = { getRandomValues(bytes) { for (let index = 0; index < bytes.length; ++index) bytes[index] = index; return bytes; } };
assert.equal(context.createH3AudioId(), "00010203-0405-4607-8809-0a0b0c0d0e0f", "prefer getRandomValues when randomUUID is unavailable");
context.crypto = originalCrypto;
window.location = originalLocation;

// HTMLMediaElement.play() may still be pending when the user pauses, closes
// the list, or starts a new request. Chrome rejects normal cancellation with
// AbortError; stale results must not replace the row's metadata or play state.
const normalPlay = Element.prototype.play;
const deferredPlays = [];
Element.prototype.play = function () {
    this.paused = false;
    return new Promise((resolve, reject) => deferredPlays.push({ player: this, resolve, reject }));
};
const race = makeUi([rows[0]]);
await flush();
const racePlay = () => race.panel.querySelector("[data-deno-audio-play]");
const raceMeta = () => race.panel.querySelector("[data-deno-audio-meta]");
const abortError = () => Object.assign(new Error("The play() request was interrupted by a call to pause()"), { name: "AbortError" });
const initialMeta = raceMeta().textContent;
racePlay().click();
const quick = deferredPlays.at(-1);
racePlay().click();
quick.reject(abortError());
await flush();
assert.equal(racePlay().textContent, "▶", "rapid pause must restore Play");
assert.equal(raceMeta().textContent, initialMeta, "normal play/pause cancellation must keep audio metadata");

racePlay().click();
const oldRequest = deferredPlays.at(-1);
racePlay().click();
racePlay().click();
const newRequest = deferredPlays.at(-1);
oldRequest.reject(abortError());
await flush();
assert.equal(raceMeta().textContent, initialMeta, "a cancelled request must not report failure over a new play request");
newRequest.resolve();
await flush();
assert.equal(racePlay().textContent, "Ⅱ");
racePlay().click();
racePlay().click();
const collapsedRequest = deferredPlays.at(-1);
race.panel.querySelector("[data-deno-audio-disclosure]").click();
collapsedRequest.reject(abortError());
await flush();
assert.equal(raceMeta().textContent, initialMeta, "closing the list must cancel playback without an error");
race.panel.querySelector("[data-deno-audio-disclosure]").click();
racePlay().click();
const obsoleteRowRequest = deferredPlays.at(-1);
race.panel.querySelector("[data-deno-audio-use]").click();
await flush();
obsoleteRowRequest.resolve();
await flush();
assert.equal(racePlay().textContent, "▶", "a late old-row resolve must not show Pause on the replacement row");
assert.equal(raceMeta().textContent, initialMeta);
racePlay().click();
const failure = deferredPlays.at(-1);
failure.player.paused = true;
failure.reject(Object.assign(new Error("Decoding failed"), { name: "NotSupportedError" }));
await flush();
assert.equal(raceMeta().textContent, "Playback failed · Retry", "real playback failure must remain visible");
Element.prototype.play = normalPlay;
ui.node.onRemoved(); reopened.node.onRemoved(); failed.node.onRemoved(); empty.node.onRemoved(); ko.node.onRemoved(); lan.node.onRemoved(); race.node.onRemoved();
assert.equal((window.events.get("pointermove") || []).length, 0, "node disposal must release global gesture handlers");
console.log("minimax_h3_audio_harness passed");
