import { suite, test } from '@overkill-dev/test';
import { defineCompositeAssertion } from '@overkill-dev/test/assert';
import React from 'react';
import type {
    IntrospectionNode,
    IntrospectionOptions,
    IntrospectionView
} from '../../public/introspect-public-types.ts';
import { createIntrospectionView } from '../../runtime/view/introspect-view.ts';
import {
    createIdNormalizer,
    normalizeSnapshotValue
} from '../../snapshot/normalization/introspect-id-normalization.ts';

type LabelHostSchema = {
    readonly label: {
        readonly htmlFor: string;
        readonly id: string;
        readonly title: string;
    };
};

function introspect<HostSchema extends Record<string, unknown>>(
    element: React.ReactElement,
    options: IntrospectionOptions<HostSchema>
): IntrospectionView<HostSchema> {
    return createIntrospectionView(element, options) as IntrospectionView<HostSchema>;
}

type IdLabelProps = {
    readonly onId: (id: string) => void;
};

function requireValue<Value>(value: Value | undefined): Value {
    if (value === undefined) {
        throw new Error('Expected value to exist.');
    }

    return value;
}

function Panel(): React.ReactNode {
    return React.createElement('section', null, 'panel');
}

function IdLabel(props: IdLabelProps): React.ReactNode {
    const id = React.useId();

    props.onId(id);

    return React.createElement(
        'label',
        {
            htmlFor: id,
            id,
            title: `${id} hint`
        },
        id
    );
}

const assertHiddenActivityNode = defineCompositeAssertion({
    assert(check, activity: IntrospectionNode) {
        return check.group([
            check.annotated('activity name').equal(activity.name, 'Activity'),
            check.annotated('activity visibility').equal(activity.visibility, 'hidden'),
            check.annotated('activity state').deepEqual(activity.state, {
                activityMode: 'hidden',
                reason: 'activity',
                rendered: true,
                visible: false
            })
        ]);
    },
    name: 'assertHiddenActivityNode'
});

const assertHiddenDescendant = defineCompositeAssertion({
    assert(check, node: IntrospectionNode) {
        return check.group([
            check.annotated('visibility').equal(node.visibility, 'hidden'),
            check.annotated('reason').equal(node.state.reason, 'activity'),
            check.annotated('visible state').false(node.state.visible)
        ]);
    },
    name: 'assertHiddenDescendant'
});

const assertVisibleActivity = defineCompositeAssertion({
    assert(check, view: IntrospectionView) {
        const activity = requireValue(view.find(React.Activity));
        const panel = requireValue(view.find(Panel));
        const section = requireValue(view.find('section'));

        return check.group([
            check.annotated('activity visibility').equal(activity.visibility, 'visible'),
            check.annotated('activity mode').equal(activity.state.activityMode, 'visible'),
            check.annotated('panel visibility').equal(panel.visibility, 'visible'),
            check.annotated('section visibility').equal(section.visibility, 'visible')
        ]);
    },
    name: 'assertVisibleActivity'
});

function createCyclicIdObject(id: string): Record<PropertyKey, unknown> {
    const value: Record<PropertyKey, unknown> = {};

    Object.setPrototypeOf(value, null);
    value.id = id;
    value.self = value;

    return value;
}

