import { suite, test } from '@overkill-dev/test';
import { createUnitRuntimeDependencies } from './introspect-runtime-dependencies.ts';

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
