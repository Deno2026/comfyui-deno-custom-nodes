const NODE_LIFECYCLE_KEY = Symbol.for("deno.frontend.lifecycle.node");

function ensureNodeLifecycle(node) {
    if (!node) {
        return null;
    }
    if (node[NODE_LIFECYCLE_KEY]) {
        return node[NODE_LIFECYCLE_KEY];
    }

    const priorOnRemoved = node.onRemoved;
    const lifecycle = {
        scopes: new Map(),
        priorOnRemoved,
        disposed: false,
    };

    Object.defineProperty(node, NODE_LIFECYCLE_KEY, {
        value: lifecycle,
        enumerable: false,
        configurable: false,
        writable: false,
    });

    node.onRemoved = function denoLifecycleOnRemoved(...args) {
        if (!lifecycle.disposed) {
            lifecycle.disposed = true;
            for (const scope of lifecycle.scopes.values()) {
                scope.dispose();
            }
        }
        return priorOnRemoved?.apply(this, args);
    };

    return lifecycle;
}

export function getNodeLifecycleScope(node, key = "default") {
    const lifecycle = ensureNodeLifecycle(node);
    if (!lifecycle) {
        return createLifecycleScope();
    }
    if (lifecycle.disposed) {
        return createDisposedLifecycleScope();
    }

    const existing = lifecycle.scopes.get(key);
    if (existing && !existing.disposed) {
        return existing;
    }

    const scope = createLifecycleScope();
    lifecycle.scopes.set(key, scope);
    scope.onDispose(() => {
        if (lifecycle.scopes.get(key) === scope) {
            lifecycle.scopes.delete(key);
        }
    });
    return scope;
}

export function createDisposedLifecycleScope() {
    let signal = null;
    const scope = {
        disposed: true,
        get signal() {
            if (!signal) {
                const controller = new AbortController();
                controller.abort();
                signal = controller.signal;
            }
            return signal;
        },
        onDispose(cleanup) {
            if (typeof cleanup === "function") {
                cleanup();
            }
            return () => {};
        },
        addEventListener() {
            return null;
        },
        observeMutation() {
            return null;
        },
        setTimeout() {
            return null;
        },
        requestAnimationFrame() {
            return null;
        },
        createAbortController() {
            const controller = new AbortController();
            controller.abort();
            return controller;
        },
        dispose() {},
    };
    Object.defineProperty(scope, "pendingCleanupCount", {
        get() {
            return 0;
        },
        enumerable: false,
    });
    return scope;
}

export function createLifecycleScope() {
    const cleanups = [];
    const removeCleanup = (cleanup) => {
        const index = cleanups.indexOf(cleanup);
        if (index >= 0) {
            cleanups.splice(index, 1);
        }
    };
    const scope = {
        disposed: false,
        get signal() {
            if (!scope._controller) {
                scope._controller = new AbortController();
                scope.onDispose(() => scope._controller?.abort());
            }
            return scope._controller.signal;
        },
        onDispose(cleanup) {
            if (typeof cleanup !== "function") {
                return cleanup;
            }
            if (scope.disposed) {
                cleanup();
                return () => {};
            }
            cleanups.push(cleanup);
            return () => removeCleanup(cleanup);
        },
        addEventListener(target, type, listener, options) {
            if (!target?.addEventListener || !target?.removeEventListener || scope.disposed) {
                return listener;
            }
            target.addEventListener(type, listener, options);
            scope.onDispose(() => target.removeEventListener(type, listener, options));
            return listener;
        },
        observeMutation(target, callback, options) {
            if (typeof MutationObserver === "undefined" || !target || scope.disposed) {
                return null;
            }
            const observer = new MutationObserver(callback);
            observer.observe(target, options);
            scope.onDispose(() => observer.disconnect());
            return observer;
        },
        setTimeout(callback, delay = 0) {
            if (scope.disposed) {
                return null;
            }
            let unregisterCleanup = () => {};
            const id = setTimeout(() => {
                unregisterCleanup();
                if (!scope.disposed) {
                    callback();
                }
            }, delay);
            unregisterCleanup = scope.onDispose(() => clearTimeout(id));
            return id;
        },
        requestAnimationFrame(callback) {
            if (scope.disposed || typeof requestAnimationFrame !== "function") {
                return null;
            }
            let unregisterCleanup = () => {};
            const id = requestAnimationFrame((time) => {
                unregisterCleanup();
                if (!scope.disposed) {
                    callback(time);
                }
            });
            unregisterCleanup = scope.onDispose(() => cancelAnimationFrame(id));
            return id;
        },
        createAbortController() {
            const controller = new AbortController();
            scope.onDispose(() => controller.abort());
            return controller;
        },
        dispose() {
            if (scope.disposed) {
                return;
            }
            scope.disposed = true;
            while (cleanups.length) {
                const cleanup = cleanups.pop();
                try {
                    cleanup();
                } catch (error) {
                    console.warn?.("[DENO] lifecycle cleanup failed:", error);
                }
            }
        },
    };
    Object.defineProperty(scope, "pendingCleanupCount", {
        get() {
            return cleanups.length;
        },
        enumerable: false,
    });
    return scope;
}
