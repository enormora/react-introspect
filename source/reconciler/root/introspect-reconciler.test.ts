import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type {
    IntrospectionOptions,
    IntrospectionView
} from '../../public/introspect-public-types.ts';
import type { IntrospectionRuntimeDependencies } from '../../runtime/view/introspect-runtime-dependencies-types.ts';
import { createUnitRuntimeDependencies } from '../../runtime/view/introspect-runtime-dependencies.test.ts';
import { createUnitIntrospectionView } from '../../runtime/view/introspect-unit-view.test.ts';
import {
    createIntrospectionReconcilerRuntime
} from './introspect-reconciler-runtime.ts';

type HostSchema = {
    readonly main: {
        readonly title: string;
    };
};

function introspect<Schema extends Record<string, unknown>>(
    element: React.ReactElement,
    options: IntrospectionOptions<Schema>
): IntrospectionView<Schema> {
    return createUnitIntrospectionView(element, options) as IntrospectionView<Schema>;
}

type PageProps = {
    readonly title: string;
};

type PromiseReaderProps = {
    readonly textPromise: React.Usable<string>;
};

type ExternalStore = {
    readonly read: () => string;
    readonly subscribe: (listener: () => void) => () => void;
    readonly write: (value: string) => void;
};

type StoreReaderProps = {
    readonly store: ExternalStore;
};

class SuspenseThenableError extends Error {
    public constructor() {
        super('suspended');
        this.name = 'SuspenseThenableError';
    }

    public then(): void {
        if (this.message.length > 0) {
            return undefined;
        }

        return undefined;
    }
}

function requireValue<Value>(value: Value | undefined): Value {
    if (value === undefined) {
        throw new Error('Expected value to exist.');
    }

    return value;
}

function Page(props: PageProps): React.ReactNode {
    return React.createElement(
        'main',
        { title: props.title },
        'Hello ',
        React.createElement('strong', null, props.title)
    );
}

function Clicker(): React.ReactNode {
    const [ label, setLabel ] = React.useState('off');

    return React.createElement(
        'button',
        {
            onClick() {
                setLabel('on');
            }
        },
        label
    );
}

function Loading(): React.ReactNode {
    return React.createElement('em', null, 'loading');
}

function PromiseReader(props: PromiseReaderProps): React.ReactNode {
    const text = React.use(props.textPromise);

    return React.createElement('span', null, text);
}

function ReadyPanel(): React.ReactNode {
    return React.createElement('span', null, 'ready');
}

function RendersNull(): React.ReactNode {
    return null;
}

function Suspends(): React.ReactNode {
    throw new SuspenseThenableError();
}

function createExternalStore(initialValue: string): ExternalStore {
    let value = initialValue;
    const listeners = new Set<() => void>();

    return Object.freeze({
        read() {
            return value;
        },
        subscribe(listener: () => void) {
            listeners.add(listener);

            return function unsubscribe() {
                listeners.delete(listener);
            };
        },
        write(nextValue: string) {
            value = nextValue;

            for (const listener of listeners) {
                listener();
            }
        }
    });
}

function TransitionStoreReader(props: StoreReaderProps): React.ReactNode {
    const [ value, setValue ] = React.useState(props.store.read());

    React.useLayoutEffect(function subscribeToStore() {
        return props.store.subscribe(function applyStoreValueInTransition() {
            React.startTransition(function applyStoreValue() {
                setValue(props.store.read());
            });
        });
    }, [ props.store ]);

    return React.createElement('span', null, value);
}

function createFulfilledReactPromise(value: string): React.FulfilledReactPromise<string> {
    return Object.assign(Promise.resolve(value), {
        status: 'fulfilled' as const,
        value
    });
}

function createRejectedReactPromise(reason: Error): React.RejectedReactPromise<string> {
    return Object.assign(Promise.resolve(''), {
        reason,
        status: 'rejected' as const
    });
}

async function waitForDelayedRender(view: IntrospectionView<HostSchema>): Promise<void> {
    const delayedRender = view.waitForRenderCount(3);

    await view.waitForIdle();
    view.update(React.createElement(Page, { title: 'delayed' }));
    await delayedRender;
}

