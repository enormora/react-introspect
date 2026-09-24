import { suite, test } from '@overkill-dev/test';
import React from 'react';
import { createIntrospectionView } from './introspect-view.ts';

type ButtonProps = {
    readonly label: string;
    readonly onPress: () => string;
};

function Button(props: ButtonProps): React.ReactNode {
    return React.createElement('button', { onClick: props.onPress }, props.label);
}

export const testNode = suite('introspection view', [
    test('creates queryable views from React elements', function (scope) {
        const view = createIntrospectionView(
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
        const view = createIntrospectionView(React.createElement('span', null, 'One'), {
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
