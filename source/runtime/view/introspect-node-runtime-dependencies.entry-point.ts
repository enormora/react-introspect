import * as timersPromises from 'node:timers/promises';
import { createClock } from '@enormora/clock';
import React from 'react';
import type {
    IntrospectionActEnvironment,
    IntrospectionBrowserEnvironment,
    IntrospectionMacrotasks,
    IntrospectionMicrotasks,
    IntrospectionRuntimeDependencies
} from './introspect-runtime-dependencies-types.ts';

const reactActEnvironmentKey = 'IS_REACT_ACT_ENVIRONMENT';

const realBrowserEnvironment: IntrospectionBrowserEnvironment = Object.freeze({
    readDocument() {
        return Reflect.get(globalThis, 'document') as unknown;
    },
    readWindow() {
        return Reflect.get(globalThis, 'window') as unknown;
    }
});

const realActEnvironment: IntrospectionActEnvironment = Object.freeze({
    act(action) {
        const results = new Set<unknown>();
        const hadActEnvironment = Object.hasOwn(globalThis, reactActEnvironmentKey);
        const previousActEnvironment: unknown = Reflect.get(globalThis, reactActEnvironmentKey);

        Reflect.set(globalThis, reactActEnvironmentKey, true);

        try {
            React.act(function runAction() {
                results.add(action());
            });
        } finally {
            if (hadActEnvironment) {
                Reflect.set(globalThis, reactActEnvironmentKey, previousActEnvironment);
            } else {
                Reflect.deleteProperty(globalThis, reactActEnvironmentKey);
            }
        }

        return results.values().next().value;
    }
});

const realMacrotasks: IntrospectionMacrotasks = Object.freeze({
    async waitForNext() {
        await timersPromises.setImmediate();
    }
});

const realMicrotasks: IntrospectionMicrotasks = Object.freeze({
    async flush() {
        await Promise.resolve();
    },
    schedule(action) {
        queueMicrotask(action);
    }
});

const createNodeClock: () => IntrospectionRuntimeDependencies['clock'] = createClock;

export function createNodeRuntimeDependencies(): IntrospectionRuntimeDependencies {
    return Object.freeze({
        actEnvironment: realActEnvironment,
        browserEnvironment: realBrowserEnvironment,
        clock: createNodeClock(),
        macrotasks: realMacrotasks,
        microtasks: realMicrotasks
    });
}
