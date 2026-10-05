// The serialized order chooses backend slots; stable IDs keep every cable on
// its original file when the user moves or removes a row. Displayed Audio N is
// the enabled reference order and is intentionally independent of slot names.
const MAX_AUDIO = 3;
const OUTPUT_OFFSET = 2;
const OUTPUT_IDS = "denoH3AudioOutputIds";
const AUDIO_OPEN = "denoH3AudioOpen";
const AUDIO_EXTENSION = /\.(?:wav|mp3|flac|ogg|oga|opus|m4a|aac|aif|aiff)$/i;
const AUDIO_ACCEPT = ".wav,.mp3,.flac,.ogg,.oga,.opus,.m4a,.aac,.aif,.aiff";
let fallbackIdentitySequence = 0;

export function createH3AudioId() {
    const cryptoApi = typeof crypto !== "undefined" ? crypto : null;
    if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
    const bytes = new Uint8Array(16);
    if (typeof cryptoApi?.getRandomValues === "function") {
        // getRandomValues remains available on ordinary HTTP LAN ComfyUI URLs.
        cryptoApi.getRandomValues(bytes);
    } else {
        // These are local file identities, not credentials or security tokens.
        // A sequence prevents same-session collisions without a crypto API.
        for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
        const timestamp = Date.now();
        const sequence = ++fallbackIdentitySequence;
        for (let index = 0; index < 6; index += 1) {
            bytes[index] = Math.floor(timestamp / (256 ** index)) & 255;
            bytes[index + 10] = Math.floor(sequence / (256 ** index)) & 255;
        }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function parseH3AudioSources(raw) {
    if (typeof raw !== "string") {
        throw new Error("Saved audio data is invalid. Restore the workflow or clear the audio list.");
    }
    const value = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > MAX_AUDIO) {
        throw new Error("Audio sources must be a list containing at most 3 files.");
    }
    const ids = new Set();
    return value.map((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)
            || Object.keys(row).some((key) => !["id", "path", "enabled"].includes(key))
            || typeof row.id !== "string" || !row.id.trim() || ids.has(row.id)
            || typeof row.path !== "string" || !row.path.trim()
            || typeof row.enabled !== "boolean") {
            throw new Error("Saved audio data is invalid. Restore the workflow or clear the audio list.");
        }
        ids.add(row.id);
        return { ...row };
    });
}

function graphLink(node, id) {
    return node.graph?._links?.get?.(id) || node.graph?.links?.[id];
}

export function reconcileH3AudioOutputs(node, rows, offLabel = "Audio · off") {
    node.outputs ||= [];
    node.properties ||= {};
    const priorIds = node.properties[OUTPUT_IDS];
    const existing = node.outputs.slice(OUTPUT_OFFSET);
    // Static schema slots have no identity until the first load. Once saved,
    // an ambiguous mapping must not silently retarget existing connections.
    if (priorIds !== undefined && (!Array.isArray(priorIds)
        || new Set(priorIds).size !== priorIds.length
        || priorIds.some((id) => typeof id !== "string"))) {
        throw new Error("Saved audio output identities are invalid; cables have been preserved.");
    }
    if (!priorIds && existing.some((output) => output.links?.length) && existing.length !== rows.length) {
        throw new Error("Audio output identities are missing; restore the workflow before changing connected files.");
    }
    const ids = priorIds || rows.map((row) => row.id);
    // Frontend 1.53+ derives output.links from the slot's current array index
    // and the graph's link store. Capture file connectivity before moving a
    // slot; reading its getter after the move would return another file's
    // cables at that physical index.
    const snapshots = existing.map((output) => ({ output, linkIds: Array.from(output.links || []) }));
    const byId = new Map(snapshots.map((snapshot, index) => [ids[index], snapshot]));
    for (let index = 0; index < existing.length; index += 1) {
        for (const linkId of snapshots[index].linkIds) {
            const link = graphLink(node, linkId);
            if (!ids[index] || !link || link.origin_id !== node.id) {
                throw new Error("An audio cable could not be resolved; restore the workflow before arranging files.");
            }
        }
    }
    const wanted = new Set(rows.map((row) => row.id));
    for (let index = node.outputs.length - 1; index >= OUTPUT_OFFSET; index -= 1) {
        const id = ids[index - OUTPUT_OFFSET];
        if (wanted.has(id)) continue;
        if (typeof node.removeOutput === "function") {
            // LiteGraph owns disconnect callbacks and target-side cleanup.
            node.removeOutput(index);
        } else if (node.outputs[index].links?.length) {
            throw new Error("ComfyUI cannot safely remove this connected audio output.");
        } else {
            node.outputs.splice(index, 1);
        }
    }
    const firstOutputs = node.outputs.slice(0, OUTPUT_OFFSET);
    let enabledIndex = 0;
    const nextLinkIds = [];
    const next = rows.map((row, index) => {
        const previous = byId.get(row.id);
        let output = previous?.output;
        nextLinkIds.push(previous?.linkIds || []);
        if (!output) {
            if (typeof node.addOutput !== "function") throw new Error("ComfyUI audio output API is unavailable.");
            node.addOutput(`audio_${index + 1}`, "AUDIO");
            output = node.outputs[node.outputs.length - 1];
        }
        output.name = `audio_${index + 1}`;
        output.type = "AUDIO";
        output.label = row.enabled ? `Audio ${++enabledIndex}` : offLabel;
        output.localized_name = output.label;
        return output;
    });
    node.outputs = firstOutputs.concat(next);
    for (let index = 0; index < next.length; index += 1) {
        for (const linkId of nextLinkIds[index]) {
            const link = graphLink(node, linkId);
            if (!link || link.origin_id !== node.id) {
                throw new Error("An audio cable could not be resolved; restore the workflow before arranging files.");
            }
            link.origin_slot = OUTPUT_OFFSET + index;
        }
    }
    node.properties[OUTPUT_IDS] = rows.map((row) => row.id);
    node.setDirtyCanvas?.(true, true);
}

