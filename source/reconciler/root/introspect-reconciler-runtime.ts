import { AsyncLocalStorage } from 'node:async_hooks';
import type { IntrospectionHostScheduling } from '../host/introspect-host-tree.ts';
import type { IntrospectionRuntimeDependencies } from '../scheduling/introspect-runtime-dependencies-types.ts';

export type IntrospectionReconcilerRuntime = IntrospectionHostScheduling & {
    readonly run: <Result>(runtime: IntrospectionRuntimeDependencies, action: () => Result) => Result;
    readonly makeDefault: (runtime: IntrospectionRuntimeDependencies) => void;
};

export function createIntrospectionReconcilerRuntime(): IntrospectionReconcilerRuntime {
    const runtimeStorage = new AsyncLocalStorage<IntrospectionRuntimeDependencies>();
    let defaultRuntime: IntrospectionRuntimeDependencies | null = null;

    function currentRuntime(): IntrospectionRuntimeDependencies {
        const runtime = runtimeStorage.getStore() ?? defaultRuntime;

        if (runtime === null) {
            throw new Error('Expected Introspection runtime dependencies.');
        }

        return runtime;
    }

    function runWithRuntime<Result>(
        runtime: IntrospectionRuntimeDependencies,
        action: () => Result
    ): Result {
        return runtimeStorage.run(runtime, action);
    }

    return {
        cancelTimeout(timeoutIdentifier) {
            currentRuntime().clock.clearTimeout(timeoutIdentifier);
        },
        readEventTimestamp() {
            return currentRuntime().clock.currentUnixEpochMilliseconds;
        },
        run: runWithRuntime,
        scheduleMicrotask(action) {
            const runtime = currentRuntime();

            runtime.microtasks.schedule(function runMicrotask() {
                runWithRuntime(runtime, action);
            });
        },
        scheduleTimeout(handler, delayInMilliseconds, ...handlerArguments) {
            return currentRuntime().clock.setTimeout(handler, delayInMilliseconds, ...handlerArguments);
        },
        makeDefault(runtime) {
            defaultRuntime = runtime;
        }
    };
}
