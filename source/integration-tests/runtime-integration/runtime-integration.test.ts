import * as timers from 'node:timers';
import { suite, test } from '@overkill-dev/test';
import { defineCompositeAssertion } from '@overkill-dev/test/assert';
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

type PendingRetry = {
    readonly renderCount: number;
    readonly wait: Promise<void>;
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

const warningContext = React.createContext('context value');
const unsupportedConsumerWarning = 'Calling useContext(Context.Consumer) is not supported and will cause bugs. ' +
    'Did you mean to call useContext(Context) instead?';

function ReadsConsumerContext(): React.ReactNode {
    const value = React.useContext(warningContext.Consumer as never);

    return React.createElement('span', null, String(value));
}

function SuspendsUntilReady(props: SuspendsUntilReadyProps): React.ReactNode {
    if (!props.resource.readReady()) {
        throw props.resource.error;
    }

    return React.createElement('span', null, 'ready');
}

function createSuspenseResource(): SuspenseResource {
    let ready = false;
    let resolvePromise = function rejectMissingResolution(): void {
        throw new Error('Expected suspense resolver to be initialized.');
    };

    const promise = new Promise<void>(function captureResolver(resolve) {
        resolvePromise = resolve;
    });

    return Object.freeze({
        error: new SuspenseThenableError(promise),
        readReady() {
            return ready;
        },
        resolve() {
            ready = true;
            resolvePromise();
        }
    });
}

async function actAsync(action: () => void): Promise<void> {
    const hadActEnvironment = Object.hasOwn(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    const previousActEnvironment: unknown = Reflect.get(globalThis, 'IS_REACT_ACT_ENVIRONMENT');

    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

    try {
        await React.act(async function runAction() {
            action();
            await Promise.resolve();
            await new Promise<void>(function waitForTimer(resolve) {
                timers.setTimeout(resolve, 0);
            });
        });
    } finally {
        if (hadActEnvironment) {
            Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousActEnvironment);
        } else {
            Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
        }
    }
}

function waitForRetry(view: IntrospectionView): PendingRetry {
    const renderCount = view.renderCount + 1;

    return Object.freeze({
        renderCount,
        wait: view.waitForRenderCount(renderCount)
    });
}

const assertThrownPromiseRetry = defineCompositeAssertion({
    async assert(check) {
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
                waitTimeout: 50,
                warningMode: 'capture'
            }
        );

        const fallbackStatus = view.find(Loading)?.renderedChildren.status;
        const fallbackText = view.find('em')?.textContent;
        const fallbackReadyNode = view.find('span');
        const retry = waitForRetry(view);

        await actAsync(function resolveResource() {
            resource.resolve();
        });
        await retry.wait;

        return check.group([
            check.annotated('fallback status').equal(fallbackStatus, 'rendered'),
            check.annotated('fallback text').equal(fallbackText, 'loading'),
            check.annotated('fallback ready node').undefined(fallbackReadyNode),
            check.annotated('retry render count').equal(view.renderCount, retry.renderCount),
            check.annotated('fallback removed').undefined(view.find('em')),
            check.annotated('ready component status').equal(
                view.find(SuspendsUntilReady)?.renderedChildren.status,
                'rendered'
            ),
            check.annotated('ready text').equal(view.find('span')?.textContent, 'ready')
        ]);
    },
    name: 'assertThrownPromiseRetry'
});

export const testNode = suite('runtime integration', [
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
        'retries Suspense after a thrown promise resolves',
        async function (scope) {
            await scope.assert(assertThrownPromiseRetry);

            return scope.assert.collect();
        }
    )
]);
