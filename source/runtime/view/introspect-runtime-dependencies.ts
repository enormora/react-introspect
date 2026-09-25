import { AsyncLocalStorage } from 'node:async_hooks';
import { createDeterministicClock } from '@enormora/clock/deterministic-clock';
import type { Clock } from '@enormora/clock';
import React from 'react';

const unitClockStart = 0n;
const reactActEnvironmentKey = 'IS_REACT_ACT_ENVIRONMENT';

export type IntrospectionActEnvironment = {
    readonly act: (action: () => unknown) => unknown;
};

export type IntrospectionBrowserEnvironment = {
    readonly readDocument: () => unknown;
    readonly readWindow: () => unknown;
};

export type IntrospectionMicrotasks = {
    readonly flush: () => Promise<void>;
    readonly schedule: (action: () => void) => void;
};

export type IntrospectionRuntimeDependencies = {
    readonly actEnvironment: IntrospectionActEnvironment;
    readonly browserEnvironment: IntrospectionBrowserEnvironment;
    readonly clock: Clock;
    readonly microtasks: IntrospectionMicrotasks;
};

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
