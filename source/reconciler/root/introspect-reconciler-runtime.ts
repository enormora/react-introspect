import { AsyncLocalStorage } from 'node:async_hooks';
import type { IntrospectionRuntimeDependencies } from '../../runtime/view/introspect-runtime-dependencies-types.ts';

type IntrospectionTimeoutIdentifier = ReturnType<IntrospectionRuntimeDependencies['clock']['setTimeout']>;

export type IntrospectionReconcilerRuntime = {
    readonly cancelTimeout: (timeoutIdentifier: IntrospectionTimeoutIdentifier) => void;
    readonly enter: (runtime: IntrospectionRuntimeDependencies) => void;
    readonly readEventTimestamp: () => number;
    readonly run: <Result>(runtime: IntrospectionRuntimeDependencies, action: () => Result) => Result;
    readonly scheduleMicrotask: (action: () => void) => void;
    readonly scheduleTimeout: <HandlerArguments extends readonly unknown[]>(
        handler: (...handlerArguments: HandlerArguments) => void,
        delayInMilliseconds: number,
        ...handlerArguments: HandlerArguments
    ) => IntrospectionTimeoutIdentifier;
};

export function createIntrospectionReconcilerRuntime(): IntrospectionReconcilerRuntime {
    const runtimeStorage = new AsyncLocalStorage<IntrospectionRuntimeDependencies>();

    function currentRuntime(): IntrospectionRuntimeDependencies {
        const runtime = runtimeStorage.getStore();

        if (runtime === undefined) {
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

    return Object.freeze({
        cancelTimeout(timeoutIdentifier) {
            currentRuntime().clock.clearTimeout(timeoutIdentifier);
        },
        enter(runtime) {
            runtimeStorage.enterWith(runtime);
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
        }
    });
}
