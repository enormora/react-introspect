import diagnosticsChannel from 'node:diagnostics_channel';
import type React from 'react';
import type {
    IntrospectionFakeRefNode,
    IntrospectionHostSchema,
    IntrospectionOptions,
    IntrospectionRefMatcher,
    IntrospectionRefRule,
    IntrospectionView
} from './public/introspect-public-types.js';
import {
    createFakeRefNode as createFakeRefNodeImplementation,
    matchRefs as matchRefsImplementation
} from './refs/introspect-ref.ts';
import { createNodeConsoleDiagnostics } from './diagnostics/introspect-node-console-diagnostics.ts';
import { createIntrospectionView } from './runtime/view/introspect-view.ts';

const nodeConsoleDiagnostics = createNodeConsoleDiagnostics(diagnosticsChannel);

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
} from './public/introspect-public-types.js';

export function introspect<HostSchema extends Record<string, unknown> = Record<string, unknown>>(
    element: React.ReactElement,
    options?: IntrospectionOptions<HostSchema>
): IntrospectionView<HostSchema>;
export function introspect(element: React.ReactElement, options: IntrospectionOptions = {}): unknown {
    return createIntrospectionView(element, options, nodeConsoleDiagnostics);
}

export const createFakeRefNode: <Node>(node: Node) => IntrospectionFakeRefNode<Node> = createFakeRefNodeImplementation;

export const matchRefs: <HostSchema extends IntrospectionHostSchema>(
    rules: readonly IntrospectionRefRule<HostSchema>[]
) => IntrospectionRefMatcher<HostSchema> = matchRefsImplementation;
