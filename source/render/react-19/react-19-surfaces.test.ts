import { suite, test } from '@overkill-dev/test';
import { defineCompositeAssertion } from '@overkill-dev/test/assert';
import React from 'react';
import type {
    IntrospectionNode,
    IntrospectionOptions,
    IntrospectionView
} from '../../public/public-types.ts';
import { createUnitIntrospectionView } from '../../runtime/view/unit-view.test.ts';
import {
    createIdNormalizer,
    normalizeSnapshotValue
} from '../../snapshot/normalization/id-normalization.ts';

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
    return createUnitIntrospectionView(element, options) as IntrospectionView<HostSchema>;
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
    test('keeps unresolved generated ids', function (scope) {
        const generatedId = '_react-introspect-edge-r_0_';
        const normalized = normalizeSnapshotValue(
            generatedId,
            createIdNormalizer({
                generator() {
                    return undefined as never;
                },
                prefix: 'react-introspect-edge-'
            })
        );

        scope.assert.equal(normalized, generatedId);

        return scope.assert.collect();
    }),
    test('marks hidden Activity output and descendants invisible once idle', async function (scope) {
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

        await view.waitForIdle();

        const activity = requireValue(view.find(React.Activity));
        const panel = requireValue(view.find(Panel));
        const section = requireValue(view.find('section'));

        scope.assert.deepEqual({
            name: activity.name,
            state: activity.state,
            visibility: activity.visibility
        }, {
            name: 'Activity',
            state: {
                activityMode: 'hidden',
                reason: 'activity',
                rendered: true,
                visible: false
            },
            visibility: 'hidden'
        });
        scope.assert(assertHiddenDescendant, panel);
        scope.assert(assertHiddenDescendant, section);
        scope.assert.equal(view.formatTree(), 'Activity\n  Panel\n    section\n      #text');

        return scope.assert.collect();
    }),
    test('defers hidden Activity content until the view is idle', async function (scope) {
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
        const panelBeforeIdle = view.find(Panel);

        await view.waitForIdle();

        scope.assert.deepEqual(
            { panelAfterIdle: view.find(Panel)?.name, panelBeforeIdle },
            { panelAfterIdle: 'Panel', panelBeforeIdle: undefined }
        );

        return scope.assert.collect();
    }),
    test('marks components below the depth inside hidden Activity as hidden once idle', async function (scope) {
        const view = introspect(
            React.createElement(React.Activity, {
                children: React.createElement(Panel),
                mode: 'hidden'
            }),
            {
                depth: 0,
                strictMode: false
            }
        );

        await view.waitForIdle();

        const panel = requireValue(view.find(Panel));

        scope.assert.deepEqual({ state: panel.state, visibility: panel.visibility }, {
            state: { activityMode: undefined, reason: 'depth', rendered: false, visible: false },
            visibility: 'hidden'
        });

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

        const activity = requireValue(view.find(React.Activity));
        const panel = requireValue(view.find(Panel));
        const section = requireValue(view.find('section'));

        scope.assert.deepEqual({
            activityMode: activity.state.activityMode,
            activityVisibility: activity.visibility,
            hiddenActivityStale: hiddenActivity.isStale,
            panelVisibility: panel.visibility,
            sectionVisibility: section.visibility
        }, {
            activityMode: 'visible',
            activityVisibility: 'visible',
            hiddenActivityStale: true,
            panelVisibility: 'visible',
            sectionVisibility: 'visible'
        });

        return scope.assert.collect();
    }),
    test('updates Activity text visibility when mode changes', async function (scope) {
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

        await view.waitForIdle();

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
