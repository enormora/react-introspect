import { AsyncResource } from 'node:async_hooks';
import { suite, test } from '@overkill-dev/test';
import { defineCompositeAssertion } from '@overkill-dev/test/assert';
import React from 'react';
import type {
    IntrospectionNode,
    IntrospectionOptions,
    IntrospectionView
} from '../../public/introspect-public-types.ts';
import {
    createUnitRuntimeDependencies,
    type IntrospectionRuntimeDependencies
} from '../../runtime/view/introspect-runtime-dependencies.ts';
import { createIntrospectionView } from '../../runtime/view/introspect-view.ts';
import {
    cancelIntrospectionTimeout,
    runWithIntrospectionRuntime,
    scheduleIntrospectionTimeout
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
    return createIntrospectionView(element, options) as IntrospectionView<Schema>;
}

type PageProps = {
    readonly title: string;
};

type PromiseReaderProps = {
    readonly textPromise: React.Usable<string>;
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

const assertFullRender = defineCompositeAssertion({
    assert(check, view: IntrospectionView<HostSchema>) {
        const main = requireValue(view.find('main'));
        const strong = requireValue(view.find('strong'));

        return check.group([
            check.annotated('render count').equal(view.renderCount, 1),
            check.annotated('root type').equal(view.root?.type, Page),
            check.annotated('text content').equal(view.textContent, 'Hello world'),
            check.annotated('main title').equal(main.props.title, 'world'),
            check.annotated('strong text').equal(strong.textContent, 'world'),
            check.annotated('tree').equal(view.formatTree(), 'Page\n  main\n    #text\n    strong\n      #text')
        ]);
    },
    name: 'assertFullRender'
});

const assertUpdatedView = defineCompositeAssertion({
    assert(check, view: IntrospectionView<HostSchema>, staleRoot: IntrospectionNode) {
        return check.group([
            check.annotated('stale root').equal(staleRoot.isStale, true),
            check.annotated('render count').equal(view.renderCount, 2),
            check.annotated('text content').equal(view.textContent, 'Hello updated'),
            check.annotated('main title').equal(view.find('main')?.props.title, 'updated')
        ]);
    },
    name: 'assertUpdatedView'
});

const assertUnmountedView = defineCompositeAssertion({
    assert(check, view: IntrospectionView<HostSchema>, staleRoot: IntrospectionNode) {
        return check.group([
            check.annotated('stale root').equal(staleRoot.isStale, true),
            check.annotated('render count').equal(view.renderCount, 2),
            check.annotated('root').undefined(view.root),
            check.annotated('text content').equal(view.textContent, ''),
            check.annotated('main').undefined(view.find('main'))
        ]);
    },
    name: 'assertUnmountedView'
});

async function waitForDelayedRender(view: IntrospectionView<HostSchema>): Promise<void> {
    const delayedRender = view.waitForRenderCount(3);

    await view.waitForIdle();
    view.update(React.createElement(Page, { title: 'delayed' }));
    await delayedRender;
}

const assertWaits = defineCompositeAssertion({
    async assert(check, view: IntrospectionView<HostSchema>) {
        const nextRender = view.waitForNextRender();

        view.update(React.createElement(Page, { title: 'next' }));

        await nextRender;
        await view.waitForRenderCount(2);
        await view.waitUntil(function hasNextText() {
            return view.textContent === 'Hello next';
        });
        await view.waitForIdle();
        await waitForDelayedRender(view);

        return check.equal(view.textContent, 'Hello delayed');
    },
    name: 'assertWaits'
});

const assertEventUpdate = defineCompositeAssertion({
    assert(check) {
        const view = introspect(React.createElement(Clicker), {
            depth: 'full',
            strictMode: false
        });
        const button = requireValue(view.find('button'));

        button.sendEvent('click');

        return check.group([
            check.annotated('stale button').equal(button.isStale, true),
            check.annotated('text content').equal(view.textContent, 'on'),
            check.annotated('render count').equal(view.renderCount, 2)
        ]);
    },
    name: 'assertEventUpdate'
});

const assertKeyedInsertion = defineCompositeAssertion({
    assert(check) {
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

        return check.deepEqual(
            Array.from(view.findAll('span'), function readText(node) {
                return node.textContent;
            }),
            [ 'third', 'first', 'second' ]
        );
    },
    name: 'assertKeyedInsertion'
});

const assertHostChildRemoval = defineCompositeAssertion({
    assert(check) {
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

        return check.group([
            check.annotated('removed child').undefined(view.find('em')),
            check.annotated('text content').equal(view.textContent, 'first')
        ]);
    },
    name: 'assertHostChildRemoval'
});

const assertRootChildCounts = defineCompositeAssertion({
    assert(check) {
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

        return check.group([
            check.annotated('empty root type').equal(emptyView.root?.type, RendersNull),
            check.annotated('empty children').equal(emptyView.renderedChildren.length, 1),
            check.annotated('empty text').equal(emptyView.find('#empty')?.textContent, ''),
            check.annotated('fragment root type').equal(fragmentView.root?.type, React.Fragment),
            check.annotated('fragment children').equal(fragmentView.renderedChildren.length, 2),
            check.annotated('fragment text').equal(fragmentView.textContent, 'firstsecond')
        ]);
    },
    name: 'assertRootChildCounts'
});

const assertRootChildRemoval = defineCompositeAssertion({
    assert(check) {
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

        return check.group([
            check.annotated('remaining spans').equal(view.findAll('span').length, 1),
            check.annotated('text content').equal(view.textContent, 'first')
        ]);
    },
    name: 'assertRootChildRemoval'
});

const assertRootHostReplacement = defineCompositeAssertion({
    assert(check) {
        const view = introspect(React.createElement('span', null, 'first'), {
            depth: 'full',
            strictMode: false
        });

        view.update(React.createElement('em', null, 'second'));

        return check.group([
            check.annotated('old host').undefined(view.find('span')),
            check.annotated('new host text').equal(view.find('em')?.textContent, 'second')
        ]);
    },
    name: 'assertRootHostReplacement'
});

const assertSuspendedUpdateRollback = defineCompositeAssertion({
    assert(check) {
        const view = introspect(React.createElement(Page, { title: 'stable' }), {
            depth: 'full',
            strictMode: false
        });

        try {
            view.update(React.createElement(Suspends));
        } catch {
            return check.group([
                check.annotated('render count').equal(view.renderCount, 1),
                check.annotated('text content').equal(view.textContent, 'Hello stable')
            ]);
        }

        return check.group([
            check.annotated('render count').equal(view.renderCount, 1),
            check.annotated('text content').equal(view.textContent, 'Hello stable')
        ]);
    },
    name: 'assertSuspendedUpdateRollback'
});

const assertSuspendedInitialRoot = defineCompositeAssertion({
    assert(check) {
        const view = introspect(React.createElement(Suspends), {
            depth: 'full',
            errorMode: 'capture',
            strictMode: false
        });

        return check.group([
            check.annotated('render count').equal(view.renderCount, 1),
            check.annotated('root').undefined(view.root),
            check.annotated('error message').equal(
                view.errors.at(-1)?.message,
                'React Introspect cannot commit a suspended root. Wrap lazy, async, or promise-using roots in React.Suspense.'
            )
        ]);
    },
    name: 'assertSuspendedInitialRoot'
});

const assertSuspenseReadyChildren = defineCompositeAssertion({
    assert(check) {
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

        return check.group([
            check.annotated('render count').equal(view.renderCount, 1),
            check.annotated('root type').equal(view.root?.type, ReadyPanel),
            check.annotated('fallback host').undefined(view.find('em')),
            check.annotated('fallback component').undefined(view.find(Loading)),
            check.annotated('ready children').equal(view.find(ReadyPanel)?.renderedChildren.status, 'rendered'),
            check.annotated('ready text').equal(view.find('span')?.textContent, 'ready')
        ]);
    },
    name: 'assertSuspenseReadyChildren'
});

const assertUseFulfilledPromise = defineCompositeAssertion({
    assert(check) {
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

        return check.group([
            check.annotated('render count').equal(view.renderCount, 1),
            check.annotated('fallback host').undefined(view.find('em')),
            check.annotated('promise children').equal(view.find(PromiseReader)?.renderedChildren.status, 'rendered'),
            check.annotated('resolved text').equal(view.find('span')?.textContent, 'resolved')
        ]);
    },
    name: 'assertUseFulfilledPromise'
});

const assertUseRejectedPromise = defineCompositeAssertion({
    assert(check) {
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

        return check.group([
            check.annotated('root').undefined(view.root),
            check.annotated('error cause').equal(view.errors.at(-1)?.cause, error)
        ]);
    },
    name: 'assertUseRejectedPromise'
});

export const testNode = suite('custom reconciler host layer', [
    test('publishes host and text output after a synchronous commit', function (scope) {
        const view = introspect<HostSchema>(React.createElement(Page, { title: 'world' }), {
            depth: 'full'
        });

        scope.assert(assertFullRender, view);

        return scope.assert.collect();
    }),
    test('updates committed host snapshots', function (scope) {
        const view = introspect<HostSchema>(React.createElement(Page, { title: 'initial' }), {
            depth: 'full',
            strictMode: false
        });
        const root = requireValue(view.root);

        view.update(React.createElement(Page, { title: 'updated' }));
        scope.assert(assertUpdatedView, view, root);

        return scope.assert.collect();
    }),
    test('unmounts the committed root', function (scope) {
        const view = introspect<HostSchema>(React.createElement(Page, { title: 'mounted' }), {
            depth: 'full',
            strictMode: false
        });
        const root = requireValue(view.root);

        view.unmount();
        scope.assert(assertUnmountedView, view, root);

        return scope.assert.collect();
    }),
    test('waits for committed renders and idle work', async function (scope) {
        const view = introspect<HostSchema>(React.createElement(Page, { title: 'first' }), {
            depth: 'full',
            strictMode: false
        });

        await scope.assert(assertWaits, view);

        return scope.assert.collect();
    }),
    test('wraps event props in React act', function (scope) {
        scope.assert(assertEventUpdate);

        return scope.assert.collect();
    }),
    test('preserves committed keyed host order after movement', function (scope) {
        scope.assert(assertKeyedInsertion);

        return scope.assert.collect();
    }),
    test('removes committed host children', function (scope) {
        scope.assert(assertHostChildRemoval);

        return scope.assert.collect();
    }),
    test('publishes empty and multi-child root snapshots', function (scope) {
        scope.assert(assertRootChildCounts);

        return scope.assert.collect();
    }),
    test('removes committed root children', function (scope) {
        scope.assert(assertRootChildRemoval);

        return scope.assert.collect();
    }),
    test('replaces the committed root host child', function (scope) {
        scope.assert(assertRootHostReplacement);

        return scope.assert.collect();
    }),
    test(
        'keeps the previous snapshot when a sync update suspends before commit',
        function (scope) {
            scope.assert(assertSuspendedUpdateRollback);

            return scope.assert.collect();
        }
    ),
    test(
        'reports a suspended initial root clearly',
        function (scope) {
            scope.assert(assertSuspendedInitialRoot);

            return scope.assert.collect();
        }
    ),
    test(
        'commits ready Suspense children without rendering fallback',
        function (scope) {
            scope.assert(assertSuspenseReadyChildren);

            return scope.assert.collect();
        }
    ),
    test(
        'renders React.use fulfilled promise values',
        function (scope) {
            scope.assert(assertUseFulfilledPromise);

            return scope.assert.collect();
        }
    ),
    test(
        'records React.use rejected promise errors',
        function (scope) {
            scope.assert(assertUseRejectedPromise);

            return scope.assert.collect();
        }
    ),
    test('routes timeout hooks through injected runtime', function (scope) {
        const unitRuntime = createUnitRuntimeDependencies();
        const timeoutEvents: string[] = [];
        const runtime: IntrospectionRuntimeDependencies = {
            ...unitRuntime,
            clock: {
                ...unitRuntime.clock,
                clearTimeout(timeoutIdentifier) {
                    timeoutEvents.push('clear');
                    unitRuntime.clock.clearTimeout(timeoutIdentifier);
                },
                setTimeout(handler, delayInMilliseconds, ...handlerArguments) {
                    timeoutEvents.push(`schedule:${delayInMilliseconds}:${String(handlerArguments[0])}`);

                    return unitRuntime.clock.setTimeout(handler, delayInMilliseconds, ...handlerArguments);
                }
            }
        };
        const timeoutIdentifier = runWithIntrospectionRuntime(runtime, function scheduleTimeout() {
            return scheduleIntrospectionTimeout(
                function recordTimeout(value: string) {
                    timeoutEvents.push(value);
                },
                5,
                'value'
            );
        });

        runWithIntrospectionRuntime(runtime, function cancelTimeout() {
            cancelIntrospectionTimeout(timeoutIdentifier);
        });

        scope.assert.deepEqual(timeoutEvents, [ 'schedule:5:value', 'clear' ]);
        scope.assert.throws(
            function scheduleWithoutRuntime() {
                const asyncResource = new AsyncResource('missing-introspection-runtime');

                asyncResource.runInAsyncScope(function runWithoutRuntime() {
                    scheduleIntrospectionTimeout(function noopTimeout() {
                        return undefined;
                    }, 0);
                });
            },
            { message: 'Expected Introspection runtime dependencies.' }
        );

        return scope.assert.collect();
    })
]);
