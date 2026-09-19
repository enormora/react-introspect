import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type { ProbeNode, ProbeView } from './probe-public-types.ts';
import { probe } from './react-probe.entry-point.ts';

type ButtonProps = {
    readonly disabled: boolean;
    readonly label: string;
    readonly onSave: () => void;
};

type HostSchema = {
    readonly button: {
        readonly disabled: boolean;
        readonly metadata: {
            readonly group: string;
        };
        readonly onClick: (value: string) => void;
        readonly type: 'button' | 'submit';
    };
};

type EqualScope = {
    readonly assert: {
        readonly deepEqual: (actual: unknown, expected: unknown) => void;
        readonly equal: (actual: unknown, expected: unknown) => void;
    };
};

type HostView = ProbeView<HostSchema>;

type HostButton = ProbeNode<HostSchema['button'], 'button', HostSchema>;

type UnsafeEventTarget = {
    readonly callProp: (property: PropertyKey) => unknown;
    readonly sendEvent: (name: string, ...parameters: readonly unknown[]) => unknown;
};

type PropCallState = {
    readonly hostView: HostView;
    readonly readClickValue: () => string;
    readonly readSaveCalls: () => number;
    readonly view: ProbeView;
};

type ButtonIdentity = {
    readonly name: string;
    readonly props: {
        readonly label: string;
    };
    readonly type: unknown;
    readonly visibility: string;
};

function requireValue<Value>(value: Value | undefined): Value {
    if (value === undefined) {
        throw new Error('Expected value to exist.');
    }

    return value;
}

function noop(): void {
    return undefined;
}

function alwaysTrue(): boolean {
    return true;
}

function alwaysFalse(): boolean {
    return false;
}

function assertThrows(scope: EqualScope, action: () => void, message: string): void {
    try {
        action();
    } catch (error) {
        scope.assert.equal(error instanceof Error ? error.message : String(error), message);

        return;
    }

    throw new Error('Expected action to throw.');
}

function Button(props: React.PropsWithChildren<ButtonProps>): React.ReactNode {
    Reflect.ownKeys(props);

    return null;
}

function Panel(props: React.PropsWithChildren<{ readonly title: string; }>): React.ReactNode {
    return props.title.slice(0, 0);
}

Panel.displayName = 'DisplayPanel';

const MemoButton = React.memo(Button);

function assertRenderedList(scope: EqualScope, view: HostView): void {
    scope.assert.equal(view.renderedChildren.length, 2);
    scope.assert.equal(view.renderedChildren.first?.textContent, 'Save ');
    scope.assert.equal(view.renderedChildren.last?.textContent, 'now');
    scope.assert.equal(view.renderedChildren.at(1)?.name, 'strong');
    scope.assert.equal(Array.from(view.renderedChildren).length, 2);
    scope.assert.equal(view.renderedChildren.filterBy('#text').first?.textContent, 'Save ');
}

function assertHostNode(scope: EqualScope, button: HostButton): void {
    scope.assert.equal(button.find('strong')?.textContent, 'now');
    scope.assert.equal(button.findAll('strong').length, 1);
    scope.assert.equal(button.givenChildren.length, 2);
    scope.assert.equal(button.state.rendered, true);
    scope.assert.equal(button.visibility, 'visible');
    scope.assert.equal(button.error, undefined);
    scope.assert.equal(button.key, null);
    scope.assert.equal(button.type, 'button');
}

function assertHostProps(scope: EqualScope, button: HostButton): void {
    scope.assert.deepEqual(button.pickProps([ 'disabled' ]), {
        disabled: false
    });
    scope.assert.deepEqual(button.omitProps([ 'disabled' ]), {
        type: 'submit'
    });
}

function assertHostView(
    scope: EqualScope,
    view: HostView,
    button: HostButton,
    strong: ProbeNode
): void {
    scope.assert.equal(button.textContent, 'Save now');
    scope.assert.equal(strong.textContent, 'now');
    scope.assert.equal(view.find({ has: { type: 'strong' } })?.path, button.path);
    scope.assert.equal(strong.findClosest('button')?.path, button.path);
    scope.assert.equal(strong.findClosest('main'), undefined);
    scope.assert.equal(button.findClosest('main'), undefined);
    scope.assert.equal(button.formatTree(), 'button\n  #text\n  strong\n    #text');
}

