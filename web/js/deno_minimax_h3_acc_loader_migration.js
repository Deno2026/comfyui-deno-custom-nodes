import { app } from "../../scripts/app.js";

const NODE_NAME = "DenoMiniMaxH3AccLoader";
const EXTENSION_NAME = "Deno.MiniMaxH3AccLoaderSavedWorkflowCompatibility";
const K_SAMPLER_NODE_TYPE = "KSamplerSelect";
const BASIC_SCHEDULER_NODE_TYPE = "BasicScheduler";
const LINK_FORM_ARRAY = "array";
const LINK_FORM_OBJECT = "object";

function isIntegerId(value) {
    return typeof value === "number" && Number.isSafeInteger(value);
}

function isSlotIndex(value) {
    return isIntegerId(value) && value >= 0;
}

function isLinkArray(link) {
    return Array.isArray(link);
}

function getLinkId(link, shape) {
    return shape === LINK_FORM_ARRAY ? link[0] : link.id;
}

function getLinkOriginId(link, shape) {
    return shape === LINK_FORM_ARRAY ? link[1] : link.origin_id;
}

function getLinkOriginSlot(link, shape) {
    return shape === LINK_FORM_ARRAY ? link[2] : link.origin_slot;
}

function getLinkTargetId(link, shape) {
    return shape === LINK_FORM_ARRAY ? link[3] : link.target_id;
}

function getLinkTargetSlot(link, shape) {
    return shape === LINK_FORM_ARRAY ? link[4] : link.target_slot;
}

function getLinkType(link, shape) {
    return shape === LINK_FORM_ARRAY ? link[5] : link.type;
}

function setLinkOrigin(link, shape, originId, originSlot) {
    if (shape === LINK_FORM_ARRAY) {
        link[1] = originId;
        link[2] = originSlot;
        return;
    }
    link.origin_id = originId;
    link.origin_slot = originSlot;
}

function getLinkShape(links) {
    if (!Array.isArray(links)) {
        return null;
    }
    if (links.length === 0) {
        return LINK_FORM_ARRAY;
    }

    const shape = isLinkArray(links[0]) ? LINK_FORM_ARRAY : LINK_FORM_OBJECT;
    for (const link of links) {
        if (shape === LINK_FORM_ARRAY) {
            if (!isLinkArray(link) || link.length < 6 || typeof link[5] !== "string") {
                return null;
            }
        } else if (
            !link ||
            typeof link !== "object" ||
            isLinkArray(link) ||
            typeof link.type !== "string"
        ) {
            return null;
        }
    }
    return shape;
}

function readNestedIdMaxima(graphData) {
    const definitions = graphData?.definitions;
    if (definitions == null) {
        return { maxNodeId: -1, maxLinkId: -1 };
    }
    if (!definitions || typeof definitions !== "object" || Array.isArray(definitions)) {
        return null;
    }

    const subgraphs = definitions.subgraphs;
    if (subgraphs == null) {
        return { maxNodeId: -1, maxLinkId: -1 };
    }
    if (!Array.isArray(subgraphs)) {
        return null;
    }

    let maxNodeId = -1;
    let maxLinkId = -1;

    const visitSubgraphs = (items) => {
        for (const subgraph of items) {
            if (
                !subgraph ||
                typeof subgraph !== "object" ||
                !Array.isArray(subgraph.nodes) ||
                !Array.isArray(subgraph.links)
            ) {
                return false;
            }

            for (const node of subgraph.nodes) {
                if (!node || !isIntegerId(node.id)) {
                    return false;
                }
                if (node.id >= 0) {
                    maxNodeId = Math.max(maxNodeId, node.id);
                }
            }

            for (const link of subgraph.links) {
                const linkId = Array.isArray(link) ? link[0] : link?.id;
                if (!isIntegerId(linkId)) {
                    return false;
                }
                if (linkId >= 0) {
                    maxLinkId = Math.max(maxLinkId, linkId);
                }
            }

            const state = subgraph.state;
            if (state != null && (!state || typeof state !== "object" || Array.isArray(state))) {
                return false;
            }
            for (const value of [
                state?.lastNodeId,
                state?.lastLinkId,
                subgraph.last_node_id,
                subgraph.last_link_id,
            ]) {
                if (value != null && !isIntegerId(value)) {
                    return false;
                }
            }
            if (state?.lastNodeId >= 0) {
                maxNodeId = Math.max(maxNodeId, state.lastNodeId);
            }
            if (state?.lastLinkId >= 0) {
                maxLinkId = Math.max(maxLinkId, state.lastLinkId);
            }
            if (subgraph.last_node_id >= 0) {
                maxNodeId = Math.max(maxNodeId, subgraph.last_node_id);
            }
            if (subgraph.last_link_id >= 0) {
                maxLinkId = Math.max(maxLinkId, subgraph.last_link_id);
            }

            const nested = subgraph.definitions?.subgraphs;
            if (nested != null) {
                if (!Array.isArray(nested) || !visitSubgraphs(nested)) {
                    return false;
                }
            }
        }
        return true;
    };

    return visitSubgraphs(subgraphs) ? { maxNodeId, maxLinkId } : null;
}

