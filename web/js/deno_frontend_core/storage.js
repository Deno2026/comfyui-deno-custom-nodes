export function safeJsonParse(raw, fallback = null) {
    if (typeof raw !== "string" || !raw.trim()) {
        return fallback;
    }
    try {
        return JSON.parse(raw);
    } catch (_error) {
        return fallback;
    }
}

export function safeJsonStringify(value, fallback = "{}") {
    try {
        return JSON.stringify(value);
    } catch (_error) {
        return fallback;
    }
}

export function readJsonStorage(storage, key, fallback = null) {
    try {
        return safeJsonParse(storage?.getItem?.(key), fallback);
    } catch (_error) {
        return fallback;
    }
}

export function writeJsonStorage(storage, key, value) {
    try {
        storage?.setItem?.(key, JSON.stringify(value));
        return true;
    } catch (_error) {
        return false;
    }
}

export function readVersionedJsonStorage({
    storage,
    currentKey,
    legacyKeys = [],
    normalize = (value) => value,
    fallback = null,
}) {
    for (const key of [currentKey, ...legacyKeys].filter(Boolean)) {
        const parsed = readJsonStorage(storage, key, null);
        if (parsed == null) {
            continue;
        }
        try {
            return normalize(parsed, { key, legacy: key !== currentKey });
        } catch (_error) {
            continue;
        }
    }
    return fallback;
}

export function mergeLibraryByStableId(workflowItems = [], libraryItems = [], options = {}) {
    const getId = options.getId || ((item) => item?.id);
    const clone = options.clone || cloneSerializableValue;
    const byId = new Map();

    for (const item of workflowItems) {
        const id = String(getId(item) || "");
        if (id) {
            byId.set(id, clone(item));
        }
    }
    for (const item of libraryItems) {
        const id = String(getId(item) || "");
        if (id && !byId.has(id)) {
            byId.set(id, clone(item));
        }
    }

    return [...byId.values()];
}

export function promoteLibraryItem(workflowItems = [], libraryItem, options = {}) {
    const getId = options.getId || ((item) => item?.id);
    const clone = options.clone || cloneSerializableValue;
    const promoted = clone(libraryItem);
    const promotedId = String(getId(promoted) || "");
    if (!promotedId) {
        return workflowItems.map(clone);
    }

    const next = workflowItems.map(clone);
    const index = next.findIndex((item) => String(getId(item) || "") === promotedId);
    if (index >= 0) {
        next[index] = promoted;
    } else {
        next.push(promoted);
    }
    return next;
}

export function upsertLibraryItem(libraryItems = [], libraryItem, options = {}) {
    const getId = options.getId || ((item) => item?.id);
    const clone = options.clone || cloneSerializableValue;
    const upserted = clone(libraryItem);
    const upsertedId = String(getId(upserted) || "");
    const next = libraryItems.map(clone);
    if (!upsertedId) {
        return next;
    }

    const index = next.findIndex((item) => String(getId(item) || "") === upsertedId);
    if (index >= 0) {
        next[index] = upserted;
    } else {
        next.push(upserted);
    }
    return next;
}

export function cloneSerializableValue(value) {
    if (value != null && typeof value === "object") {
        return JSON.parse(JSON.stringify(value));
    }
    return value ?? null;
}
