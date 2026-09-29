import * as timersPromises from 'node:timers/promises';
import { createClock } from '@enormora/clock';
import React from 'react';
import type {
    IntrospectionActEnvironment,
    IntrospectionMacrotasks,
    IntrospectionMicrotasks,
    IntrospectionRuntimeDependencies
} from './introspect-runtime-dependencies-types.ts';

const reactActEnvironmentKey = 'IS_REACT_ACT_ENVIRONMENT';

const realActEnvironment: IntrospectionActEnvironment = {
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
};

const realMacrotasks: IntrospectionMacrotasks = {
    async waitForNext() {
        await timersPromises.setImmediate();
    }
};

const realMicrotasks: IntrospectionMicrotasks = {
    async flush() {
        await Promise.resolve();
    },
    schedule(action) {
        queueMicrotask(action);
    }
};

export function createNodeRuntimeDependencies(): IntrospectionRuntimeDependencies {
    return {
        actEnvironment: realActEnvironment,
        clock: createClock(),
        macrotasks: realMacrotasks,
        microtasks: realMicrotasks
    };
}