function buildGraphState(graphData, linkShape) {
    if (
        graphData.version !== 0.4 ||
        !Array.isArray(graphData.nodes) ||
        !Array.isArray(graphData.links)
    ) {
        return null;
    }
    if (
        (graphData.last_node_id != null && !isIntegerId(graphData.last_node_id)) ||
        (graphData.last_link_id != null && !isIntegerId(graphData.last_link_id))
    ) {
        return null;
    }

    const nestedIdMaxima = readNestedIdMaxima(graphData);
    if (!nestedIdMaxima) {
        return null;
    }

    const nodesById = new Map();
    let maxNodeId = -1;
    let maxOrder = -1;
    for (const node of graphData.nodes) {
        if (!node || !isIntegerId(node.id) || nodesById.has(node.id)) {
            return null;
        }
        nodesById.set(node.id, node);
        maxNodeId = Math.max(maxNodeId, node.id);
        if (typeof node.order === "number" && Number.isFinite(node.order)) {
            maxOrder = Math.max(maxOrder, node.order);
        }
    }

    const linksById = new Map();
    let maxLinkId = -1;
    for (const link of graphData.links) {
        const linkId = getLinkId(link, linkShape);
        const endpointIds = linkShape === LINK_FORM_ARRAY
            ? [link[1], link[3]]
            : [link.origin_id, link.target_id];
        const endpointSlots = linkShape === LINK_FORM_ARRAY
            ? [link[2], link[4]]
            : [link.origin_slot, link.target_slot];
        if (
            !isIntegerId(linkId) ||
            endpointIds.some((value) => !isIntegerId(value)) ||
            endpointSlots.some((value) => !isSlotIndex(value)) ||
            linksById.has(linkId)
        ) {
            return null;
        }
        linksById.set(linkId, link);
        maxLinkId = Math.max(maxLinkId, linkId);
    }

    return {
        nodesById,
        linksById,
        maxNodeId: Math.max(
            maxNodeId,
            graphData.last_node_id ?? -1,
            nestedIdMaxima.maxNodeId,
        ),
        maxLinkId: Math.max(
            maxLinkId,
            graphData.last_link_id ?? -1,
            nestedIdMaxima.maxLinkId,
        ),
        maxOrder,
    };
}

function isExactLegacyMiniMaxH3AccNode(node) {
    const inputs = node?.inputs;
    const hasModelInput =
        Array.isArray(inputs) &&
        inputs[0]?.name === "model" &&
        inputs[0]?.type === "MODEL";
    const hasKnownInputLayout =
        hasModelInput &&
        (
            inputs.length === 1 ||
            (
                inputs.length === 2 &&
                inputs[1]?.name === "acc_lora" &&
                inputs[1]?.type === "COMBO" &&
                inputs[1]?.widget?.name === "acc_lora"
            )
        );
    return Boolean(
        node?.type === NODE_NAME &&
        (node.mode == null || node.mode === 0) &&
        hasKnownInputLayout &&
        Array.isArray(node.outputs) &&
        node.outputs.length === 3 &&
        node.outputs[0]?.name === "model" &&
        node.outputs[0]?.type === "MODEL" &&
        node.outputs[1]?.name === "sampler" &&
        node.outputs[1]?.type === "SAMPLER" &&
        node.outputs[2]?.name === "sigmas" &&
        node.outputs[2]?.type === "SIGMAS"
    );
}

