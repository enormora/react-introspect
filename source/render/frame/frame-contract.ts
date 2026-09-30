import type React from 'react';
import type { IntrospectionFrameDepth } from './frame-depth.ts';

export type IntrospectionElement = React.ReactElement<Readonly<Record<PropertyKey, unknown>>>;

type TransformedElement = Readonly<React.ReactElement>;
type TransformedChildren = readonly IntrospectionTransformedNode[];

export type IntrospectionTransformedNode = TransformedChildren | TransformedElement | number | string;

export type IntrospectionRenderChildren = (
    node: unknown,
    depth: IntrospectionFrameDepth
) => IntrospectionTransformedNode;

export function readElementRef(element: IntrospectionElement): unknown {
    return element.props.ref;
}
