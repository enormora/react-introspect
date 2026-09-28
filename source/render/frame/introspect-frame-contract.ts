import React from 'react';
import type { IntrospectionError, IntrospectionNotRenderedReason } from '../../public/introspect-public-types.ts';
import { isObjectOrFunction, isThenable } from '../../values/introspect-value-kinds.ts';
import type { IntrospectionFrameDepth } from './introspect-frame-depth.ts';
import { assertSupportedReactValue } from './introspect-unsupported-react.ts';

export const introspectionComponentHostType = 'react-introspect-internal-component';
export const introspectionEmptyHostType = 'react-introspect-internal-empty';
export const introspectionOpaqueHostType = 'react-introspect-internal-opaque';

export const introspectionComponentMetadata = '__reactIntrospectionComponentMetadata';
export const introspectionElementKeyMetadata = '__reactIntrospectionElementKeyMetadata';
export const introspectionValueMetadata = '__reactIntrospectionValueMetadata';

export type IntrospectionElement = React.ReactElement<Readonly<Record<PropertyKey, unknown>>>;

type TransformedElement = Readonly<React.ReactElement>;
type TransformedChildren = readonly IntrospectionTransformedNode[];

export type IntrospectionTransformedNode = TransformedChildren | TransformedElement | number | string;

export type IntrospectionRenderChildren = (
    node: unknown,
    depth: IntrospectionFrameDepth
) => IntrospectionTransformedNode;

export type IntrospectionComponentMetadata = {
    readonly activityMode: 'hidden' | 'visible' | undefined;
    readonly caughtError: IntrospectionError | undefined;
    readonly givenChildren: unknown;
    readonly key: string | null;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly renderedReason: IntrospectionNotRenderedReason | undefined;
    readonly type: unknown;
};

const introspectionRenderErrors = new WeakSet();

function isPublicPropKey(key: PropertyKey): boolean {
    return key !== 'children' &&
        key !== 'key' &&
        key !== 'ref' &&
        key !== introspectionElementKeyMetadata;
}

function publicProps(props: Readonly<Record<PropertyKey, unknown>>): Readonly<Record<PropertyKey, unknown>> {
    const result: Record<PropertyKey, unknown> = {};

    for (const key of Reflect.ownKeys(props)) {
        if (isPublicPropKey(key)) {
            result[key] = props[key];
        }
    }

    return result;
}

export function readElementRef(element: IntrospectionElement): unknown {
    return element.props.ref;
}

export function createComponentMetadata(
    element: IntrospectionElement,
    renderedReason: IntrospectionNotRenderedReason | undefined,
    caughtError?: IntrospectionError,
    activityMode?: 'hidden' | 'visible'
): IntrospectionComponentMetadata {
    const { props } = element;

    assertSupportedReactValue(props.children);

    return {
        activityMode,
        caughtError,
        givenChildren: props.children,
        key: element.key,
        props: publicProps(props),
        renderedReason,
        type: element.type
    };
}

export function createComponentHost(
    metadata: IntrospectionComponentMetadata,
    children: IntrospectionTransformedNode
): React.ReactElement {
    return React.createElement(
        introspectionComponentHostType,
        {
            [introspectionComponentMetadata]: metadata
        },
        children
    );
}

export function createEmptyHost(value: unknown): React.ReactElement {
    return React.createElement(introspectionEmptyHostType, {
        [introspectionValueMetadata]: value
    });
}

export function throwIntrospectionRenderError(error: unknown): never {
    if (isObjectOrFunction(error) && !isThenable(error)) {
        introspectionRenderErrors.add(error);
    }

    throw error;
}

export function isIntrospectionRenderError(error: unknown): boolean {
    return isObjectOrFunction(error) && introspectionRenderErrors.has(error);
}
