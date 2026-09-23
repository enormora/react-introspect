import type React from 'react';
import type {
    ReflectFakeRefNode,
    ReflectHostSchema,
    ReflectOptions,
    ReflectRefMatcher,
    ReflectRefRule,
    ReflectView
} from './reflect-public-types.js';
import {
    createFakeRefNode as createFakeRefNodeImplementation,
    matchRefs as matchRefsImplementation
} from './reflect-ref.ts';
import { createReflectView } from './reflect-view.ts';

export type {
    GivenChildren,
    ReflectError,
    ReflectFakeRefNode,
    ReflectList,
    ReflectListLocator,
    ReflectLocator,
    ReflectNode,
    ReflectNodeState,
    ReflectOptions,
    ReflectRefMatcher,
    ReflectRefRule,
    ReflectRefs,
    ReflectRefSelector,
    ReflectRefShorthand,
    ReflectRefTarget,
    ReflectSelector,
    ReflectView,
    ReflectWarning,
    RenderedChildren
} from './reflect-public-types.js';

export function reflect<HostSchema extends Record<string, unknown> = Record<string, unknown>>(
    element: React.ReactElement,
    options?: ReflectOptions<HostSchema>
): ReflectView<HostSchema>;
export function reflect(element: React.ReactElement, options: ReflectOptions = {}): unknown {
    return createReflectView(element, options);
}

export const createFakeRefNode: <Node>(node: Node) => ReflectFakeRefNode<Node> = createFakeRefNodeImplementation;

export const matchRefs: <HostSchema extends ReflectHostSchema>(
    rules: readonly ReflectRefRule<HostSchema>[]
) => ReflectRefMatcher<HostSchema> = matchRefsImplementation;