function assertRenderedChildren(scope: EqualScope, button: HostButton): void {
    const { renderedChildren } = button;

    if (renderedChildren.status !== 'rendered') {
        throw new Error('Expected rendered children.');
    }

    scope.assert.equal(renderedChildren.nodes.length, 2);
}

function assertHostCapabilities(scope: EqualScope, view: HostView, button: HostButton): void {
    assertRenderedList(scope, view);
    assertRenderedChildren(scope, button);
    assertHostNode(scope, button);
    assertHostProps(scope, button);
}

function assertSelectorMatches(scope: EqualScope, view: HostView, buttonPath: string): void {
    scope.assert.equal(view.find({ props: {}, type: '#text' })?.name, '#text');
    scope.assert.equal(view.find({ key: 'save' })?.path, buttonPath);
    scope.assert.equal(view.find({ key: 'missing' }), undefined);
    scope.assert.equal(view.find({ textContent: /save/i, type: '#text' })?.path, `${buttonPath} > #text[0]`);
    scope.assert.equal(view.find({ textContent: undefined } as never)?.name, 'form');
}

function assertSelectorMisses(scope: EqualScope, view: HostView): void {
    scope.assert.equal(view.find({ props: { metadata: 'primary' } }), undefined);
    scope.assert.equal(view.find({ has: { type: 'input' } }), undefined);
    scope.assert.equal(view.find({ type: 'button', where: alwaysFalse }), undefined);
}

function createSelectorView(): HostView {
    return probe<HostSchema>(React.createElement(
        'form',
        { id: 'settings' },
        React.createElement(
            'button',
            {
                disabled: true,
                key: 'save',
                metadata: { group: 'primary' },
                type: 'submit'
            },
            'Save'
        )
    ));
}

function createEdgeView(): ProbeView {
    return probe(
        React.createElement(
            React.Fragment,
            null,
            React.createElement(Panel, { title: 'Info' }),
            React.createElement(MemoButton, {
                disabled: false,
                label: 'Memo',
                onSave: noop
            }),
            [
                null,
                false,
                React.createElement('span', { key: 'array' }, 1)
            ],
            new Set([
                React.createElement('em', { key: 'iterable' }, 'set')
            ]),
            { opaque: true } as never
        ),
        { depth: 0 }
    );
}

function assertEdgeNames(scope: EqualScope, view: ProbeView): void {
    scope.assert.equal(view.root?.name, 'Fragment');
    scope.assert.equal(view.find(Panel)?.name, 'DisplayPanel');
    scope.assert.equal(view.find(MemoButton)?.name, 'Component');
    scope.assert.equal(view.find('span')?.textContent, '1');
    scope.assert.equal(view.find('em')?.textContent, 'set');
}

function assertOpaqueEdge(scope: EqualScope, view: ProbeView): void {
    const opaque = requireValue(view.find('opaque'));

    scope.assert.deepEqual(opaque.renderedChildren, {
        reason: 'unsupported',
        status: 'notRendered'
    });
}

function unsafeTarget(target: unknown): UnsafeEventTarget {
    return target as UnsafeEventTarget;
}

function assertPropErrors(scope: EqualScope, button: unknown, hostButton: unknown, view: ProbeView): void {
    assertThrows(scope, function callMissingProp() {
        unsafeTarget(button).callProp('missing');
    }, 'Prop missing is not callable.');
    assertThrows(scope, function callMissingLocatorProp() {
        unsafeTarget(view.locate(Button)).callProp('missing');
    }, 'Prop missing is not callable.');
    assertThrows(scope, function sendMissingEvent() {
        unsafeTarget(hostButton).sendEvent('submit');
    }, 'Prop onSubmit is not callable.');
    assertThrows(scope, function callMissingLocator() {
        unsafeTarget(view.locate('missing')).callProp('value');
    }, 'Cannot call a prop on a missing locator.');
    assertThrows(scope, function sendMissingLocator() {
        unsafeTarget(view.locate('missing')).sendEvent('click');
    }, 'Cannot send an event to a missing locator.');
}