export const testNode = suite('custom reconciler host layer', [
    test('publishes host and text output after a synchronous commit', function (scope) {
        const view = introspect<HostSchema>(React.createElement(Page, { title: 'world' }), {
            depth: 'full'
        });
        const main = requireValue(view.find('main'));
        const strong = requireValue(view.find('strong'));

        scope.assert.equal(view.renderCount, 1);
        scope.assert.equal(view.root?.type, Page);
        scope.assert.equal(view.textContent, 'Hello world');
        scope.assert.equal(main.props.title, 'world');
        scope.assert.equal(strong.textContent, 'world');
        scope.assert.equal(view.formatTree(), 'Page\n  main\n    #text\n    strong\n      #text');

        return scope.assert.collect();
    }),
    test('updates committed host snapshots', function (scope) {
        const view = introspect<HostSchema>(React.createElement(Page, { title: 'initial' }), {
            depth: 'full',
            strictMode: false
        });
        const root = requireValue(view.root);

        view.update(React.createElement(Page, { title: 'updated' }));
        scope.assert.equal(root.isStale, true);
        scope.assert.equal(view.renderCount, 2);
        scope.assert.equal(view.textContent, 'Hello updated');
        scope.assert.equal(view.find('main')?.props.title, 'updated');

        return scope.assert.collect();
    }),
    test('unmounts the committed root', function (scope) {
        const view = introspect<HostSchema>(React.createElement(Page, { title: 'mounted' }), {
            depth: 'full',
            strictMode: false
        });
        const root = requireValue(view.root);

        view.unmount();
        scope.assert.equal(root.isStale, true);
        scope.assert.equal(view.renderCount, 2);
        scope.assert.undefined(view.root);
        scope.assert.equal(view.textContent, '');
        scope.assert.undefined(view.find('main'));

        return scope.assert.collect();
    }),
    test('waits for committed renders and idle work', async function (scope) {
        const view = introspect<HostSchema>(React.createElement(Page, { title: 'first' }), {
            depth: 'full',
            strictMode: false
        });

        const nextRender = view.waitForNextRender();

        view.update(React.createElement(Page, { title: 'next' }));

        await nextRender;
        await view.waitForRenderCount(2);
        await view.waitUntil(function hasNextText() {
            return view.textContent === 'Hello next';
        });
        await view.waitForIdle();
        await waitForDelayedRender(view);

        scope.assert.equal(view.textContent, 'Hello delayed');

        return scope.assert.collect();
    }),
    test('waits for transition work scheduled by a store update outside React', async function (scope) {
        const store = createExternalStore('before');
        const view = introspect(React.createElement(TransitionStoreReader, { store }), {
            depth: 'full',
            strictMode: false
        });

        store.write('after');
        await view.waitForIdle();

        scope.assert.deepEqual(
            { renderCount: view.renderCount, textContent: view.textContent },
            { renderCount: 2, textContent: 'after' }
        );

        return scope.assert.collect();
    }),
    test('waits for transition work scheduled by a store update in a microtask', async function (scope) {
        const store = createExternalStore('before');
        const view = introspect(React.createElement(TransitionStoreReader, { store }), {
            depth: 'full',
            strictMode: false
        });

        queueMicrotask(function writeStoreLater() {
            store.write('after');
        });
        await view.waitForIdle();

        scope.assert.deepEqual(
            { renderCount: view.renderCount, textContent: view.textContent },
            { renderCount: 2, textContent: 'after' }
        );

        return scope.assert.collect();
    }),
    test('wraps event props in React act', function (scope) {
        const view = introspect(React.createElement(Clicker), {
            depth: 'full',
            strictMode: false
        });
        const button = requireValue(view.find('button'));

        button.sendEvent('click');

        scope.assert.equal(button.isStale, true);
        scope.assert.equal(view.textContent, 'on');
        scope.assert.equal(view.renderCount, 2);

        return scope.assert.collect();
    }),
    test('preserves committed keyed host order after movement', function (scope) {
        const view = introspect(
            React.createElement(
                'main',
                null,
                React.createElement('span', { key: 'second' }, 'second')
            ),
            {
                depth: 'full',
                strictMode: false
            }
        );

        view.update(React.createElement(
            'main',
            null,
            React.createElement('span', { key: 'first' }, 'first'),
            React.createElement('span', { key: 'second' }, 'second'),
            React.createElement('span', { key: 'third' }, 'third')
        ));

        view.update(React.createElement(
            'main',
            null,
            React.createElement('span', { key: 'third' }, 'third'),
            React.createElement('span', { key: 'first' }, 'first'),
            React.createElement('span', { key: 'second' }, 'second')
        ));

        scope.assert.deepEqual(
            Array.from(view.findAll('span'), function readText(node) {
                return node.textContent;
            }),
            [ 'third', 'first', 'second' ]
        );

        return scope.assert.collect();
    }),
    test('removes committed host children', function (scope) {
        const view = introspect(
            React.createElement(
                'div',
                null,
                React.createElement('span', { key: 'first' }, 'first'),
                React.createElement('em', { key: 'second' }, 'second')
            ),
            {
                depth: 'full',
                strictMode: false
            }
        );

        view.update(React.createElement(
            'div',
            null,
            React.createElement('span', { key: 'first' }, 'first')
        ));

        scope.assert.undefined(view.find('em'));
        scope.assert.equal(view.textContent, 'first');

        return scope.assert.collect();
    }),
    test('publishes empty and multi-child root snapshots', function (scope) {
        const emptyView = introspect(React.createElement(RendersNull), {
            depth: 'full',
            strictMode: false
        });
        const fragmentView = introspect(
            React.createElement(
                React.Fragment,
                null,
                React.createElement('span', null, 'first'),
                React.createElement('span', null, 'second')
            ),
            {
                depth: 'full',
                strictMode: false
            }
        );

        scope.assert.equal(emptyView.root?.type, RendersNull);
        scope.assert.equal(emptyView.renderedChildren.length, 1);
        scope.assert.equal(emptyView.find('#empty')?.textContent, '');
        scope.assert.equal(fragmentView.root?.type, React.Fragment);
        scope.assert.equal(fragmentView.renderedChildren.length, 2);
        scope.assert.equal(fragmentView.textContent, 'firstsecond');

        return scope.assert.collect();
    }),
    test('removes committed root children', function (scope) {
        const view = introspect(
            React.createElement(
                React.Fragment,
                null,
                React.createElement('span', { key: 'first' }, 'first'),
                React.createElement('span', { key: 'second' }, 'second')
            ),
            {
                depth: 'full',
                strictMode: false
            }
        );

        view.update(React.createElement(
            React.Fragment,
            null,
            React.createElement('span', { key: 'first' }, 'first')
        ));

        scope.assert.equal(view.findAll('span').length, 1);
        scope.assert.equal(view.textContent, 'first');

        return scope.assert.collect();
    }),
    test('replaces the committed root host child', function (scope) {
        const view = introspect(React.createElement('span', null, 'first'), {
            depth: 'full',
            strictMode: false
        });

        view.update(React.createElement('em', null, 'second'));

        scope.assert.undefined(view.find('span'));
        scope.assert.equal(view.find('em')?.textContent, 'second');

        return scope.assert.collect();
    }),
    test(
        'keeps the previous snapshot when a sync update suspends before commit',
        function (scope) {
            const view = introspect(React.createElement(Page, { title: 'stable' }), {
                depth: 'full',
                strictMode: false
            });

            try {
                view.update(React.createElement(Suspends));
            } catch {
                Object.freeze({});
            }

            scope.assert.equal(view.renderCount, 1);
            scope.assert.equal(view.textContent, 'Hello stable');

            return scope.assert.collect();
        }
    ),
    test(
        'reports a suspended initial root clearly',
        function (scope) {
            const view = introspect(React.createElement(Suspends), {
                depth: 'full',
                errorMode: 'capture',
                strictMode: false
            });

            scope.assert.equal(view.renderCount, 1);
            scope.assert.undefined(view.root);
            scope.assert.equal(
                view.errors.at(-1)?.message,
                'React Introspect cannot commit a suspended root. Wrap lazy, async, or promise-using roots in React.Suspense.'
            );

            return scope.assert.collect();
        }
    ),
    test(
        'commits ready Suspense children without rendering fallback',
        function (scope) {
            const view = introspect(
                React.createElement(
                    React.Suspense,
                    { fallback: React.createElement(Loading) },
                    React.createElement(ReadyPanel)
                ),
                {
                    depth: 'full',
                    strictMode: false
                }
            );

            scope.assert.equal(view.renderCount, 1);
            scope.assert.equal(view.root?.type, ReadyPanel);
            scope.assert.undefined(view.find('em'));
            scope.assert.undefined(view.find(Loading));
            scope.assert.equal(view.find(ReadyPanel)?.renderedChildren.status, 'rendered');
            scope.assert.equal(view.find('span')?.textContent, 'ready');

            return scope.assert.collect();
        }
    ),
    test(
        'renders React.use fulfilled promise values',
        function (scope) {
            const view = introspect(
                React.createElement(
                    React.Suspense,
                    { fallback: React.createElement(Loading) },
                    React.createElement(PromiseReader, { textPromise: createFulfilledReactPromise('resolved') })
                ),
                {
                    depth: 'full',
                    strictMode: false
                }
            );

            scope.assert.equal(view.renderCount, 1);
            scope.assert.undefined(view.find('em'));
            scope.assert.equal(view.find(PromiseReader)?.renderedChildren.status, 'rendered');
            scope.assert.equal(view.find('span')?.textContent, 'resolved');

            return scope.assert.collect();
        }
    ),
    test(
        'records React.use rejected promise errors',
        function (scope) {
            const error = new Error('load failed');
            const view = introspect(
                React.createElement(
                    React.Suspense,
                    { fallback: React.createElement(Loading) },
                    React.createElement(PromiseReader, { textPromise: createRejectedReactPromise(error) })
                ),
                {
                    depth: 'full',
                    errorMode: 'capture',
                    strictMode: false
                }
            );

            scope.assert.undefined(view.root);
            scope.assert.equal(view.errors.at(-1)?.cause, error);

            return scope.assert.collect();
        }
    ),
    test('routes scheduler hooks through injected runtime module', async function (scope) {
        const unitRuntime = createUnitRuntimeDependencies();
        const schedulerEvents: string[] = [];
        const runtime: IntrospectionRuntimeDependencies = {
            ...unitRuntime,
            clock: {
                ...unitRuntime.clock,
                clearTimeout(timeoutIdentifier) {
                    schedulerEvents.push('clear');
                    unitRuntime.clock.clearTimeout(timeoutIdentifier);
                },
                setTimeout(handler, delayInMilliseconds, ...handlerArguments) {
                    schedulerEvents.push(`schedule:${delayInMilliseconds}:${String(handlerArguments[0])}`);

                    return unitRuntime.clock.setTimeout(handler, delayInMilliseconds, ...handlerArguments);
                }
            }
        };
        const reconcilerRuntime = createIntrospectionReconcilerRuntime();
        const timeoutIdentifier = reconcilerRuntime.run(runtime, function scheduleTimeout() {
            return reconcilerRuntime.scheduleTimeout(
                function recordTimeout(value: string) {
                    schedulerEvents.push(value);
                },
                5,
                'value'
            );
        });

        reconcilerRuntime.run(runtime, function scheduleMicrotask() {
            reconcilerRuntime.scheduleMicrotask(function recordMicrotask() {
                schedulerEvents.push('microtask');
            });
            reconcilerRuntime.cancelTimeout(timeoutIdentifier);
        });
        await runtime.microtasks.flush();

        scope.assert.deepEqual({
            eventTimestamp: reconcilerRuntime.run(runtime, function readEventTimestamp() {
                return reconcilerRuntime.readEventTimestamp();
            }),
            schedulerEvents
        }, {
            eventTimestamp: 0,
            schedulerEvents: [ 'schedule:5:value', 'clear', 'microtask' ]
        });
        scope.assert.throws(
            function scheduleWithoutRuntime() {
                reconcilerRuntime.scheduleTimeout(function noopTimeout() {
                    return undefined;
                }, 0);
            },
            { message: 'Expected Introspection runtime dependencies.' }
        );

        return scope.assert.collect();
    })
]);