export const testNode = suite('React 19 special surfaces', [
    test('passes idPrefix through to React useId', function (scope) {
        const renderedIds: string[] = [];
        const view = introspect<LabelHostSchema>(
            React.createElement(IdLabel, {
                onId(id) {
                    renderedIds.push(id);
                }
            }),
            {
                depth: 'full',
                idPrefix: 'signup-',
                strictMode: false
            }
        );
        const label = requireValue(view.find('label'));
        const renderedId = requireValue(renderedIds[0]);

        scope.assert.equal(renderedId.startsWith('_signup-r_'), true);
        scope.assert.equal(label.props.id, renderedId);
        scope.assert.equal(label.props.htmlFor, renderedId);
        scope.assert.equal(label.textContent, renderedId);

        return scope.assert.collect();
    }),
    test('normalizes React ids in snapshots with idGenerator', function (scope) {
        const renderedIds: string[] = [];
        const generatedIds: string[] = [];
        const view = introspect<LabelHostSchema>(
            React.createElement(IdLabel, {
                onId(id) {
                    renderedIds.push(id);
                }
            }),
            {
                depth: 'full',
                idGenerator(generatedId) {
                    generatedIds.push(generatedId);

                    return `field-${generatedIds.length}`;
                },
                strictMode: false
            }
        );
        const label = requireValue(view.find('label'));
        const renderedId = requireValue(renderedIds[0]);

        scope.assert.equal(renderedId.startsWith('_react-introspect-'), true);
        scope.assert.deepEqual(generatedIds, [ renderedId ]);
        scope.assert.deepEqual(label.props, {
            htmlFor: 'field-1',
            id: 'field-1',
            title: 'field-1 hint'
        });
        scope.assert.equal(label.textContent, 'field-1');

        return scope.assert.collect();
    }),
    test('keeps unresolved generated ids and cuts cyclic props', function (scope) {
        const generatedId = '_react-introspect-edge-r_0_';
        const normalized = normalizeSnapshotValue(
            createCyclicIdObject(generatedId),
            createIdNormalizer({
                generator() {
                    return undefined as never;
                },
                prefix: 'react-introspect-edge-'
            })
        ) as Record<PropertyKey, unknown>;

        scope.assert.equal(normalized.id, generatedId);
        scope.assert.equal(normalized.self, '[Circular]');

        return scope.assert.collect();
    }),
    test('marks hidden Activity output and descendants invisible', function (scope) {
        const view = introspect(
            React.createElement(React.Activity, {
                children: React.createElement(Panel),
                mode: 'hidden'
            }),
            {
                depth: 'full',
                strictMode: false
            }
        );
        const activity = requireValue(view.find(React.Activity));
        const panel = requireValue(view.find(Panel));
        const section = requireValue(view.find('section'));

        scope.assert(assertHiddenActivityNode, activity);
        scope.assert(assertHiddenDescendant, panel);
        scope.assert(assertHiddenDescendant, section);
        scope.assert.equal(view.formatTree(), 'Activity\n  Panel\n    section\n      #text');

        return scope.assert.collect();
    }),
    test('updates Activity visibility when mode changes', function (scope) {
        const view = introspect(
            React.createElement(React.Activity, {
                children: React.createElement(Panel),
                mode: 'hidden'
            }),
            {
                depth: 'full',
                strictMode: false
            }
        );
        const hiddenActivity = requireValue(view.find(React.Activity));

        view.update(React.createElement(React.Activity, {
            children: React.createElement(Panel),
            mode: 'visible'
        }));

        scope.assert.equal(hiddenActivity.isStale, true);
        scope.assert(assertVisibleActivity, view);

        return scope.assert.collect();
    }),
    test('updates Activity text visibility when mode changes', function (scope) {
        const view = introspect(
            React.createElement(React.Activity, {
                children: 'loading',
                mode: 'hidden'
            }),
            {
                depth: 'full',
                strictMode: false
            }
        );
        const hiddenText = requireValue(view.find('#text'));

        view.update(React.createElement(React.Activity, {
            children: 'ready',
            mode: 'visible'
        }));

        const visibleText = requireValue(view.find('#text'));

        scope.assert.equal(hiddenText.visibility, 'hidden');
        scope.assert.equal(hiddenText.isStale, true);
        scope.assert.equal(visibleText.visibility, 'visible');
        scope.assert.equal(visibleText.textContent, 'ready');

        return scope.assert.collect();
    }),
    test('records ViewTransition as a queryable wrapper surface', function (scope) {
        const view = introspect(
            React.createElement(
                React.ViewTransition,
                { name: 'profile-card' },
                React.createElement('article', null, 'ready')
            ),
            {
                depth: 'full',
                strictMode: false
            }
        );
        const transition = requireValue(view.find(React.ViewTransition));

        scope.assert.equal(transition.name, 'ViewTransition');
        scope.assert.deepEqual(transition.props, { name: 'profile-card' });
        scope.assert.equal(view.find('article')?.textContent, 'ready');
        scope.assert.equal(view.formatTree(), 'ViewTransition\n  article\n    #text');

        return scope.assert.collect();
    })
]);