function createPropCallState(): PropCallState {
    let saveCalls = 0;
    let clickValue = '';
    const view = probe(React.createElement(Button, {
        disabled: false,
        label: 'Save',
        onSave() {
            saveCalls += 1;
        }
    }));
    const hostView = probe<HostSchema>(React.createElement('button', {
        onClick(value: string) {
            clickValue = value;
        },
        type: 'button'
    }));

    return {
        hostView,
        readClickValue() {
            return clickValue;
        },
        readSaveCalls() {
            return saveCalls;
        },
        view
    };
}

function performPropCalls(state: PropCallState): void {
    const button = requireValue(state.view.find(Button));
    const locator = state.view.locate(Button);
    const hostButton = requireValue(state.hostView.find('button'));

    button.callProp('onSave');
    locator.callProp('onSave');
    hostButton.sendEvent('click', 'sent');
    state.hostView.locate('button').sendEvent('click', 'located');
}

function assertPropCallState(scope: EqualScope, state: PropCallState): void {
    scope.assert.equal(state.readSaveCalls(), 2);
    scope.assert.equal(state.readClickValue(), 'located');
    scope.assert.equal(state.view.locate(Button).exists, true);
    scope.assert.equal(state.view.locate('missing').exists, false);
    assertPropErrors(
        scope,
        requireValue(state.view.find(Button)),
        requireValue(state.hostView.find('button')),
        state.view
    );
}

function assertInitialListLocator(scope: EqualScope, items: ReturnType<ProbeView['locateAll']>): void {
    scope.assert.equal(items.length, 1);
    scope.assert.equal(items.first?.textContent, 'one');
    scope.assert.equal(items.at(0)?.textContent, 'one');
    scope.assert.equal(Array.from(items).length, 1);
}

function assertUpdatedListLocator(scope: EqualScope, items: ReturnType<ProbeView['locateAll']>): void {
    scope.assert.equal(items.length, 2);
    scope.assert.equal(items.last?.textContent, 'two');
    scope.assert.equal(items.at(1)?.textContent, 'two');
}

function assertUnmountedView(scope: EqualScope, view: ProbeView, root: ProbeView['root']): void {
    const staleRoot = requireValue(root);

    scope.assert.equal(staleRoot.isStale, true);
    scope.assert.equal(view.root, undefined);
    scope.assert.equal(view.renderedChildren.length, 0);
    scope.assert.equal(view.findAll('main').length, 0);
    scope.assert.equal(view.textContent, '');
    scope.assert.equal(view.formatTree(), '');
}

function assertViewDiagnostics(scope: EqualScope, view: ProbeView): void {
    const currentView = view as ProbeView & { readonly currentSnapshot: { readonly renderCount: number; }; };

    scope.assert.deepEqual(view.errors, []);
    scope.assert.deepEqual(view.warnings, []);
    scope.assert.equal(view.hasWarnings, false);
    scope.assert.equal(view.textContent, 'content');
    scope.assert.equal(currentView.currentSnapshot.renderCount, 1);
}

async function assertStaticWaits(scope: EqualScope): Promise<void> {
    const view = probe(React.createElement('main', null, 'static'));

    await view.waitForIdle();
    await view.waitForNextRender();
    await view.waitForRenderCount(1);
    await view.waitUntil(alwaysTrue);

    scope.assert.equal(view.textContent, 'static');
}

function assertButtonIdentity(
    scope: EqualScope,
    button: ButtonIdentity | undefined
): void {
    const foundButton = requireValue(button);

    scope.assert.equal(Object.isFrozen(button), true);
    scope.assert.equal(foundButton.type, Button);
    scope.assert.equal(foundButton.name, 'Button');
    scope.assert.equal(foundButton.props.label, 'Save');
    scope.assert.equal(foundButton.visibility, 'visible');
}

