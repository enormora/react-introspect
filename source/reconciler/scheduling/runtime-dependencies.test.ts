import * as timers from 'node:timers';
import * as timersPromises from 'node:timers/promises';
import { createDeterministicClock } from '@enormora/clock/deterministic-clock';
import { suite, test } from '@overkill-dev/test';
import type { Clock } from '@enormora/clock';
import type {
    IntrospectionMacrotasks,
    IntrospectionRuntimeDependencies
} from './runtime-dependencies-types.ts';

const unitClockStart = 0n;

const schedulerMacrotasks: IntrospectionMacrotasks = {
    async waitForNext() {
        await timersPromises.setImmediate();
    }
};

function createUnitClock(): Clock {
    return createDeterministicClock({
        initialUnixEpochMicroseconds: unitClockStart
    });
}

export function createUnitRuntimeDependencies(): IntrospectionRuntimeDependencies {
    return {
        clock: createUnitClock(),
        macrotasks: schedulerMacrotasks
    };
}

export const testNode = suite('introspection runtime dependencies', [
    test('creates deterministic unit runtime dependencies', async function (scope) {
        const runtime = createUnitRuntimeDependencies();
        const events: string[] = [];

        timers.setImmediate(function recordMacrotask() {
            events.push('macrotask');
        });
        await runtime.macrotasks.waitForNext();

        scope.assert.deepEqual({
            currentMonotonicMicroseconds: runtime.clock.currentMonotonicMicroseconds,
            currentUnixEpochMicroseconds: runtime.clock.currentUnixEpochMicroseconds,
            currentUnixEpochMilliseconds: runtime.clock.currentUnixEpochMilliseconds
        }, {
            currentMonotonicMicroseconds: 0n,
            currentUnixEpochMicroseconds: 0n,
            currentUnixEpochMilliseconds: 0
        });
        scope.assert.deepEqual(events, [ 'macrotask' ]);

        return scope.assert.collect();
    })
]);
