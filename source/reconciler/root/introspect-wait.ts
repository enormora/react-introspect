import type { Clock } from '@enormora/clock';

type WaiterFailure = { readonly error: unknown; readonly kind: 'failed'; };

type WaiterSatisfied = { readonly kind: 'satisfied'; };

type PredicateOutcome = WaiterFailure | WaiterSatisfied | { readonly kind: 'pending'; };

type WaiterOutcome = WaiterFailure | WaiterSatisfied | { readonly kind: 'cancelled'; };

type DeadlineOutcome<Result> = { readonly kind: 'completed'; readonly value: Result; } | { readonly kind: 'expired'; };

type Waiter = {
    readonly predicate: () => boolean;
    readonly resolve: (outcome: WaiterOutcome) => void;
};

export type WaitOperation = 'waitForIdle' | 'waitForNextRender' | 'waitForRenderCount' | 'waitUntil';

type WaiterHandle = {
    readonly cancel: () => void;
    readonly settled: Promise<WaiterOutcome>;
};

type WaitBounds = {
    readonly clock: Clock;
    readonly flushUntilIdle: () => Promise<void>;
    readonly operation: WaitOperation;
    readonly timeoutInMilliseconds: number;
};

export type WaiterQueue = {
    readonly settle: () => void;
    readonly waitUntil: (predicate: () => boolean, bounds: WaitBounds) => Promise<void>;
};

function outcomeOfSatisfaction(satisfied: boolean): PredicateOutcome {
    return satisfied ? { kind: 'satisfied' } : { kind: 'pending' };
}

function evaluatePredicate(predicate: () => boolean): PredicateOutcome {
    try {
        return outcomeOfSatisfaction(predicate());
    } catch (error) {
        return { error, kind: 'failed' };
    }
}

async function completionOf<Result>(pending: Promise<Result>): Promise<DeadlineOutcome<Result>> {
    return { kind: 'completed', value: await pending };
}

function valueBeforeDeadline<Result>(
    outcome: DeadlineOutcome<Result>,
    operation: WaitOperation,
    timeoutInMilliseconds: number
): Result {
    if (outcome.kind === 'expired') {
        throw new Error(`${operation} timed out after ${timeoutInMilliseconds} ms.`);
    }

    return outcome.value;
}

export async function withDeadline<Result>(
    clock: Clock,
    timeoutInMilliseconds: number,
    operation: WaitOperation,
    pending: Promise<Result>
): Promise<Result> {
    const { promise: expiry, resolve: expire } = Promise.withResolvers<DeadlineOutcome<Result>>();
    const expired: DeadlineOutcome<Result> = { kind: 'expired' };
    const timeoutIdentifier = clock.setTimeout(expire, timeoutInMilliseconds, expired);

    try {
        const outcome = await Promise.race([ completionOf(pending), expiry ]);

        return valueBeforeDeadline(outcome, operation, timeoutInMilliseconds);
    } finally {
        clock.clearTimeout(timeoutIdentifier);
        expire(expired);
    }
}

async function waitForOutcome(
    waiter: WaiterHandle,
    flushUntilIdle: () => Promise<void>
): Promise<WaiterOutcome> {
    await flushUntilIdle();

    return waiter.settled;
}

function throwFailure(outcome: WaiterOutcome): void {
    if (outcome.kind === 'failed') {
        throw outcome.error;
    }
}

async function awaitWaiter(waiter: WaiterHandle, pending: Promise<WaiterOutcome>): Promise<void> {
    try {
        throwFailure(await pending);
    } finally {
        waiter.cancel();
    }
}

export function createWaiterQueue(): WaiterQueue {
    const waiters = new Set<Waiter>();

    function register(predicate: () => boolean): WaiterHandle {
        const { promise, resolve } = Promise.withResolvers<WaiterOutcome>();
        const waiter = { predicate, resolve };

        waiters.add(waiter);

        return {
            cancel() {
                waiters.delete(waiter);
                resolve({ kind: 'cancelled' });
            },
            settled: promise
        };
    }

    return {
        settle() {
            for (const waiter of Array.from(waiters)) {
                const outcome = evaluatePredicate(waiter.predicate);

                if (outcome.kind !== 'pending') {
                    waiters.delete(waiter);
                    waiter.resolve(outcome);
                }
            }
        },
        async waitUntil(predicate, bounds) {
            const waiter = register(predicate);
            const outcome = waitForOutcome(waiter, bounds.flushUntilIdle);

            await awaitWaiter(
                waiter,
                withDeadline(bounds.clock, bounds.timeoutInMilliseconds, bounds.operation, outcome)
            );
        }
    };
}
