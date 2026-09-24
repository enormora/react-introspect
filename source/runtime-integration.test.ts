import * as timers from 'node:timers';
import { suite, test } from '@overkill-dev/test';
import React from 'react';
import { introspect, type IntrospectionView } from './react-introspect.entry-point.ts';

type EqualScope = {
    readonly assert: {
        readonly equal: (actual: unknown, expected: unknown) => void;
    };
};

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

function assertFallback(scope: EqualScope, view: IntrospectionView): void {
    scope.assert.equal(view.find(Loading)?.renderedChildren.status, 'rendered');
    scope.assert.equal(view.find('em')?.textContent, 'loading');
    scope.assert.equal(view.find('span'), undefined);
}

function waitForRetry(view: IntrospectionView): PendingRetry {
    const renderCount = view.renderCount + 1;

    return Object.freeze({
        renderCount,
        wait: view.waitForRenderCount(renderCount)
    });
}

async function assertThrownPromiseRetry(scope: EqualScope): Promise<void> {
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

    assertFallback(scope, view);
    const retry = waitForRetry(view);

    await actAsync(function resolveResource() {
        resource.resolve();
    });
    await retry.wait;

    scope.assert.equal(view.renderCount, retry.renderCount);
    scope.assert.equal(view.find('em'), undefined);
    scope.assert.equal(view.find(SuspendsUntilReady)?.renderedChildren.status, 'rendered');
    scope.assert.equal(view.find('span')?.textContent, 'ready');
}

export const testNode = suite('runtime integration', [
    test(
        'retries Suspense after a thrown promise resolves',
        async function verifyThrownPromiseRetry(scope) {
            await assertThrownPromiseRetry(scope);

            return scope.assert.collect();
        }
    )
]);