function isCompatibleSocketType(actualType, expectedType) {
    return actualType === expectedType || actualType === "*";
}

function linkIdSetsMatch(serializedIds, records, linkShape) {
    if (serializedIds.length !== records.length) {
        return false;
    }
    const serializedSet = new Set(serializedIds);
    if (serializedSet.size !== serializedIds.length) {
        return false;
    }
    return records.every((record) => serializedSet.has(getLinkId(record, linkShape)));
}

function canAllocateIds(startId, count) {
    return count === 0 || (
        isIntegerId(startId) &&
        isIntegerId(startId + count - 1)
    );
}

function validateInputLink(loaderNode, slot, expectedType, graphState, linkShape) {
    const input = loaderNode.inputs?.[slot];
    if (!input || (input.link != null && !isIntegerId(input.link))) {
        return false;
    }

    const incoming = [...graphState.linksById.values()].filter(
        (record) =>
            getLinkTargetId(record, linkShape) === loaderNode.id &&
            getLinkTargetSlot(record, linkShape) === slot,
    );
    if (input.link == null) {
        return incoming.length === 0;
    }
    if (
        incoming.length !== 1 ||
        getLinkId(incoming[0], linkShape) !== input.link ||
        getLinkType(incoming[0], linkShape) !== expectedType
    ) {
        return false;
    }

    const record = incoming[0];
    const originNode = graphState.nodesById.get(getLinkOriginId(record, linkShape));
    const originSlot = getLinkOriginSlot(record, linkShape);
    const originOutput = originNode?.outputs?.[originSlot];
    if (
        !originNode ||
        !isSlotIndex(originSlot) ||
        !originOutput ||
        !isCompatibleSocketType(originOutput.type, expectedType) ||
        !Array.isArray(originOutput.links)
    ) {
        return false;
    }

    const outgoing = [...graphState.linksById.values()].filter(
        (outgoingRecord) =>
            getLinkOriginId(outgoingRecord, linkShape) === originNode.id &&
            getLinkOriginSlot(outgoingRecord, linkShape) === originSlot,
    );
    if (!linkIdSetsMatch(originOutput.links, outgoing, linkShape)) {
        return false;
    }

    const targetSockets = new Set();
    for (const outgoingRecord of outgoing) {
        const linkId = getLinkId(outgoingRecord, linkShape);
        const targetId = getLinkTargetId(outgoingRecord, linkShape);
        const targetSlot = getLinkTargetSlot(outgoingRecord, linkShape);
        const targetNode = graphState.nodesById.get(targetId);
        const targetInput = isSlotIndex(targetSlot) ? targetNode?.inputs?.[targetSlot] : null;
        const targetKey = `${targetId}:${targetSlot}`;
        if (
            getLinkType(outgoingRecord, linkShape) !== expectedType ||
            !targetInput ||
            targetInput.link !== linkId ||
            !isCompatibleSocketType(targetInput.type, expectedType) ||
            targetSockets.has(targetKey)
        ) {
            return false;
        }
        targetSockets.add(targetKey);
    }
    return true;
}

function readOutputLinks(loaderNode, slot, expectedType, graphState, linkShape) {
    const output = loaderNode.outputs[slot];
    if (output.links !== null && !Array.isArray(output.links)) {
        return null;
    }

    const linkIds = output.links ?? [];
    if (linkIds.some((linkId) => !isIntegerId(linkId))) {
        return null;
    }

    const outgoing = [...graphState.linksById.values()].filter(
        (record) =>
            getLinkOriginId(record, linkShape) === loaderNode.id &&
            getLinkOriginSlot(record, linkShape) === slot,
    );
    if (!linkIdSetsMatch(linkIds, outgoing, linkShape)) {
        return null;
    }

    const records = [];
    const targetSockets = new Set();
    for (const linkId of linkIds) {
        const record = graphState.linksById.get(linkId);
        const targetId = record ? getLinkTargetId(record, linkShape) : null;
        const targetSlot = record ? getLinkTargetSlot(record, linkShape) : null;
        const targetNode = graphState.nodesById.get(targetId);
        const targetInput = isSlotIndex(targetSlot) ? targetNode?.inputs?.[targetSlot] : null;
        const targetKey = `${targetId}:${targetSlot}`;
        if (
            !record ||
            getLinkOriginId(record, linkShape) !== loaderNode.id ||
            getLinkOriginSlot(record, linkShape) !== slot ||
            getLinkType(record, linkShape) !== expectedType ||
            !targetNode ||
            !targetInput ||
            targetInput.link !== linkId ||
            !isCompatibleSocketType(targetInput.type, expectedType) ||
            targetSockets.has(targetKey)
        ) {
            return null;
        }
        targetSockets.add(targetKey);
        records.push(record);
    }
    return { linkIds: [...linkIds], records };
}

