import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type { ProbeNode, ProbeView } from './probe-public-types.ts';
import { probe } from './react-probe.entry-point.ts';

type EqualScope = {
    readonly assert: {
        readonly deepEqual: (actual: unknown, expected: unknown) => void;
        readonly equal: (actual: unknown, expected: unknown) => void;
    };
};

type HostSchema = {
    readonly main: {
        readonly title: string;
    };
};

type PageProps = {
    readonly title: string;
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

function RendersNull(): React.ReactNode {
    return null;
}

function Suspends(): React.ReactNode {
    throw new SuspenseThenableError();
}

function assertFullRender(scope: EqualScope, view: ProbeView<HostSchema>): void {
    const main = requireValue(view.find('main'));
    const strong = requireValue(view.find('strong'));

    scope.assert.equal(view.renderCount, 1);
    scope.assert.equal(view.root?.type, Page);
    scope.assert.equal(view.textContent, 'Hello world');
    scope.assert.equal(main.props.title, 'world');
    scope.assert.equal(strong.textContent, 'world');
    scope.assert.equal(view.formatTree(), 'Page\n  main\n    #text\n    strong\n      #text');
}

function assertUpdatedView(scope: EqualScope, view: ProbeView<HostSchema>, staleRoot: ProbeNode): void {
    scope.assert.equal(staleRoot.isStale, true);
    scope.assert.equal(view.renderCount, 2);
    scope.assert.equal(view.textContent, 'Hello updated');
    scope.assert.equal(view.find('main')?.props.title, 'updated');
}

function assertUnmountedView(scope: EqualScope, view: ProbeView<HostSchema>, staleRoot: ProbeNode): void {
    scope.assert.equal(staleRoot.isStale, true);
    scope.assert.equal(view.renderCount, 2);
    scope.assert.equal(view.root, undefined);
    scope.assert.equal(view.textContent, '');
    scope.assert.equal(view.find('main'), undefined);
}

async function assertWaits(scope: EqualScope, view: ProbeView<HostSchema>): Promise<void> {
    await view.waitForNextRender();

    const nextRender = view.waitForNextRender();

    view.update(React.createElement(Page, { title: 'next' }));

    await nextRender;
    await view.waitForRenderCount(2);
    await view.waitUntil(function hasNextText() {
        return view.textContent === 'Hello next';
    });
    await view.waitForIdle();

    scope.assert.equal(view.textContent, 'Hello next');
}

function assertEventUpdate(scope: EqualScope): void {
    const view = probe(React.createElement(Clicker), {
        depth: 'full',
        strictMode: false
    });
    const button = requireValue(view.find('button'));

    button.sendEvent('click');

    scope.assert.equal(button.isStale, true);
    scope.assert.equal(view.textContent, 'on');
    scope.assert.equal(view.renderCount, 2);
}

function assertKeyedInsertion(scope: EqualScope): void {
    const view = probe(
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
}

function assertHostChildRemoval(scope: EqualScope): void {
    const view = probe(
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

    scope.assert.equal(view.find('em'), undefined);
    scope.assert.equal(view.textContent, 'first');
}

function assertRootChildCounts(scope: EqualScope): void {
    const emptyView = probe(React.createElement(RendersNull), {
        depth: 'full',
        strictMode: false
    });
    const fragmentView = probe(
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
}

function assertRootChildRemoval(scope: EqualScope): void {
    const view = probe(
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
}

function assertRootHostReplacement(scope: EqualScope): void {
    const view = probe(React.createElement('span', null, 'first'), {
        depth: 'full',
        strictMode: false
    });

    view.update(React.createElement('em', null, 'second'));

    scope.assert.equal(view.find('span'), undefined);
    scope.assert.equal(view.find('em')?.textContent, 'second');
}

function assertSuspendedUpdateRollback(scope: EqualScope): void {
    const view = probe(React.createElement(Page, { title: 'stable' }), {
        depth: 'full',
        strictMode: false,
        waitTimeout: 10
    });

    try {
        view.update(React.createElement(Suspends));
    } catch {
        scope.assert.equal(view.renderCount, 1);
        scope.assert.equal(view.textContent, 'Hello stable');

        return;
    }

    scope.assert.equal(view.renderCount, 1);
    scope.assert.equal(view.textContent, 'Hello stable');
}

export const testNode = suite('custom reconciler host layer', [
    test('publishes host and text output after a synchronous commit', function verifySyncRender(scope) {
        const view = probe<HostSchema>(React.createElement(Page, { title: 'world' }), {
            depth: 'full'
        });

        assertFullRender(scope, view);

        return scope.assert.collect();
    }),
    test('updates committed host snapshots', function verifyUpdate(scope) {
        const view = probe<HostSchema>(React.createElement(Page, { title: 'initial' }), {
            depth: 'full',
            strictMode: false
        });
        const root = requireValue(view.root);

        view.update(React.createElement(Page, { title: 'updated' }));
        assertUpdatedView(scope, view, root);

        return scope.assert.collect();
    }),
    test('unmounts the committed root', function verifyUnmount(scope) {
        const view = probe<HostSchema>(React.createElement(Page, { title: 'mounted' }), {
            depth: 'full',
            strictMode: false
        });
        const root = requireValue(view.root);

        view.unmount();
        assertUnmountedView(scope, view, root);

        return scope.assert.collect();
    }),
    test('waits for committed renders and idle work', async function verifyWaits(scope) {
        const view = probe<HostSchema>(React.createElement(Page, { title: 'first' }), {
            depth: 'full',
            strictMode: false,
            waitTimeout: 50
        });

        await assertWaits(scope, view);

        return scope.assert.collect();
    }),
    test('wraps event props in React act', function verifyEventUpdate(scope) {
        assertEventUpdate(scope);

        return scope.assert.collect();
    }),
    test('preserves committed keyed host order after movement', function verifyKeyedReorder(scope) {
        assertKeyedInsertion(scope);

        return scope.assert.collect();
    }),
    test('removes committed host children', function verifyHostChildRemoval(scope) {
        assertHostChildRemoval(scope);

        return scope.assert.collect();
    }),
    test('publishes empty and multi-child root snapshots', function verifyRootChildCounts(scope) {
        assertRootChildCounts(scope);

        return scope.assert.collect();
    }),
    test('removes committed root children', function verifyRootChildRemoval(scope) {
        assertRootChildRemoval(scope);

        return scope.assert.collect();
    }),
    test('replaces the committed root host child', function verifyRootHostReplacement(scope) {
        assertRootHostReplacement(scope);

        return scope.assert.collect();
    }),
    test(
        'keeps the previous snapshot when a sync update suspends before commit',
        function verifySuspendedRollback(scope) {
            assertSuspendedUpdateRollback(scope);

            return scope.assert.collect();
        }
    )
]);
