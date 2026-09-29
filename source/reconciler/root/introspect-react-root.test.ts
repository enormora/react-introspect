import { suite, test } from '@overkill-dev/test';
import { createUnitRuntimeDependencies } from '../scheduling/introspect-runtime-dependencies.test.ts';
import { flushScheduledWork } from './introspect-react-root.ts';

async function readRejection(pending: Promise<unknown>): Promise<unknown> {
    try {
        await pending;
    } catch (error) {
        return error;
    }

    return undefined;
}

export const testNode = suite('React root access', [
    test('finishes flushing once the root has no scheduled task', async function (scope) {
        const error = await readRejection(flushScheduledWork(createUnitRuntimeDependencies(), { callbackNode: null }));

        scope.assert.equal(error, undefined);

        return scope.assert.collect();
    }),
    test('keeps flushing while the root still has a scheduled task', async function (scope) {
        const root: Record<string, unknown> = {
            callbackNode: {
                callback() {
                    throw new Error('flushScheduledWork must leave scheduled callbacks to React');
                }
            }
        };
        let macrotaskCount = 0;
        const runtime = {
            ...createUnitRuntimeDependencies(),
            macrotasks: {
                async waitForNext() {
                    macrotaskCount += 1;
                    if (macrotaskCount === 2) {
                        root.callbackNode = null;
                    }
                }
            }
        };

        await flushScheduledWork(runtime, root);

        scope.assert.equal(macrotaskCount, 2);

        return scope.assert.collect();
    }),
    test('fails loudly when the root no longer exposes its scheduled task', async function (scope) {
        const error = await readRejection(flushScheduledWork(createUnitRuntimeDependencies(), {}));

        scope.assert.equal(
            error instanceof Error ? error.message : error,
            'React Introspect expected the React root to expose callbackNode.'
        );

        return scope.assert.collect();
    })
]);