function createLinkRecord(id, originId, targetId, linkShape) {
    if (linkShape === LINK_FORM_ARRAY) {
        return [id, originId, 0, targetId, 0, "MODEL"];
    }
    return {
        id,
        origin_id: originId,
        origin_slot: 0,
        target_id: targetId,
        target_slot: 0,
        type: "MODEL",
    };
}

function createKSamplerNode(id, pos, order, linkIds) {
    return {
        id,
        type: K_SAMPLER_NODE_TYPE,
        pos,
        size: [270, 58],
        flags: {},
        order,
        mode: 0,
        inputs: [
            {
                localized_name: "sampler_name",
                name: "sampler_name",
                type: "COMBO",
                widget: { name: "sampler_name" },
                link: null,
            },
        ],
        outputs: [
            {
                localized_name: "SAMPLER",
                name: "SAMPLER",
                type: "SAMPLER",
                slot_index: 0,
                links: [...linkIds],
            },
        ],
        properties: {
            "Node name for S&R": K_SAMPLER_NODE_TYPE,
        },
        widgets_values: ["euler"],
        widgets_values_named: { sampler_name: "euler" },
    };
}

function createBasicSchedulerNode(id, pos, order, linkIds, modelLinkId) {
    return {
        id,
        type: BASIC_SCHEDULER_NODE_TYPE,
        pos,
        size: [270, 106],
        flags: {},
        order,
        mode: 0,
        inputs: [
            {
                localized_name: "model",
                name: "model",
                type: "MODEL",
                link: modelLinkId,
            },
            {
                localized_name: "scheduler",
                name: "scheduler",
                type: "COMBO",
                widget: { name: "scheduler" },
                link: null,
            },
            {
                localized_name: "steps",
                name: "steps",
                type: "INT",
                widget: { name: "steps" },
                link: null,
            },
            {
                localized_name: "denoise",
                name: "denoise",
                type: "FLOAT",
                widget: { name: "denoise" },
                link: null,
            },
        ],
        outputs: [
            {
                localized_name: "SIGMAS",
                name: "SIGMAS",
                type: "SIGMAS",
                slot_index: 0,
                links: [...linkIds],
            },
        ],
        properties: {
            "Node name for S&R": BASIC_SCHEDULER_NODE_TYPE,
        },
        widgets_values: ["simple", 8, 1],
        widgets_values_named: { scheduler: "simple", steps: 8, denoise: 1 },
    };
}

