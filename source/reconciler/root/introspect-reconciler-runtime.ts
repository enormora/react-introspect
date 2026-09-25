import { AsyncLocalStorage } from 'node:async_hooks';
import type { IntrospectionRuntimeDependencies } from '../../runtime/view/introspect-runtime-dependencies.ts';

type IntrospectionTimeoutIdentifier = ReturnType<IntrospectionRuntimeDependencies['clock']['setTimeout']>;

const runtimeStorage = new AsyncLocalStorage<IntrospectionRuntimeDependencies>();

function currentRuntime(): IntrospectionRuntimeDependencies {
    const runtime = runtimeStorage.getStore();

    if (runtime === undefined) {
        throw new Error('Expected Introspection runtime dependencies.');
    }

    return runtime;
}

export function enterIntrospectionRuntime(runtime: IntrospectionRuntimeDependencies): void {
    runtimeStorage.enterWith(runtime);
}

export function runWithIntrospectionRuntime<Result>(
    runtime: IntrospectionRuntimeDependencies,
    action: () => Result
): Result {
    return runtimeStorage.run(runtime, action);
}

export function cancelIntrospectionTimeout(timeoutIdentifier: IntrospectionTimeoutIdentifier): void {
    currentRuntime().clock.clearTimeout(timeoutIdentifier);
}

export function readIntrospectionEventTimestamp(): number {
    return currentRuntime().clock.currentUnixEpochMilliseconds;
}

export function scheduleIntrospectionMicrotask(action: () => void): void {
    const runtime = currentRuntime();

    runtime.microtasks.schedule(function runMicrotask() {
        runWithIntrospectionRuntime(runtime, action);
    });
}

export function scheduleIntrospectionTimeout<HandlerArguments extends readonly unknown[]>(
    handler: (...handlerArguments: HandlerArguments) => void,
    delayInMilliseconds: number,
    ...handlerArguments: HandlerArguments
): IntrospectionTimeoutIdentifier {
    return currentRuntime().clock.setTimeout(handler, delayInMilliseconds, ...handlerArguments);
}
