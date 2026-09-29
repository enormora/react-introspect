import * as timers from 'node:timers';
import { suite, test } from '@overkill-dev/test';
import React from 'react';
import { introspect, type IntrospectionView } from '../../react-introspect.entry-point.ts';

type TransitionValueReaderProps = {
    readonly subscribe: (listener: (value: string) => void) => void;
};

function Toggle(): React.ReactNode {
    const [ enabled, setEnabled ] = React.useState(false);

    return React.createElement('button', {
        onClick() {
            setEnabled(true);
        }
    }, enabled ? 'on' : 'off');
}

const warningContext = React.createContext('context value');
const unsupportedConsumerWarning = 'Calling useContext(Context.Consumer) is not supported and will cause bugs. ' +
    'Did you mean to call useContext(Context) instead?';

function ReadsConsumerContext(): React.ReactNode {
    const value = React.useContext(warningContext.Consumer as never);

    return React.createElement('span', null, String(value));
}

function TransitionValueReader(props: TransitionValueReaderProps): React.ReactNode {
    const [ value, setValue ] = React.useState('before');

    React.useLayoutEffect(function subscribeToValue() {
        props.subscribe(function applyValueInTransition(nextValue) {
            React.startTransition(function applyValue() {
                setValue(nextValue);
            });
        });
    }, [ props ]);

    return React.createElement('span', null, value);
}

async function withActEnvironment<Result>(action: () => Promise<Result>): Promise<Result> {
    const hadActEnvironment = Object.hasOwn(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    const previousActEnvironment: unknown = Reflect.get(globalThis, 'IS_REACT_ACT_ENVIRONMENT');

    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

    try {
        return await action();
    } finally {
        if (hadActEnvironment) {
            Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousActEnvironment);
        } else {
            Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
        }
    }
}

type IdleProgress = {
    readonly idling: Promise<void>;
    readonly isIdle: () => boolean;
};

function startWaitingForIdle(view: IntrospectionView): IdleProgress {
    let idle = false;

    async function waitAndMarkIdle(): Promise<void> {
        await view.waitForIdle();
        idle = true;
    }

    return {
        idling: waitAndMarkIdle(),
        isIdle() {
            return idle;
        }
    };
}

export const testNode = suite('runtime integration with development React', [
    test(
        'captures React console warnings from the real diagnostic channel',
        function (scope) {
            const view = introspect(React.createElement(ReadsConsumerContext), {
                depth: 'full',
                strictMode: false,
                warningMode: 'capture'
            });

            scope.assert.deepEqual(view.warnings, [
                {
                    cause: unsupportedConsumerWarning,
                    message: unsupportedConsumerWarning
                }
            ]);
            scope.assert.equal(view.textContent, 'undefined');

            return scope.assert.collect();
        }
    ),
    test(
        'updates without act warnings while the React act environment flag is set',
        async function (scope) {
            const observed = await withActEnvironment(async function updateInActEnvironment() {
                const view = introspect(React.createElement(Toggle), {
                    depth: 'full',
                    strictMode: false,
                    warningMode: 'capture'
                });

                view.find('button')?.sendEvent('click');
                await view.waitForIdle();

                const actEnvironment: unknown = Reflect.get(globalThis, 'IS_REACT_ACT_ENVIRONMENT');

                return {
                    actEnvironment,
                    textContent: view.textContent,
                    warnings: view.warnings
                };
            });

            scope.assert.deepEqual(observed, { actEnvironment: true, textContent: 'on', warnings: [] });

            return scope.assert.collect();
        }
    ),
    test(
        'resolves waitForIdle while an outside act scope holds the work',
        async function (scope) {
            const listeners = new Set<(value: string) => void>();
            const view = introspect(
                React.createElement(TransitionValueReader, {
                    subscribe(listener) {
                        listeners.add(listener);
                    }
                }),
                { depth: 'full', strictMode: false }
            );
            const release = Promise.withResolvers<undefined>();

            const idleBeforeRelease = await withActEnvironment(async function holdActScopeOpen() {
                const acting = Promise.resolve(React.act(async function publishInsideAct() {
                    for (const listener of listeners) {
                        listener('after');
                    }
                    await release.promise;
                }));
                const progress = startWaitingForIdle(view);

                await timers.promises.setTimeout(50);
                const wasIdle = progress.isIdle();

                release.resolve(undefined);
                await acting;
                await progress.idling;

                return wasIdle;
            });

            await view.waitForIdle();

            scope.assert.deepEqual(
                { idleBeforeRelease, textContent: view.textContent },
                { idleBeforeRelease: true, textContent: 'after' }
            );

            return scope.assert.collect();
        }
    )
]);