function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "";
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}

function validAudioFile(file) {
    return AUDIO_EXTENSION.test(file?.name || "") && !String(file?.type || "").startsWith("video/");
}

export function setupH3AudioPanel(node, container, { app, api, createActionButton, gallery }) {
    const widget = node.widgets?.find((entry) => entry.name === "audio_sources");
    if (!widget || node.__denoH3Audio) return;
    const locale = app.extensionManager?.setting?.get?.("Comfy.Locale")
        || app.ui?.settings?.getSettingValue?.("Comfy.Locale")
        || (typeof navigator !== "undefined" ? navigator.language : "en");
    const korean = String(locale).toLowerCase().startsWith("ko");
    const tr = (english, ko) => korean ? ko : english;
    const localError = (error) => {
        const message = error?.message || String(error);
        const errors = {
            "Audio sources must be a list containing at most 3 files.": "오디오는 최대 3개까지 등록할 수 있습니다. 저장된 목록을 확인하세요.",
            "Saved audio data is invalid. Restore the workflow or clear the audio list.": "저장된 오디오 정보가 올바르지 않습니다. 워크플로우를 복원하거나 오디오 목록을 비우세요.",
            "Saved audio output identities are invalid; cables have been preserved.": "저장된 오디오 연결 정보가 올바르지 않습니다. 연결은 보존했으니 워크플로우를 복원해 주세요.",
            "Audio output identities are missing; restore the workflow before changing connected files.": "저장된 파일별 연결 정보가 없습니다. 파일을 변경하기 전에 워크플로우를 복원해 주세요.",
            "An audio cable could not be resolved; restore the workflow before arranging files.": "오디오 연결 정보를 확인할 수 없습니다. 순서를 바꾸기 전에 워크플로우를 복원해 주세요.",
            "ComfyUI cannot safely remove this connected audio output.": "연결된 오디오 출력을 안전하게 제거할 수 없습니다. ComfyUI를 업데이트해 주세요.",
            "ComfyUI audio output API is unavailable.": "오디오 출력을 추가할 수 없습니다. ComfyUI를 업데이트해 주세요.",
            "Audio preview response is invalid.": "오디오 미리보기 정보를 읽지 못했습니다. 다시 시도해 주세요.",
        };
        if (korean && errors[message]) return errors[message];
        if (korean && error?.name === "SyntaxError") return errors["Saved audio data is invalid. Restore the workflow or clear the audio list."];
        return message;
    };
    node.properties ||= {};
    const lifecycle = new AbortController();
    const listeners = { signal: lifecycle.signal };
    const infoCache = new Map();
    const pendingInfo = new Map();
    const players = new Map();
    const playRequests = new Map();
    const unrendered = Symbol("unrendered audio_sources");
    let renderedValue = unrendered;
    let rows = [];
    let disposed = false;
    let uploadGeneration = 0;
    let uploading = false;
    let drag = null;
    let modalCleanup = null;

    const section = document.createElement("section");
    section.dataset.denoH3AudioPanel = "true";
    section.style.cssText = "display:flex;flex-direction:column;flex:0 1 auto;min-height:32px;max-height:58%;border-top:1px solid #244933;padding-top:6px;gap:6px;overflow:hidden;color:#dfffea;font:11px sans-serif;";
    const disclosure = document.createElement("button");
    disclosure.type = "button";
    disclosure.dataset.denoAudioDisclosure = "true";
    disclosure.style.cssText = "display:flex;align-items:center;gap:8px;min-height:26px;width:100%;padding:0 2px;border:0;color:#a8f8bc;background:transparent;text-align:left;cursor:pointer;font:600 12px sans-serif;";
    const body = document.createElement("div");
    body.style.cssText = "display:flex;flex-direction:column;gap:6px;min-height:0;overflow:hidden;";
    const toolbar = document.createElement("div");
    toolbar.style.cssText = "display:flex;align-items:center;gap:6px;flex-shrink:0;";
    const upload = createActionButton(tr("Add audio", "오디오 추가"));
    const inputFolder = createActionButton(tr("Input Folder", "Input 폴더"));
    const clear = createActionButton(tr("Clear audio", "오디오 비우기"), true);
    toolbar.append(upload, inputFolder, clear);
    const list = document.createElement("div");
    list.dataset.denoAudioList = "true";
    list.style.cssText = "display:flex;flex-direction:column;gap:5px;overflow-y:auto;min-height:0;max-height:225px;padding-right:3px;";
    const note = document.createElement("div");
    note.style.cssText = "color:#92cba2;line-height:1.3;flex-shrink:0;";
    note.textContent = tr("Connect each audio output to H3 and connect audio_vae. Only enabled audio gets a reference number.", "오디오 출력을 H3에 연결하고 audio_vae도 연결하세요. 켜진 오디오에만 참조 번호가 붙습니다.");
    const status = document.createElement("div");
    status.dataset.denoAudioStatus = "true";
    status.setAttribute("role", "status");
    status.style.cssText = "color:#edc493;line-height:1.3;flex-shrink:0;";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = AUDIO_ACCEPT;
    fileInput.multiple = true;
    fileInput.style.display = "none";
    body.append(toolbar, list, note, status, fileInput);
    section.append(disclosure, body);
    container.appendChild(section);

    const stopPlayers = () => {
        playRequests.clear();
        for (const player of players.values()) {
            player.pause();
            player.removeAttribute("src");
            player.load?.();
        }
        players.clear();
    };
    const updateConnectionNote = () => {
        const targets = new Set();
        for (const output of node.outputs?.slice(OUTPUT_OFFSET) || []) {
            for (const id of output.links || []) {
                const link = graphLink(node, id);
                const target = node.graph?.getNodeById?.(link?.target_id);
                if ((target?.comfyClass || target?.type) === "DenoMiniMaxH3ReferenceToVideo") targets.add(target);
            }
        }
        const activeSlots = rows.flatMap((row, index) => row.enabled ? [index + OUTPUT_OFFSET] : []);
        let incomplete = false;
        let mixed = false;
        let missingVae = false;
        for (const target of targets) {
            const audioInputs = (target.inputs || []).filter((input) => input.name?.startsWith("ref_audios.") && input.link != null);
            const links = audioInputs.map((input) => graphLink(node, input.link)).filter(Boolean);
            incomplete ||= activeSlots.some((slot) => !links.some((link) => link.origin_id === node.id && link.origin_slot === slot));
            mixed ||= links.some((link) => link.origin_id !== node.id)
                || (target.inputs || []).some((input) => input.name?.startsWith("ref_video_audios.") && input.link != null);
            missingVae ||= !(target.inputs || []).find((input) => input.name === "audio_vae")?.link;
        }
        note.textContent = mixed
            ? tr("Separate this H3's other audio references to preserve the Audio numbers shown here.", "표시된 오디오 번호를 유지하려면 이 H3에 연결된 다른 오디오 참조를 분리하세요.")
            : incomplete
                ? tr("Connect every enabled audio output to the same H3. Turn off files you do not want to use.", "켜진 오디오를 같은 H3에 모두 연결하세요. 사용하지 않을 파일은 끄세요.")
                : missingVae
                    ? tr("Connect audio_vae to this H3 to encode the reference sound.", "참조 소리를 사용하려면 이 H3에 audio_vae를 연결하세요.")
                    : tr("Connect each audio output to H3 and connect audio_vae. Only enabled audio gets a reference number.", "오디오 출력을 H3에 연결하고 audio_vae도 연결하세요. 켜진 오디오에만 참조 번호가 붙습니다.");
        note.style.color = mixed || incomplete || missingVae ? "#edc493" : "#92cba2";
    };
    const setStatus = (message) => { status.textContent = message; };
    const setOpen = (open, persist = true) => {
        if (persist) node.properties[AUDIO_OPEN] = open;
        body.style.display = open ? "flex" : "none";
        const hasRows = open && rows.length > 0;
        // At the smallest node size, reserve one complete audio row together
        // with its buttons/help. Photos use the remaining scrollable area.
        // A 64px basis limits intrinsic content to one row; larger panels can
        // grow the list instead of forcing every saved row into the node.
        section.style.flex = hasRows ? "0 0 58%" : "0 1 auto";
        section.style.minHeight = hasRows ? "min-content" : "32px";
        body.style.flex = "1 1 auto";
        body.style.minHeight = hasRows ? "min-content" : "0";
        list.style.flex = hasRows ? "1 1 auto" : "0 1 auto";
        list.style.height = hasRows ? "64px" : "auto";
        list.style.minHeight = hasRows ? "64px" : "0";
        if (gallery) gallery.style.minHeight = hasRows ? "0" : "64px";
        disclosure.setAttribute("aria-expanded", String(open));
        const enabled = rows.filter((row) => row.enabled).length;
        disclosure.textContent = `${open ? "▾" : "▸"} ${tr(`Audio references  ·  ${enabled}/${rows.length} enabled  ·  max 3`, `오디오 참조  ·  ${enabled}/${rows.length}개 사용  ·  최대 3개`)}`;
        if (!open) {
            cancelDrag();
            stopPlayers();
        }
        node.setDirtyCanvas?.(true, true);
    };
    disclosure.onclick = () => setOpen(disclosure.getAttribute("aria-expanded") !== "true");

    const read = () => parseH3AudioSources(widget.value);
    const dirty = () => {
        node.setDirtyCanvas?.(true, true);
        node.graph?.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        node.graph?.change?.();
    };
    const commit = (next) => {
        try {
            // Validate before changing either the widget or any connection.
            parseH3AudioSources(JSON.stringify(next));
            reconcileH3AudioOutputs(node, next, tr("Audio · off", "Audio · 꺼짐"));
            widget.value = JSON.stringify(next);
            widget.callback?.(widget.value);
            rows = next;
            renderedValue = unrendered;
            sync();
            dirty();
            return true;
        } catch (error) {
            setStatus(localError(error));
            return false;
        }
    };

    function cancelDrag() {
        if (!drag) return;
        for (const item of list.children) {
            item.style.opacity = "1";
            item.style.borderColor = "#2c5e3d";
        }
        drag = null;
    }

    function startDrag(event, row) {
        if (event.button !== 0 || uploading) return;
        event.preventDefault();
        event.stopPropagation();
        cancelDrag();
        drag = { id: row.id, startY: event.clientY, targetId: row.id, after: false, moved: false };
        list.querySelector(`[data-deno-audio-id="${CSS.escape(row.id)}"]`).style.opacity = "0.65";
    }
    function moveDrag(event) {
        if (!drag) return;
        event.preventDefault();
        drag.moved ||= Math.abs(event.clientY - drag.startY) > 4;
        for (const item of list.children) {
            const rect = item.getBoundingClientRect();
            if (!item.dataset.denoAudioId) continue;
            const hovering = event.clientY >= rect.top && event.clientY <= rect.bottom;
            item.style.borderColor = hovering ? "#94f7af" : "#2c5e3d";
            if (hovering) {
                drag.targetId = item.dataset.denoAudioId;
                drag.after = event.clientY > rect.top + rect.height / 2;
            }
        }
    }
    function endDrag() {
        if (!drag) return;
        const gesture = drag;
        cancelDrag();
        if (!gesture.moved || gesture.id === gesture.targetId) return;
        const next = read();
        const moving = next.find((row) => row.id === gesture.id);
        const remainder = next.filter((row) => row.id !== gesture.id);
        const target = remainder.findIndex((row) => row.id === gesture.targetId);
        if (!moving || target < 0) return;
        remainder.splice(target + (gesture.after ? 1 : 0), 0, moving);
        commit(remainder);
    }
    window.addEventListener("pointermove", moveDrag, { ...listeners, capture: true });
    window.addEventListener("pointerup", endDrag, { ...listeners, capture: true });
    window.addEventListener("pointercancel", cancelDrag, listeners);
    window.addEventListener("blur", cancelDrag, listeners);
    window.addEventListener("keydown", (event) => { if (event.key === "Escape") cancelDrag(); }, listeners);

    async function loadInfo(row, item, retry = false) {
        if (retry) infoCache.delete(row.path);
        let info = retry ? null : infoCache.get(row.path);
        const rowStatus = item.querySelector("[data-deno-audio-meta]");
        const play = item.querySelector("[data-deno-audio-play]");
        const waveform = item.querySelector("svg");
        if (!info) {
            const controller = new AbortController();
            pendingInfo.get(row.id)?.abort();
            pendingInfo.set(row.id, controller);
            rowStatus.textContent = tr("Reading audio…", "오디오 읽는 중…");
            play.disabled = true;
            try {
                const response = await api.fetchApi(`/deno/h3/reference-audio-info?path=${encodeURIComponent(row.path)}`, {
                    cache: "no-store", signal: controller.signal,
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || `Audio preview failed (${response.status}).`);
                const preview = new URL(api.apiURL?.(payload.preview_url) ?? payload.preview_url, window.location.href);
                if (preview.origin !== window.location.origin || !Number.isFinite(Number(payload.duration))) {
                    throw new Error("Audio preview response is invalid.");
                }
                info = { ...payload, preview_url: preview.href };
                infoCache.set(row.path, info);
            } catch (error) {
                if (controller.signal.aborted || disposed) return;
                rowStatus.textContent = tr("Preview unavailable · Retry", "미리듣기 불가 · 다시 시도");
                rowStatus.title = localError(error);
                rowStatus.style.cursor = "pointer";
                rowStatus.onclick = () => loadInfo(row, item, true);
                return;
            } finally {
                if (pendingInfo.get(row.id) === controller) pendingInfo.delete(row.id);
            }
        }
        if (disposed || !list.contains(item)) return;
        const readyLabel = `${formatDuration(Number(info.duration))} · ${Number(info.sample_rate).toLocaleString()} Hz`;
        const readyTitle = `${row.path}\n${tr(`${info.channels} channel(s)`, `${info.channels}채널`)}`;
        rowStatus.textContent = readyLabel;
        rowStatus.title = readyTitle;
        rowStatus.onclick = null;
        rowStatus.style.cursor = "default";
        const peaks = Array.isArray(info.peaks) ? info.peaks : [];
        waveform.replaceChildren();
        if (peaks.length) {
            const bars = document.createElementNS("http://www.w3.org/2000/svg", "path");
            bars.setAttribute("d", peaks.map((peak, index) => {
                const level = Math.min(1, Math.max(0, Number(peak) || 0));
                return `M${index * 128 / peaks.length},${12 - level * 11}v${level * 22 + 0.4}`;
            }).join(" "));
            bars.setAttribute("stroke", "#73c28c");
            bars.setAttribute("stroke-width", "0.65");
            waveform.appendChild(bars);
        }
        play.disabled = false;
        play.onclick = async () => {
            let player = players.get(row.id);
            if (!player) {
                player = document.createElement("audio");
                player.preload = "none";
                player.src = info.preview_url;
                player.onended = () => {
                    if (players.get(row.id) !== player || (!player.paused && !player.ended)) return;
                    playRequests.delete(row.id);
                    play.textContent = "▶";
                    play.setAttribute("aria-label", tr("Play audio preview", "오디오 미리듣기 재생"));
                };
                player.onpause = player.onended;
                player.onerror = () => {
                    if (disposed || !list.contains(item) || players.get(row.id) !== player) return;
                    playRequests.delete(row.id);
                    player.onended();
                    rowStatus.textContent = tr("Playback failed · Retry", "재생 실패 · 다시 시도");
                    rowStatus.onclick = () => { player.pause(); players.delete(row.id); loadInfo(row, item, true); };
                    play.disabled = true;
                };
                players.set(row.id, player);
            }
            if (!player.paused || playRequests.has(row.id)) {
                playRequests.delete(row.id);
                player.pause();
                play.textContent = "▶";
                play.setAttribute("aria-label", tr("Play audio preview", "오디오 미리듣기 재생"));
                return;
            }
            for (const [id, other] of players) {
                if (id === row.id) continue;
                playRequests.delete(id);
                other.pause();
            }
            const request = {};
            playRequests.set(row.id, request);
            try {
                await player.play();
                if (disposed || !list.contains(item) || players.get(row.id) !== player) { player.pause(); return; }
                if (playRequests.get(row.id) !== request || player.paused) return;
                rowStatus.textContent = readyLabel;
                rowStatus.title = readyTitle;
                play.textContent = "Ⅱ";
                play.setAttribute("aria-label", tr("Pause audio preview", "오디오 미리듣기 일시정지"));
            } catch (error) {
                if (disposed || !list.contains(item) || players.get(row.id) !== player
                    || playRequests.get(row.id) !== request
                    || (error?.name === "AbortError" && player.paused)) return;
                rowStatus.textContent = tr("Playback failed · Retry", "재생 실패 · 다시 시도");
                rowStatus.title = localError(error);
            } finally {
                if (playRequests.get(row.id) === request) playRequests.delete(row.id);
            }
        };
    }

    function buildRow(row, index, enabledIndex) {
        const item = document.createElement("div");
        item.dataset.denoAudioId = row.id;
        item.dataset.denoAudioEnabled = String(row.enabled);
        item.style.cssText = `display:grid;grid-template-columns:20px 28px minmax(0,1fr) 42px 22px;align-items:center;gap:5px;min-height:64px;flex-shrink:0;border:1px solid #2c5e3d;border-radius:7px;padding:5px;box-sizing:border-box;background:${row.enabled ? "#0a1b11" : "#111814"};`;
        const handle = document.createElement("button");
        handle.type = "button";
        handle.dataset.denoAudioReorder = "true";
        handle.textContent = "↕";
        handle.title = tr("Drag to reorder; use arrow keys to move", "드래그하거나 위·아래 방향키로 순서 변경");
        handle.setAttribute("aria-label", tr("Reorder audio", "오디오 순서 변경"));
        handle.style.cssText = "height:32px;border:0;background:transparent;color:#8aba98;cursor:grab;touch-action:none;";
        handle.onpointerdown = (event) => startDrag(event, row);
        handle.onkeydown = (event) => {
            const change = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
            if (!change) return;
            event.preventDefault();
            event.stopPropagation();
            const next = read();
            const target = index + change;
            if (target < 0 || target >= next.length) return;
            [next[index], next[target]] = [next[target], next[index]];
            if (commit(next)) list.children[target]?.querySelector(`[aria-label="${tr("Reorder audio", "오디오 순서 변경")}"]`)?.focus();
        };
        const play = document.createElement("button");
        play.type = "button";
        play.textContent = "▶";
        play.dataset.denoAudioPlay = "true";
        play.setAttribute("aria-label", tr("Play audio preview", "오디오 미리듣기 재생"));
        play.title = tr("Play audio preview", "오디오 미리듣기 재생");
        play.disabled = true;
        play.style.cssText = "width:28px;height:30px;border:1px solid #386b48;background:#102e1b;color:#bcffd0;border-radius:5px;cursor:pointer;";
        const details = document.createElement("div");
        details.style.cssText = "min-width:0;overflow:hidden;";
        const heading = document.createElement("div");
        heading.style.cssText = "display:flex;gap:5px;align-items:center;min-width:0;";
        const badge = document.createElement("span");
        badge.dataset.denoAudioIndex = "true";
        badge.textContent = row.enabled ? `<Audio ${enabledIndex}>` : tr("Off", "꺼짐");
        badge.style.cssText = "font:600 10px sans-serif;color:#b2f3c4;white-space:nowrap;";
        const filename = document.createElement("span");
        filename.textContent = row.path.replace(/\\/g, "/").split("/").pop();
        filename.title = row.path;
        filename.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#d1e4d7;";
        heading.append(badge, filename);
        const waveform = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        waveform.setAttribute("viewBox", "0 0 128 24");
        waveform.setAttribute("preserveAspectRatio", "none");
        waveform.setAttribute("aria-hidden", "true");
        waveform.style.cssText = "display:block;width:100%;height:22px;";
        const meta = document.createElement("div");
        meta.dataset.denoAudioMeta = "true";
        meta.style.cssText = "font:10px sans-serif;color:#98bba3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        details.append(heading, waveform, meta);
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.dataset.denoAudioUse = "true";
        toggle.textContent = row.enabled ? tr("Use ✓", "사용 ✓") : tr("Use", "사용");
        toggle.setAttribute("aria-pressed", String(row.enabled));
        toggle.title = row.enabled ? tr("Disable for generation; keep this file and cable", "생성에서 제외 · 파일과 연결은 유지") : tr("Enable for generation", "생성에 사용");
        toggle.style.cssText = `height:28px;font:600 10px sans-serif;border:1px solid #386b48;border-radius:5px;color:${row.enabled ? "#c3ffd3" : "#9aae9f"};background:${row.enabled ? "#1b4a2a" : "#19231c"};cursor:pointer;`;
        toggle.onclick = () => commit(read().map((entry) => entry.id === row.id ? { ...entry, enabled: !entry.enabled } : entry));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.dataset.denoAudioRemove = "true";
        remove.textContent = "×";
        remove.setAttribute("aria-label", tr("Remove audio", "오디오 제거"));
        remove.title = tr("Remove this file and its output cable", "이 파일과 출력 연결 제거");
        remove.style.cssText = "height:28px;border:0;background:transparent;color:#bccdbf;cursor:pointer;font:16px sans-serif;";
        remove.onclick = () => commit(read().filter((entry) => entry.id !== row.id));
        item.append(handle, play, details, toggle, remove);
        return item;
    }

    function sync() {
        if (disposed) return;
        if (node.flags?.collapsed) stopPlayers();
        if (renderedValue === widget.value || drag) return;
        cancelDrag();
        stopPlayers();
        for (const pending of pendingInfo.values()) pending.abort();
        pendingInfo.clear();
        try {
            rows = read();
            reconcileH3AudioOutputs(node, rows, tr("Audio · off", "Audio · 꺼짐"));
            const currentPaths = new Set(rows.map((row) => row.path));
            for (const path of infoCache.keys()) if (!currentPaths.has(path)) infoCache.delete(path);
            let enabled = 0;
            const items = rows.map((row, index) => buildRow(row, index, row.enabled ? ++enabled : null));
            list.replaceChildren(...items);
            if (!items.length) {
                const empty = document.createElement("div");
                empty.textContent = tr("Add or drop up to 3 audio files. Preview playback does not change Use.", "오디오를 최대 3개 추가하거나 여기로 드롭하세요. 미리듣기는 사용 상태를 바꾸지 않습니다.");
                empty.style.cssText = "padding:10px;color:#8fac96;border:1px dashed #355c40;border-radius:6px;";
                list.appendChild(empty);
            }
            renderedValue = widget.value;
            setStatus("");
            setOpen(node.properties[AUDIO_OPEN] ?? rows.length > 0, false);
            updateConnectionNote();
            items.forEach((item, index) => loadInfo(rows[index], item));
        } catch (error) {
            // Preserve the invalid serialized field and connections for recovery.
            renderedValue = widget.value;
            list.replaceChildren();
            setOpen(true, false);
            setStatus(localError(error));
        }
    }

    function appendAudio(paths) {
        const current = read();
        const available = MAX_AUDIO - current.length;
        const wanted = paths.filter((path) => AUDIO_EXTENSION.test(path));
        const next = current.concat(wanted.slice(0, available).map((path) => ({
            id: createH3AudioId(), path, enabled: true,
        })));
        if (next.length > current.length) {
            node.properties[AUDIO_OPEN] = true;
            commit(next);
        }
        if (wanted.length > available) setStatus(tr("MiniMax H3 accepts up to 3 saved audio files. Remove an audio row to add another.", "MiniMax H3 오디오는 최대 3개입니다. 새 파일을 추가하려면 기존 오디오를 제거하세요."));
    }

    async function uploadFiles(files) {
        if (uploading || disposed) return;
        const candidates = Array.from(files || []);
        const audio = candidates.filter(validAudioFile);
        if (!audio.length) { setStatus(tr("Choose an audio file such as WAV, MP3, or FLAC. Video files are not supported here.", "WAV, MP3, FLAC 등 오디오 파일을 선택하세요. 비디오는 지원하지 않습니다.")); return; }
        const generation = ++uploadGeneration;
        uploading = true;
        upload.disabled = true;
        upload.textContent = tr("Uploading…", "업로드 중…");
        const paths = [];
        let failed = 0;
        try {
            const available = Math.max(0, MAX_AUDIO - read().length);
            for (const file of audio.slice(0, available)) {
                if (disposed || generation !== uploadGeneration) break;
                try {
                    const data = new FormData();
                    data.append("image", file);
                    data.append("subfolder", "deno-h3-reference-audio");
                    const response = await api.fetchApi("/upload/image", { method: "POST", body: data });
                    const payload = await response.json();
                    if (!response.ok || !payload.name) throw new Error("Upload failed");
                    paths.push(payload.subfolder ? `${payload.subfolder}/${payload.name}` : payload.name);
                } catch { failed += 1; }
            }
            if (!disposed && generation === uploadGeneration) {
                appendAudio(paths);
                const messages = [];
                if (audio.length > available) messages.push(tr("MiniMax H3 accepts up to 3 saved audio files.", "MiniMax H3 오디오는 최대 3개입니다."));
                if (failed) messages.push(tr(`${failed} audio file(s) could not be uploaded. Try Add audio again.`, `${failed}개 파일을 업로드하지 못했습니다. 오디오 추가로 다시 시도하세요.`));
                if (audio.length !== candidates.length) messages.push(tr("Non-audio files were skipped.", "오디오가 아닌 파일은 제외했습니다."));
                if (messages.length) setStatus(messages.join(" "));
            }
        } catch (error) {
            if (!disposed) setStatus(localError(error));
        } finally {
            uploading = false;
            upload.disabled = false;
            upload.textContent = tr("Add audio", "오디오 추가");
            fileInput.value = "";
        }
    }
    upload.onclick = () => fileInput.click();
    fileInput.onchange = (event) => uploadFiles(event.target.files);
    clear.onclick = () => {
        uploadGeneration += 1;
        // Clear is the explicit recovery action for an unreadable saved list.
        commit([]);
    };
    section.addEventListener("dragover", (event) => {
        if (!event.dataTransfer?.types?.includes("Files")) return;
        event.preventDefault();
        event.stopPropagation();
        section.style.borderColor = "#94f7af";
    }, listeners);
    section.addEventListener("dragleave", () => { section.style.borderColor = "#244933"; }, listeners);
    section.addEventListener("drop", (event) => {
        if (!event.dataTransfer?.files?.length) return;
        event.preventDefault();
        event.stopPropagation();
        section.style.borderColor = "#244933";
        uploadFiles(event.dataTransfer.files);
    }, listeners);

    async function showInputFolder() {
        modalCleanup?.();
        const controller = new AbortController();
        let request = null;
        let generation = 0;
        const selected = new Set();
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:#0008;";
        const modal = document.createElement("div");
        modal.style.cssText = "display:flex;flex-direction:column;gap:10px;width:min(600px,90vw);max-height:75vh;padding:16px;background:#07150d;color:#dfffea;border:1px solid #467d53;border-radius:12px;font:12px sans-serif;overflow:hidden;";
        const heading = document.createElement("div");
        heading.style.cssText = "display:flex;align-items:center;gap:8px;";
        const title = document.createElement("strong");
        title.textContent = tr("Add audio from ComfyUI input folder", "ComfyUI Input 폴더에서 오디오 추가");
        title.style.flex = "1";
        const close = createActionButton(tr("Close", "닫기"));
        const up = createActionButton(tr("Up", "상위 폴더"));
        const add = createActionButton(tr("Add selected", "선택한 오디오 추가"));
        add.disabled = true;
        const pathLabel = document.createElement("div");
        const message = document.createElement("div");
        const entries = document.createElement("div");
        entries.style.cssText = "display:flex;flex-direction:column;gap:5px;overflow-y:auto;min-height:80px;";
        const controls = document.createElement("div");
        controls.style.cssText = "display:flex;gap:8px;";
        controls.append(up, add);
        heading.append(title, close);
        modal.append(heading, pathLabel, message, entries, controls);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        const cleanup = () => {
            controller.abort();
            request?.abort();
            overlay.remove();
            if (modalCleanup === cleanup) modalCleanup = null;
        };
        modalCleanup = cleanup;
        close.onclick = cleanup;
        overlay.onclick = (event) => { if (event.target === overlay) cleanup(); };
        window.addEventListener("keydown", (event) => { if (event.key === "Escape") cleanup(); }, { signal: controller.signal });
        add.onclick = () => {
            try { appendAudio([...selected]); cleanup(); } catch (error) { message.textContent = localError(error); }
        };
        const load = async (path = "") => {
            request?.abort();
            request = new AbortController();
            const revision = ++generation;
            message.textContent = tr("Reading input folder…", "Input 폴더 읽는 중…");
            entries.replaceChildren();
            try {
                const response = await api.fetchApi(`/deno/h3/input-audios?path=${encodeURIComponent(path)}`, {
                    cache: "no-store", signal: request.signal,
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || `Input folder failed (${response.status})`);
                if (revision !== generation || controller.signal.aborted) return;
                pathLabel.textContent = `input/${payload.path || ""}`;
                up.disabled = !payload.path;
                up.onclick = () => load(payload.parent || "");
                message.textContent = payload.notice || tr(`${payload.files?.length || 0} audio file(s). Select up to ${MAX_AUDIO - read().length}.`, `오디오 ${payload.files?.length || 0}개 · 최대 ${MAX_AUDIO - read().length}개 선택할 수 있습니다.`);
                for (const folder of payload.folders || []) {
                    const button = createActionButton(`${tr("Folder", "폴더")} · ${folder.name}`);
                    button.onclick = () => load(folder.path);
                    entries.appendChild(button);
                }
                for (const file of payload.files || []) {
                    const name = typeof file === "string" ? file : file.name;
                    const button = createActionButton(`${selected.has(name) ? "✓ " : ""}${file.display_name || name}`);
                    button.setAttribute("aria-pressed", String(selected.has(name)));
                    button.onclick = () => {
                        if (selected.has(name)) selected.delete(name);
                        else if (selected.size < MAX_AUDIO - read().length) selected.add(name);
                        else { message.textContent = tr("MiniMax H3 accepts up to 3 saved audio files.", "MiniMax H3 오디오는 최대 3개입니다."); return; }
                        button.textContent = `${selected.has(name) ? "✓ " : ""}${file.display_name || name}`;
                        button.setAttribute("aria-pressed", String(selected.has(name)));
                        add.disabled = selected.size === 0;
                        add.textContent = tr(`Add selected (${selected.size})`, `선택한 오디오 추가 (${selected.size})`);
                    };
                    entries.appendChild(button);
                }
            } catch (error) {
                if (controller.signal.aborted || revision !== generation || error.name === "AbortError") return;
                message.textContent = `${localError(error)}. ${tr("Close and reopen Input Folder to retry.", "닫고 Input 폴더를 다시 열어 시도하세요.")}`;
            }
        };
        await load();
    }
    inputFolder.onclick = showInputFolder;

    const originalDraw = node.onDrawBackground;
    node.onDrawBackground = function () {
        const result = originalDraw?.apply(this, arguments);
        sync();
        updateConnectionNote();
        return result;
    };
    const originalConfigure = node.onConfigure;
    node.onConfigure = function () {
        const result = originalConfigure?.apply(this, arguments);
        renderedValue = unrendered;
        queueMicrotask(sync);
        return result;
    };
    const originalCollapse = node.collapse;
    if (typeof originalCollapse === "function") {
        node.collapse = function () {
            const result = originalCollapse.apply(this, arguments);
            if (this.flags?.collapsed) {
                cancelDrag();
                stopPlayers();
            }
            return result;
        };
    }
    const originalDrawCollapsed = node.onDrawCollapsed;
    node.onDrawCollapsed = function () {
        cancelDrag();
        stopPlayers();
        return originalDrawCollapsed?.apply(this, arguments);
    };
    const originalRemoved = node.onRemoved;
    node.onRemoved = function () {
        disposed = true;
        uploadGeneration += 1;
        lifecycle.abort();
        modalCleanup?.();
        cancelDrag();
        stopPlayers();
        for (const pending of pendingInfo.values()) pending.abort();
        pendingInfo.clear();
        section.remove();
        originalRemoved?.apply(this, arguments);
    };
    node.__denoH3Audio = { sync, section };
    sync();
    // configure() restores serialized widgets after creation in older clients.
    queueMicrotask(sync);
}
