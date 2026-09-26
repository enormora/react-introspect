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