export const testNode = suite('public API skeleton', [
    test('captures an immutable shallow component node', function verifyShallowComponentNode(scope) {
        const view = probe(React.createElement(Button, {
            disabled: true,
            label: 'Save',
            onSave: noop
        }));

        const button = view.find(Button);
        const foundButton = requireValue(button);
        const pickedProps = foundButton.pickProps([ 'label', 'disabled' ]);
        const omittedProps = foundButton.omitProps([ 'onSave' ]);

        assertButtonIdentity(scope, button);
        scope.assert.deepEqual(pickedProps, {
            disabled: true,
            label: 'Save'
        });
        scope.assert.deepEqual(omittedProps, {
            disabled: true,
            label: 'Save'
        });
        scope.assert.equal(foundButton.renderedChildren.status, 'rendered');

        return scope.assert.collect();
    }),
    test('normalizes host children and text content', function verifyHostSnapshots(scope) {
        const view = probe<HostSchema>(React.createElement(
            'button',
            { disabled: false, type: 'submit' },
            'Save ',
            React.createElement('strong', null, 'now')
        ));
        const button = view.find('button');
        const strong = view.find({
            props: {},
            textContent: 'now',
            type: 'strong'
        });
        const foundButton = requireValue(button);
        const foundStrong = requireValue(strong);

        assertHostView(scope, view, foundButton, foundStrong);
        assertHostCapabilities(scope, view, foundButton);

        return scope.assert.collect();
    }),
    test('matches selector variants', function verifySelectors(scope) {
        const view = createSelectorView();
        const button = requireValue(view.find('button'));

        scope.assert.equal(view.find({ props: { metadata: { group: 'primary' } } })?.path, button.path);
        scope.assert.equal(view.find({ type: 'button', where: alwaysTrue })?.path, button.path);
        assertSelectorMatches(scope, view, button.path);
        assertSelectorMisses(scope, view);

        return scope.assert.collect();
    }),
    test('normalizes unusual children and component names', function verifySnapshotEdges(scope) {
        const view = createEdgeView();

        assertEdgeNames(scope, view);
        assertOpaqueEdge(scope, view);
        scope.assert.equal(
            view.formatTree(),
            'Fragment\n  DisplayPanel\n  Component\n  #empty\n  #empty\n  span\n    #text\n  em\n    #text\n  Opaque'
        );

        return scope.assert.collect();
    }),
    test('calls props and reports missing calls', function verifyPropCalls(scope) {
        const state = createPropCallState();

        performPropCalls(state);
        assertPropCallState(scope, state);

        return scope.assert.collect();
    }),
    test('keeps old node handles stale after updates', function verifyStaleness(scope) {
        const view = probe(React.createElement(Button, {
            disabled: false,
            label: 'Save',
            onSave: noop
        }));
        const locator = view.locate(Button);
        const firstButton = locator.node;

        view.update(React.createElement(Button, {
            disabled: true,
            label: 'Save',
            onSave: noop
        }));

        const staleButton = requireValue(firstButton);

        scope.assert.equal(staleButton.isStale, true);
        scope.assert.equal(locator.node?.props.disabled, true);
        scope.assert.equal(view.renderCount, 2);

        return scope.assert.collect();
    }),
    test('exposes live list locators', function verifyListLocator(scope) {
        const view = probe(React.createElement('ol', null, React.createElement('li', null, 'one')));
        const items = view.locateAll('li');

        assertInitialListLocator(scope, items);

        view.update(React.createElement(
            'ol',
            null,
            React.createElement('li', null, 'one'),
            React.createElement('li', null, 'two')
        ));

        assertUpdatedListLocator(scope, items);

        return scope.assert.collect();
    }),
    test('unmounts the live root', function verifyUnmount(scope) {
        const view = probe(React.createElement('main', null, 'content'));
        const { root } = view;

        view.unmount();

        assertUnmountedView(scope, view, root);

        return scope.assert.collect();
    }),
    test('exposes inert diagnostics and waits', async function verifyViewSupport(scope) {
        const view = probe(React.createElement('main', null, 'content'), {
            depth: 'full',
            errorMode: 'capture',
            strictMode: true,
            waitTimeout: 10,
            warningMode: 'ignore'
        });

        await view.waitForIdle();
        await view.waitForNextRender();
        await view.waitForRenderCount(1);
        await view.waitUntil(alwaysTrue);
        await assertStaticWaits(scope);

        assertViewDiagnostics(scope, view);

        return scope.assert.collect();
    })
]);
