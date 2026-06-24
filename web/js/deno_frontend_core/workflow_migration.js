function cloneSerializableValue(value) {
    if (value != null && typeof value === "object") {
        return JSON.parse(JSON.stringify(value));
    }
    return value ?? null;
}

function cloneValues(values) {
    return values.map(cloneSerializableValue);
}

function isEmptyGeneratedSlot(value) {
    return value === "" || value == null;
}

const INSTALL_MARKER = Symbol.for("deno.frontend.workflow_widget_migration.installs");

function getInstallSet(prototype) {
    if (!Object.prototype.hasOwnProperty.call(prototype, INSTALL_MARKER)) {
        Object.defineProperty(prototype, INSTALL_MARKER, {
            value: new Set(),
            enumerable: false,
            configurable: false,
            writable: false,
        });
    }
    return prototype[INSTALL_MARKER];
}

function warnOnce(warnedNodes, node, message) {
    if (!node || warnedNodes.has(node)) {
        return;
    }
    warnedNodes.add(node);
    if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn(message);
    }
}

export function createExactWidgetValueShapeMigration({ canonicalCount, legacyGeneratedSlots = [] }) {
    const generatedSlots = [...legacyGeneratedSlots].sort((a, b) => a - b);
    const generatedSlotSet = new Set(generatedSlots);
    const legacyCount = canonicalCount + generatedSlots.length;

    return function normalizeSerializedWidgetValues(values) {
        if (!Array.isArray(values)) {
            return null;
        }

        if (values.length === canonicalCount) {
            return cloneValues(values);
        }

        if (values.length !== legacyCount) {
            return null;
        }

        for (const slot of generatedSlots) {
            if (!isEmptyGeneratedSlot(values[slot])) {
                return null;
            }
        }

        const canonical = [];
        for (let index = 0; index < values.length; index++) {
            if (!generatedSlotSet.has(index)) {
                canonical.push(values[index]);
            }
        }

        return canonical.length === canonicalCount ? cloneValues(canonical) : null;
    };
}

export function expandCanonicalValuesForGeneratedSlots(canonicalValues, generatedSlots, displayValue = "") {
    if (!Array.isArray(canonicalValues)) {
        return null;
    }

    const generatedSlotSet = new Set(generatedSlots);
    const expandedLength = canonicalValues.length + generatedSlotSet.size;
    const expanded = [];
    let canonicalIndex = 0;

    for (let index = 0; index < expandedLength; index++) {
        if (generatedSlotSet.has(index)) {
            expanded[index] = displayValue;
        } else {
            expanded[index] = cloneSerializableValue(canonicalValues[canonicalIndex++]);
        }
    }

    return expanded;
}

export function installWorkflowWidgetMigration(nodeType, nodeData, spec) {
    if (!nodeType?.prototype) {
        return false;
    }
    if (spec.nodeName && nodeData?.name !== spec.nodeName) {
        return false;
    }

    const installKey = spec.installKey || spec.nodeName || nodeData?.name;
    const installSet = getInstallSet(nodeType.prototype);
    if (installKey && installSet.has(installKey)) {
        return false;
    }
    if (installKey) {
        installSet.add(installKey);
    }

    const unknownConfiguredNodes = new WeakSet();
    const warnedUnknownNodes = new WeakSet();
    const priorConfigure = nodeType.prototype.configure;
    nodeType.prototype.configure = function (info) {
        const hasInfo = info != null && typeof info === "object";
        const hasOwnWidgetsValues = hasInfo && Object.prototype.hasOwnProperty.call(info, "widgets_values");
        const originalWidgetsValues = hasInfo ? info.widgets_values : undefined;
        const canonicalValues = spec.normalizeSerializedValues?.(info?.widgets_values, this, info) || null;
        const isUnknownConfiguredArray = hasOwnWidgetsValues && Array.isArray(originalWidgetsValues) && !Array.isArray(canonicalValues);

        if (Array.isArray(canonicalValues)) {
            unknownConfiguredNodes.delete(this);
            const canonicalCopy = cloneValues(canonicalValues);
            if (spec.pendingValuesKey) {
                this[spec.pendingValuesKey] = cloneValues(canonicalCopy);
            }
            if (hasInfo) {
                info.widgets_values = spec.getConfigureWidgetValues?.(this, canonicalCopy, info) || canonicalCopy;
            }
        } else if (isUnknownConfiguredArray) {
            unknownConfiguredNodes.add(this);
            if (spec.pendingValuesKey) {
                delete this[spec.pendingValuesKey];
            }
        }

        let result;
        try {
            result = priorConfigure?.apply(this, arguments);
        } finally {
            if (Array.isArray(canonicalValues) && hasInfo) {
                if (hasOwnWidgetsValues) {
                    info.widgets_values = originalWidgetsValues;
                } else {
                    delete info.widgets_values;
                }
            }
        }

        if (Array.isArray(canonicalValues)) {
            spec.applyCanonicalValues?.(this, cloneValues(canonicalValues), info);
        } else if (isUnknownConfiguredArray && spec.warnOnUnknownShape !== false) {
            warnOnce(
                warnedUnknownNodes,
                this,
                `[DENO] ${spec.nodeName || nodeData?.name || "node"} kept an unknown widgets_values shape unchanged during workflow restore.`,
            );
        }

        return result;
    };

    const priorOnSerialize = nodeType.prototype.onSerialize;
    nodeType.prototype.onSerialize = function (serialized) {
        const result = priorOnSerialize?.apply(this, arguments);
        if (unknownConfiguredNodes.has(this)) {
            return result;
        }
        const canonicalValues = spec.getCanonicalSerializationValues?.(this, serialized) || null;
        if (Array.isArray(canonicalValues)) {
            serialized.widgets_values = cloneValues(canonicalValues);
            if (spec.syncNodeWidgetsValues !== false) {
                this.widgets_values = cloneValues(canonicalValues);
            }
        }
        return result;
    };

    return true;
}
