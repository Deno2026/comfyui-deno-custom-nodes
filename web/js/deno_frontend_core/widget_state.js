export function findWidget(node, name) {
    return (node?.widgets || []).find((widget) => widget?.name === name) || null;
}

function normalizeSpec(spec) {
    return typeof spec === "string" ? { name: spec } : spec;
}

function resolveDefault(spec) {
    if (typeof spec.defaultValue === "function") {
        return spec.defaultValue();
    }
    return spec.defaultValue;
}

function normalizeValue(spec, value, node, widget) {
    if (typeof spec.normalize === "function") {
        return spec.normalize(value, { node, widget, spec });
    }
    return value;
}

function cloneSerializableValue(value) {
    if (value != null && typeof value === "object") {
        return JSON.parse(JSON.stringify(value));
    }
    return value ?? null;
}

export function readOrderedWidgetValues(node, specs) {
    return specs.map((rawSpec) => {
        const spec = normalizeSpec(rawSpec);
        const widget = findWidget(node, spec.name);
        const value = widget ? widget.value : resolveDefault(spec);
        return normalizeValue(spec, value, node, widget);
    });
}

export function applyOrderedWidgetValues(node, specs, values) {
    if (!node || !Array.isArray(values)) {
        return;
    }

    specs.map(normalizeSpec).forEach((spec, index) => {
        const widget = findWidget(node, spec.name);
        if (widget) {
            widget.value = values[index];
        }
    });
}

export function canonicalOrderedSerializationValues(node, specs) {
    return readOrderedWidgetValues(node, specs).map(cloneSerializableValue);
}
