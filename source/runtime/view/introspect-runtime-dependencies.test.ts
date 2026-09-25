import { AsyncLocalStorage } from 'node:async_hooks';
import { createDeterministicClock } from '@enormora/clock/deterministic-clock';
import { suite, test } from '@overkill-dev/test';
import type { Clock } from '@enormora/clock';
import React from 'react';
import type {
    IntrospectionActEnvironment,
    IntrospectionBrowserEnvironment,
    IntrospectionMicrotasks,
    IntrospectionRuntimeDependencies
} from './introspect-runtime-dependencies-types.ts';

const unitClockStart = 0n;
const reactActEnvironmentKey = 'IS_REACT_ACT_ENVIRONMENT';

const reactActEnvironmentStorage = new AsyncLocalStorage<boolean>();
const installScopedReactActEnvironment = (function createScopedReactActEnvironmentInstaller() {
    let installed = false;

    return function installReactActEnvironmentAccessor(): void {
        if (installed) {
            return;
        }

        Object.defineProperty(globalThis, reactActEnvironmentKey, {
            configurable: true,
            get() {
                return reactActEnvironmentStorage.getStore();
            }
        });

        installed = true;
    };
})();

function createQueuedMicrotasks(): IntrospectionMicrotasks {
    let pendingActions: readonly (() => void)[] = Object.freeze([]);

    return Object.freeze({
        async flush() {
            while (pendingActions.length > 0) {
                const actions = pendingActions;

                pendingActions = Object.freeze([]);

                for (const action of actions) {
                    action();
                }
            }
        },
        schedule(action) {
            pendingActions = Object.freeze([
                ...pendingActions,
                action
            ]);
        }
    });
}

function createUnitClock(): Clock {
    return createDeterministicClock({
        initialUnixEpochMicroseconds: unitClockStart
    });
}

const unitActEnvironment: IntrospectionActEnvironment = Object.freeze({
    act(action) {
        installScopedReactActEnvironment();

        return reactActEnvironmentStorage.run(true, function runActEnvironment() {
            const results = new Set<unknown>();

            React.act(function runAction() {
                results.add(action());
            });

            return results.values().next().value;
        });
    }
});

const emptyBrowserEnvironment: IntrospectionBrowserEnvironment = Object.freeze({
    readDocument() {
        return undefined;
    },
    readWindow() {
        return undefined;
    }
});

export function createUnitRuntimeDependencies(): IntrospectionRuntimeDependencies {
    return Object.freeze({
        actEnvironment: unitActEnvironment,
        browserEnvironment: emptyBrowserEnvironment,
        clock: createUnitClock(),
        microtasks: createQueuedMicrotasks()
    });
}

export const testNode = suite('introspection runtime dependencies', [
    test('creates deterministic unit runtime dependencies', async function (scope) {
        const runtime = createUnitRuntimeDependencies();
        const microtaskEvents: string[] = [];

        runtime.microtasks.schedule(function recordFirstMicrotask() {
            microtaskEvents.push('first');
            runtime.microtasks.schedule(function recordSecondMicrotask() {
                microtaskEvents.push('second');
            });
        });

        await runtime.microtasks.flush();

        scope.assert.deepEqual({
            currentMonotonicMicroseconds: runtime.clock.currentMonotonicMicroseconds,
            currentUnixEpochMicroseconds: runtime.clock.currentUnixEpochMicroseconds,
            currentUnixEpochMilliseconds: runtime.clock.currentUnixEpochMilliseconds,
            document: runtime.browserEnvironment.readDocument(),
            window: runtime.browserEnvironment.readWindow()
        }, {
            currentMonotonicMicroseconds: 0n,
            currentUnixEpochMicroseconds: 0n,
            currentUnixEpochMilliseconds: 0,
            document: undefined,
            window: undefined
        });
        scope.assert.deepEqual(microtaskEvents, [ 'first', 'second' ]);

        return scope.assert.collect();
    }),
    test('scopes React act environment through the injected unit runtime', function (scope) {
        const runtime = createUnitRuntimeDependencies();
        const actResult = runtime.actEnvironment.act(function returnActValue() {
            return 'acted';
        });

        scope.assert.equal(actResult, 'acted');

        return scope.assert.collect();
    })
]);
