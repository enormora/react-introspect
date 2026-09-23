import type React from 'react';
import type {
    IntrospectionFakeRefNode,
    IntrospectionHostSchema,
    IntrospectionOptions,
    IntrospectionRefMatcher,
    IntrospectionRefRule,
    IntrospectionView
} from './introspect-public-types.js';
import {
    createFakeRefNode as createFakeRefNodeImplementation,
    matchRefs as matchRefsImplementation
} from './introspect-ref.ts';
import { createIntrospectionView } from './introspect-view.ts';

export type {
    GivenChildren,
    IntrospectionError,
    IntrospectionFakeRefNode,
    IntrospectionList,
    IntrospectionListLocator,
    IntrospectionLocator,
    IntrospectionNode,
    IntrospectionNodeState,
    IntrospectionOptions,
    IntrospectionRefMatcher,
    IntrospectionRefRule,
    IntrospectionRefs,
    IntrospectionRefSelector,
    IntrospectionRefShorthand,
    IntrospectionRefTarget,
    IntrospectionSelector,
    IntrospectionView,
    IntrospectionWarning,
    RenderedChildren
} from './introspect-public-types.js';

export function introspect<HostSchema extends Record<string, unknown> = Record<string, unknown>>(
    element: React.ReactElement,
    options?: IntrospectionOptions<HostSchema>
): IntrospectionView<HostSchema>;
export function introspect(element: React.ReactElement, options: IntrospectionOptions = {}): unknown {
    return createIntrospectionView(element, options);
}

export const createFakeRefNode: <Node>(node: Node) => IntrospectionFakeRefNode<Node> = createFakeRefNodeImplementation;

export const matchRefs: <HostSchema extends IntrospectionHostSchema>(
    rules: readonly IntrospectionRefRule<HostSchema>[]
) => IntrospectionRefMatcher<HostSchema> = matchRefsImplementation;
