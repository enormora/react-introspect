import * as timers from 'node:timers';
import { suite, test } from '@overkill-dev/test';
import React from 'react';
import { introspect, type IntrospectionView } from '../../react-introspect.entry-point.ts';

type SuspenseResource = {
    readonly error: SuspenseThenableError;
    readonly readReady: () => boolean;
    readonly resolve: () => void;
};

type SuspendsUntilReadyProps = {
    readonly resource: SuspenseResource;
};

type TransitionValueReaderProps = {
    readonly subscribe: (listener: (value: string) => void) => void;
};

function rejectSuspenseThenable(error: unknown, onrejected: ((error: unknown) => void) | undefined): void {
    if (onrejected === undefined) {
        throw error instanceof Error ? error : new Error(String(error));
    }

    onrejected(error);
}

class SuspenseThenableError extends Error {
    private readonly promise: Promise<void>;

    public constructor(promise: Promise<void>, options?: ErrorOptions) {
        super('suspended', options);
        this.name = 'SuspenseThenableError';
        this.promise = promise;
    }

    public async then(
        onfulfilled: (() => void) | undefined,
        onrejected: ((error: unknown) => void) | undefined
    ): Promise<void> {
        try {
            await this.promise;
        } catch (error) {
            rejectSuspenseThenable(error, onrejected);

            return;
        }

        onfulfilled?.();
    }
}

function Loading(): React.ReactNode {
    return React.createElement('em', null, 'loading');
}

function SuspendsUntilReady(props: SuspendsUntilReadyProps): React.ReactNode {
    if (!props.resource.readReady()) {
        throw props.resource.error;
    }

    return React.createElement('span', null, 'ready');
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

function createSuspenseResource(): SuspenseResource {
    let ready = false;
    let resolvePromise = function rejectMissingResolution(): void {
        throw new Error('Expected suspense resolver to be initialized.');
    };

    const promise = new Promise<void>(function captureResolver(resolve) {
        resolvePromise = resolve;
    });

    return {
        error: new SuspenseThenableError(promise),
        readReady() {
            return ready;
        },
        resolve() {
            ready = true;
            resolvePromise();
        }
    };
}

type ParallelLoaderView = {
    readonly loading: Promise<void>;
    readonly view: IntrospectionView;
};

const parallelViewCount = 10;

function introspectWithDelayedLoader(label: string, delayInMilliseconds: number): ParallelLoaderView {
    const listeners = new Set<(value: string) => void>();

    async function publishLoadedValue(): Promise<void> {
        await timers.promises.setTimeout(delayInMilliseconds);

        for (const listener of listeners) {
            listener(label);
        }
    }

    const loading = publishLoadedValue();
    const view = introspect(
        React.createElement(TransitionValueReader, {
            subscribe(listener) {
                listeners.add(listener);
            }
        }),
        { depth: 'full', strictMode: false }
    );

    return { loading, view };
}

export const testNode = suite('runtime integration', [
    test(
        'waits for transition work scheduled outside React on the real scheduler',
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

            queueMicrotask(function publishValue() {
                for (const listener of listeners) {
                    listener('after');
                }
            });
            await view.waitForIdle();

            scope.assert.deepEqual(
                { renderCount: view.renderCount, textContent: view.textContent },
                { renderCount: 2, textContent: 'after' }
            );

            return scope.assert.collect();
        }
    ),
    test(
        'renders loader updates from outside any view in parallel views',
        async function (scope) {
            const labels = Array.from({ length: parallelViewCount }, function createLabel(_value, index) {
                return `view ${index}`;
            });
            const loaderViews = labels.map(function introspectLabel(label, index) {
                return introspectWithDelayedLoader(label, parallelViewCount - index);
            });

            await Promise.all(loaderViews.map(async function waitForLoadedView(loaderView) {
                await loaderView.loading;
                await loaderView.view.waitForIdle();
            }));

            scope.assert.deepEqual(
                loaderViews.map(function readText(loaderView) {
                    return loaderView.view.textContent;
                }),
                labels
            );

            return scope.assert.collect();
        }
    ),
    test(
        'retries Suspense after a thrown promise resolves',
        async function (scope) {
            const resource = createSuspenseResource();
            const view = introspect(
                React.createElement(
                    React.Suspense,
                    { fallback: React.createElement(Loading) },
                    React.createElement(SuspendsUntilReady, { resource })
                ),
                {
                    depth: 'full',
                    strictMode: false,
                    waitTimeout: 1000,
                    warningMode: 'capture'
                }
            );

            const fallbackStatus = view.find(Loading)?.renderedChildren.status;
            const fallbackText = view.find('em')?.textContent;
            const fallbackReadyNode = view.find('span');
            const fallbackRenderCount = view.renderCount;

            resource.resolve();
            await view.waitForIdle();

            scope.assert.deepEqual({
                fallbackReadyNode,
                fallbackStatus,
                fallbackText,
                readyStatus: view.find(SuspendsUntilReady)?.renderedChildren.status,
                readyText: view.find('span')?.textContent,
                removedFallback: view.find('em'),
                renderCount: view.renderCount
            }, {
                fallbackReadyNode: undefined,
                fallbackStatus: 'rendered',
                fallbackText: 'loading',
                readyStatus: 'rendered',
                readyText: 'ready',
                removedFallback: undefined,
                renderCount: fallbackRenderCount + 1
            });

            return scope.assert.collect();
        }
    )
]);
