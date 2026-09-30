import { suite, test } from '@overkill-dev/test';
import React from 'react';
import { classifyElementType } from './element-kind.ts';

function Label(): React.ReactNode {
    return null;
}

const LabelClass = class extends React.Component<React.PropsWithChildren> {
    public override render(): React.ReactNode {
        return this.props.children;
    }
};

function readKind(type: unknown): string {
    return classifyElementType(type).kind;
}

export const testNode = suite('React element kinds', [
    test('classifies built-in and component element types', function (scope) {
        const MemoLabel = React.memo(Label);
        const ForwardLabel = React.forwardRef(Label);
        const LazyLabel = React.lazy(async function loadLabel() {
            return { default: Label };
        });
        const LabelContext = React.createContext(undefined);

        scope.assert.deepEqual(
            [
                'button',
                React.Fragment,
                React.Suspense,
                Symbol.for('react.activity'),
                Symbol.for('react.view_transition'),
                React.StrictMode,
                React.Profiler,
                LabelContext,
                LabelContext.Consumer,
                MemoLabel,
                ForwardLabel,
                LazyLabel,
                LabelClass,
                Label,
                Symbol.for('react.unknown')
            ]
                .map(readKind),
            [
                'host',
                'fragment',
                'suspense',
                'activity',
                'viewTransition',
                'strictMode',
                'profiler',
                'context',
                'consumer',
                'memo',
                'forwardRef',
                'lazy',
                'class',
                'function',
                'other'
            ]
        );

        return scope.assert.collect();
    }),
    test('treats malformed React type records as other', function (scope) {
        scope.assert.deepEqual(
            [
                { $$typeof: Symbol.for('react.memo') },
                { $$typeof: Symbol.for('react.forward_ref'), render: 'not callable' },
                { $$typeof: Symbol.for('react.forward_ref') },
                { $$typeof: Symbol.for('react.lazy'), _init: 'not callable', _payload: undefined },
                { $$typeof: Symbol.for('react.lazy'), _init: Label },
                { $$typeof: Symbol.for('react.consumer'), _context: 'not a context' }
            ]
                .map(readKind),
            [ 'other', 'other', 'other', 'other', 'other', 'other' ]
        );

        return scope.assert.collect();
    }),
    test('lets a React type marker win over a function carrying it', function (scope) {
        const markedFunction = Object.assign(Label.bind(undefined), {
            $$typeof: Symbol.for('react.forward_ref'),
            render: Label
        });

        scope.assert.equal(readKind(markedFunction), 'forwardRef');

        return scope.assert.collect();
    }),
    test('exposes the payload each wrapper kind needs to execute', function (scope) {
        const memoKind = classifyElementType(React.memo(Label));
        const lazyKind = classifyElementType({
            $$typeof: Symbol.for('react.lazy'),
            _init(payload: unknown) {
                return payload;
            },
            _payload: Label
        });
        const hostKind = classifyElementType('section');

        scope.assert.equal(memoKind.kind === 'memo' ? memoKind.inner : undefined, Label);
        scope.assert.equal(lazyKind.kind === 'lazy' ? lazyKind.initialize() : undefined, Label);
        scope.assert.equal(hostKind.kind === 'host' ? hostKind.name : undefined, 'section');

        return scope.assert.collect();
    })
]);
