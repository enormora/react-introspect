import * as timersPromises from 'node:timers/promises';
import { createClock } from '@enormora/clock';
import type {
    IntrospectionMacrotasks,
    IntrospectionRuntimeDependencies
} from './introspect-runtime-dependencies-types.ts';

const realMacrotasks: IntrospectionMacrotasks = {
    async waitForNext() {
        await timersPromises.setImmediate();
    }
};

export function createNodeRuntimeDependencies(): IntrospectionRuntimeDependencies {
    return {
        clock: createClock(),
        macrotasks: realMacrotasks
    };
}