function migrateLegacyMiniMaxH3AccGraph(graphData) {
    if (!Array.isArray(graphData?.nodes)) {
        return 0;
    }
    const candidates = graphData.nodes.filter(isExactLegacyMiniMaxH3AccNode);
    if (candidates.length === 0) {
        return 0;
    }

    const linkShape = getLinkShape(graphData?.links);
    if (!linkShape) {
        return 0;
    }
    const graphState = buildGraphState(graphData, linkShape);
    if (!graphState) {
        return 0;
    }

    let nextNodeId = graphState.maxNodeId + 1;
    let nextLinkId = graphState.maxLinkId + 1;
    let nextOrder = graphState.maxOrder + 1;
    const plans = [];

    for (const loaderNode of candidates) {
        if (!validateInputLink(loaderNode, 0, "MODEL", graphState, linkShape)) {
            continue;
        }
        const modelOutput = readOutputLinks(loaderNode, 0, "MODEL", graphState, linkShape);
        const samplerOutput = readOutputLinks(loaderNode, 1, "SAMPLER", graphState, linkShape);
        const sigmasOutput = readOutputLinks(loaderNode, 2, "SIGMAS", graphState, linkShape);
        if (!modelOutput || !samplerOutput || !sigmasOutput) {
            continue;
        }

        const x = Number.isFinite(Number(loaderNode.pos?.[0])) ? Number(loaderNode.pos[0]) : 0;
        const y = Number.isFinite(Number(loaderNode.pos?.[1])) ? Number(loaderNode.pos[1]) : 0;
        const height = Number.isFinite(Number(loaderNode.size?.[1]))
            ? Math.max(0, Number(loaderNode.size[1]))
            : 82;
        let addedY = y + height + 40;
        let samplerNode = null;
        let schedulerNode = null;
        let schedulerModelLink = null;

        const requiredNodeIds = Number(samplerOutput.linkIds.length > 0) +
            Number(sigmasOutput.linkIds.length > 0);
        const requiredLinkIds = Number(sigmasOutput.linkIds.length > 0);
        if (
            !canAllocateIds(nextNodeId, requiredNodeIds) ||
            !canAllocateIds(nextLinkId, requiredLinkIds)
        ) {
            continue;
        }

        if (samplerOutput.linkIds.length > 0) {
            samplerNode = createKSamplerNode(
                nextNodeId,
                [x, addedY],
                nextOrder,
                samplerOutput.linkIds,
            );
            nextNodeId += 1;
            nextOrder += 1;
            addedY += 98;
        }
        if (sigmasOutput.linkIds.length > 0) {
            const modelLinkId = nextLinkId;
            nextLinkId += 1;
            schedulerNode = createBasicSchedulerNode(
                nextNodeId,
                [x, addedY],
                nextOrder,
                sigmasOutput.linkIds,
                modelLinkId,
            );
            nextNodeId += 1;
            nextOrder += 1;
            schedulerModelLink = createLinkRecord(
                modelLinkId,
                loaderNode.id,
                schedulerNode.id,
                linkShape,
            );
        }

        plans.push({
            loaderNode,
            modelOutput: loaderNode.outputs[0],
            samplerOutput,
            sigmasOutput,
            samplerNode,
            schedulerNode,
            schedulerModelLink,
        });
    }

    if (plans.length === 0) {
        return 0;
    }

    const addedNodes = [];
    const addedLinks = [];
    for (const plan of plans) {
        if (plan.samplerNode) {
            for (const record of plan.samplerOutput.records) {
                setLinkOrigin(record, linkShape, plan.samplerNode.id, 0);
            }
            addedNodes.push(plan.samplerNode);
        }
        if (plan.schedulerNode) {
            for (const record of plan.sigmasOutput.records) {
                setLinkOrigin(record, linkShape, plan.schedulerNode.id, 0);
            }
            const modelLinks = plan.modelOutput.links ?? [];
            modelLinks.push(getLinkId(plan.schedulerModelLink, linkShape));
            plan.modelOutput.links = modelLinks;
            addedNodes.push(plan.schedulerNode);
            addedLinks.push(plan.schedulerModelLink);
        }
        plan.loaderNode.outputs = [plan.modelOutput];
    }

    graphData.nodes.push(...addedNodes);
    graphData.links.push(...addedLinks);
    graphData.last_node_id = Math.max(graphState.maxNodeId, nextNodeId - 1);
    graphData.last_link_id = Math.max(graphState.maxLinkId, nextLinkId - 1);
    return plans.length;
}

app.registerExtension({
    name: EXTENSION_NAME,

    beforeConfigureGraph(graphData) {
        try {
            migrateLegacyMiniMaxH3AccGraph(graphData);
        } catch (error) {
            console.warn(`[${EXTENSION_NAME}] Saved workflow migration failed.`, error);
        }
    },
});

if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.__DENO_MINIMAX_H3_ACC_MIGRATION_TEST_HOOK__ === "function"
) {
    globalThis.__DENO_MINIMAX_H3_ACC_MIGRATION_TEST_HOOK__({
        EXTENSION_NAME,
        NODE_NAME,
        isExactLegacyMiniMaxH3AccNode,
        migrateLegacyMiniMaxH3AccGraph,
    });
}
