import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type { IntrospectionView } from '../../public/introspect-public-types.ts';
import { createUnitIntrospectionView } from '../view/introspect-unit-view.test.ts';

type IconProps = {
    readonly title: string;
};

type CardProps = {
    readonly icon: React.ReactElement;
    readonly options: Readonly<Record<string, React.ReactElement>>;
};

function Icon(props: IconProps): React.ReactNode {
    return props.title;
}

function Card(): React.ReactNode {
    return null;
}

function introspectCard(): IntrospectionView {
    const options = Object.assign(Object.create(null) as Record<string, React.ReactElement>, {
        badge: React.createElement(Icon, { title: 'badge' })
    });
    const props: CardProps = {
        icon: React.createElement(Icon, { ref: { current: null }, title: 'icon' } as IconProps),
        options
    };

    return createUnitIntrospectionView(React.createElement(Card, props), { strictMode: false }) as IntrospectionView;
}

function readRootProps(view: IntrospectionView): Readonly<Record<PropertyKey, unknown>> {
    const props: unknown = view.root?.props;

    return typeof props === 'object' && props !== null ? props as Readonly<Record<PropertyKey, unknown>> : {};
}

function readNodeProps(value: unknown): unknown {
    return typeof value === 'object' && value !== null ? Reflect.get(value, 'props') : undefined;
}

export const testNode = suite('prop values on introspection nodes', [
    test('hides ref from the props of elements found in props', function (scope) {
        const view = introspectCard();

        scope.assert.deepEqual(readNodeProps(readRootProps(view).icon), { title: 'icon' });

        return scope.assert.collect();
    }),
    test('exposes elements inside null-prototype prop objects as introspection nodes', function (scope) {
        const view = introspectCard();
        const options: unknown = readRootProps(view).options;
        const badge: unknown = typeof options === 'object' && options !== null
            ? Reflect.get(options, 'badge')
            : undefined;

        scope.assert.equal(
            typeof badge === 'object' && badge !== null ? typeof Reflect.get(badge, 'findAll') : undefined,
            'function'
        );

        return scope.assert.collect();
    })
]);
