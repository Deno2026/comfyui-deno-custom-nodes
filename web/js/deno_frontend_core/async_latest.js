export function createLatestRequest(scope = null) {
    let current = null;
    let nextId = 0;

    function isCurrent(token) {
        return Boolean(token && current === token && !scope?.disposed && !token.signal.aborted);
    }

    function cancel() {
        if (current) {
            current.controller.abort();
            current = null;
        }
    }

    function begin() {
        cancel();
        if (scope?.disposed) {
            return null;
        }
        const controller = new AbortController();
        const token = {
            id: ++nextId,
            controller,
            signal: controller.signal,
        };
        current = token;
        return token;
    }

    async function run(task, handlers = {}) {
        const token = begin();
        if (!token) {
            return undefined;
        }
        try {
            const value = await task(token.signal, token);
            if (!isCurrent(token)) {
                return undefined;
            }
            const result = handlers.apply ? handlers.apply(value, token) : value;
            if (current === token) {
                current = null;
            }
            return result;
        } catch (error) {
            if (isAbortError(error) || !isCurrent(token)) {
                return undefined;
            }
            if (handlers.onError) {
                const result = handlers.onError(error, token);
                if (current === token) {
                    current = null;
                }
                return result;
            }
            if (current === token) {
                current = null;
            }
            throw error;
        }
    }

    scope?.onDispose?.(cancel);

    return {
        begin,
        cancel,
        isCurrent,
        run,
    };
}

export function isAbortError(error) {
    return error?.name === "AbortError"
        || (typeof DOMException !== "undefined" && error?.code === DOMException.ABORT_ERR);
}
