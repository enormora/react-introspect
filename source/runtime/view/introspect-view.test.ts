import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type { RuntimeIntrospectionView } from '../types/introspect-runtime-types.ts';
import { createUnitIntrospectionView, createUnitIntrospectionViewModule } from './introspect-unit-view.test.ts';

type ButtonProps = {
    readonly label: string;
    readonly onPress: () => string;
};

function Button(props: ButtonProps): React.ReactNode {
    return React.createElement('button', { onClick: props.onPress }, props.label);
}

type RecordedEvent = {
    readonly defaultPrevented: unknown;
    readonly defaultPreventedByMethod: unknown;
    readonly nativeEvent: unknown;
    readonly propagationStopped: unknown;
    readonly target: unknown;
    readonly type: unknown;
};

type HostEventStub = {
    readonly defaultPrevented: boolean;
    readonly isDefaultPrevented: () => boolean;
    readonly isPropagationStopped: () => boolean;
    readonly nativeEvent: unknown;
    readonly preventDefault: () => void;
    readonly stopPropagation: () => void;
    readonly target: unknown;
    readonly type: string;
};

type SaveButtonProps = {
    readonly onSave: (...values: readonly unknown[]) => void;
};

function SaveButton(props: SaveButtonProps): React.ReactNode {
    return React.createElement('button', { onClick: props.onSave }, 'Save');
}

function createEventForm(record: (event: RecordedEvent) => void): React.ReactElement {
    function recordEvent(event: HostEventStub, handle: (stub: HostEventStub) => void): void {
        handle(event);
        record({
            defaultPrevented: event.defaultPrevented,
            defaultPreventedByMethod: event.isDefaultPrevented(),
            nativeEvent: event.nativeEvent,
            propagationStopped: event.isPropagationStopped(),
            target: event.target,
            type: event.type
        });
    }

    return React.createElement(
        'form',
        {
            onSubmit(event: HostEventStub) {
                recordEvent(event, function cancelSubmit(stub) {
                    stub.preventDefault();
                    stub.stopPropagation();
                });
            }
        },
        React.createElement('input', {
            onChange(event: HostEventStub) {
                recordEvent(event, function ignoreChange() {
                    return undefined;
                });
            }
        })
    );
}

function IdLabel(): React.ReactNode {
    return React.createElement('span', { id: React.useId() }, 'label');
}

function Frame(props: React.PropsWithChildren): React.ReactNode {
    return props.children;
}

export const testNode = suite('introspection view', [
    test('applies preconfigured defaults with per-call options overriding key by key', function (scope) {
        const introspectWithDefaults = createUnitIntrospectionViewModule().preconfigure({
            depth: 'full',
            idPrefix: 'preset-',
            strictMode: false
        });
        const element = React.createElement(Frame, null, React.createElement(IdLabel));

        function usesPresetIdPrefix(view: RuntimeIntrospectionView): boolean {
            const id = view.find('span')?.props.id;

            return typeof id === 'string' && id.includes('preset-');
        }

        scope.assert.deepEqual({
            defaultsOnly: usesPresetIdPrefix(introspectWithDefaults(element, {})),
            depthOverridden: introspectWithDefaults(element, { depth: 1 }).find('span'),
            otherDefaultsKept: usesPresetIdPrefix(introspectWithDefaults(element, { depth: 2 }))
        }, {
            defaultsOnly: true,
            depthOverridden: undefined,
            otherDefaultsKept: true
        });

        return scope.assert.collect();
    }),
    test('replaces default arrays with per-call arrays', function (scope) {
        const introspectWithDefaults = createUnitIntrospectionViewModule().preconfigure({
            strictMode: false,
            transparent: [ Frame ]
        });
        const element = React.createElement(Frame, null, React.createElement(IdLabel));

        scope.assert.deepEqual({
            withDefault: introspectWithDefaults(element, {}).find('span')?.textContent,
            withReplacement: introspectWithDefaults(element, { transparent: [] }).find('span')
        }, {
            withDefault: 'label',
            withReplacement: undefined
        });

        return scope.assert.collect();
    }),
    test('passes an event stub with per-call overrides to host event handlers', function (scope) {
        const recorded: RecordedEvent[] = [];
        const view = createUnitIntrospectionView(
            createEventForm(function recordEvent(event) {
                recorded.push(event);
            }),
            { strictMode: false }
        );

        view.find('form')?.sendEvent('submit');
        view.find('input')?.sendEvent('change', { target: { value: 'Ada' } });

        scope.assert.deepEqual(recorded, [
            {
                defaultPrevented: true,
                defaultPreventedByMethod: true,
                nativeEvent: undefined,
                propagationStopped: true,
                target: undefined,
                type: 'submit'
            },
            {
                defaultPrevented: false,
                defaultPreventedByMethod: false,
                nativeEvent: undefined,
                propagationStopped: false,
                target: { value: 'Ada' },
                type: 'change'
            }
        ]);

        return scope.assert.collect();
    }),
    test('layers hostEvent defaults under per-call overrides', function (scope) {
        const recorded: RecordedEvent[] = [];
        const view = createUnitIntrospectionView(
            createEventForm(function recordEvent(event) {
                recorded.push(event);
            }),
            {
                hostEvent: { nativeEvent: { isTrusted: false }, target: { value: 'default' } },
                strictMode: false
            }
        );

        view.find('input')?.sendEvent('change');
        view.find('input')?.sendEvent('change', { target: { value: 'Ada' } });

        scope.assert.deepEqual(
            recorded.map(function readEventData(event) {
                return { nativeEvent: structuredClone(event.nativeEvent), target: event.target };
            }),
            [
                { nativeEvent: { isTrusted: false }, target: { value: 'default' } },
                { nativeEvent: { isTrusted: false }, target: { value: 'Ada' } }
            ]
        );

        return scope.assert.collect();
    }),
    test('passes component event arguments verbatim', function (scope) {
        const received: (readonly unknown[])[] = [];
        const view = createUnitIntrospectionView(
            React.createElement(SaveButton, {
                onSave(...values) {
                    received.push(values);
                }
            }),
            { depth: 0, strictMode: false }
        );

        view.find(SaveButton)?.sendEvent('save', 42);
        view.find(SaveButton)?.sendEvent('save');

        scope.assert.deepEqual(received, [ [ 42 ], [] ]);

        return scope.assert.collect();
    }),
    test('creates queryable views from React elements', function (scope) {
        const view = createUnitIntrospectionView(
            React.createElement(Button, {
                label: 'Save',
                onPress() {
                    return 'saved';
                }
            }),
            {
                strictMode: false,
                warningMode: 'capture'
            }
        );

        scope.assert.equal(view.root?.name, 'Button');
        scope.assert.equal(view.find('button')?.textContent, 'Save');
        scope.assert.equal(view.locate('button').sendEvent('click'), 'saved');
        scope.assert.equal(view.locateAll('button').length, 1);
        scope.assert.equal(view.textContent, 'Save');

        return scope.assert.collect();
    }),
    test('updates and unmounts the current snapshot', function (scope) {
        const view = createUnitIntrospectionView(React.createElement('span', null, 'One'), {
            strictMode: false,
            warningMode: 'capture'
        });

        view.update(React.createElement('span', null, 'Two'));
        scope.assert.equal(view.textContent, 'Two');

        view.unmount();
        scope.assert.equal(view.formatTree(), '');
        scope.assert.equal(view.hasWarnings, false);
        scope.assert.equal(view.renderedChildren.length, 0);
        scope.assert.equal(view.root, undefined);

        return scope.assert.collect();
    })
]);
