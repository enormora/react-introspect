import { suite, test } from '@overkill-dev/test';
import { noHostTimeout } from '../host/introspect-host-tree.ts';
import type { IntrospectionRuntimeDependencies } from '../scheduling/introspect-runtime-dependencies-types.ts';
import { createUnitRuntimeDependencies } from '../scheduling/introspect-runtime-dependencies.test.ts';
import { flushScheduledWork } from './introspect-react-root.ts';

type CountedRuntime = {
    readonly readMacrotaskCount: () => number;
    readonly runtime: IntrospectionRuntimeDependencies;
};

async function readRejection(pending: Promise<unknown>): Promise<unknown> {
    try {
        await pending;
    } catch (error) {
        return error;
    }

    return undefined;
}

function createRuntimeSettlingOnSecondMacrotask(settle: () => void): CountedRuntime {
    let macrotaskCount = 0;

    return {
        readMacrotaskCount() {
            return macrotaskCount;
        },
        runtime: {
            ...createUnitRuntimeDependencies(),
            macrotasks: {
                async waitForNext() {
                    macrotaskCount += 1;
                    if (macrotaskCount === 2) {
                        settle();
                    }
                }
            }
        }
    };
}

export const testNode = suite('React root access', [
    test('finishes flushing once the root has no pending work', async function (scope) {
        const error = await readRejection(flushScheduledWork(createUnitRuntimeDependencies(), {
            callbackNode: null,
            timeoutHandle: noHostTimeout
        }));

        scope.assert.equal(error, undefined);

        return scope.assert.collect();
    }),
    test('keeps flushing while the root still has a scheduled task', async function (scope) {
        const root: Record<string, unknown> = {
            callbackNode: {
                callback() {
                    throw new Error('flushScheduledWork must leave scheduled callbacks to React');
                }
            },
            timeoutHandle: noHostTimeout
        };
        const counted = createRuntimeSettlingOnSecondMacrotask(function clearScheduledTask() {
            root.callbackNode = null;
        });

        await flushScheduledWork(counted.runtime, root);

        scope.assert.equal(counted.readMacrotaskCount(), 2);

        return scope.assert.collect();
    }),
    test('keeps flushing while the root holds a commit scheduled for later', async function (scope) {
        const root: Record<string, unknown> = { callbackNode: null, timeoutHandle: 1 };
        const counted = createRuntimeSettlingOnSecondMacrotask(function commitScheduledWork() {
            root.timeoutHandle = noHostTimeout;
        });

        await flushScheduledWork(counted.runtime, root);

        scope.assert.equal(counted.readMacrotaskCount(), 2);

        return scope.assert.collect();
    }),
    test('fails loudly when the root no longer exposes its pending work', async function (scope) {
        const missingTask = await readRejection(flushScheduledWork(createUnitRuntimeDependencies(), {}));
        const missingTimeout = await readRejection(
            flushScheduledWork(createUnitRuntimeDependencies(), { callbackNode: null })
        );

        scope.assert.deepEqual(
            [ missingTask, missingTimeout ].map(function readMessage(error) {
                return error instanceof Error ? error.message : error;
            }),
            [
                'React Introspect expected the React root to expose callbackNode.',
                'React Introspect expected the React root to expose timeoutHandle.'
            ]
        );

        return scope.assert.collect();
    })
]);
