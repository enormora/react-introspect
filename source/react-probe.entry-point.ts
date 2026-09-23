import type React from 'react';
import type {
    ProbeFakeRefNode,
    ProbeHostSchema,
    ProbeOptions,
    ProbeRefMatcher,
    ProbeRefRule,
    ProbeView
} from './probe-public-types.js';
import {
    createFakeRefNode as createFakeRefNodeImplementation,
    matchRefs as matchRefsImplementation
} from './probe-ref.ts';
import { createProbeView } from './probe-view.ts';

export type {
    GivenChildren,
    ProbeError,
    ProbeFakeRefNode,
    ProbeList,
    ProbeListLocator,
    ProbeLocator,
    ProbeNode,
    ProbeNodeState,
    ProbeOptions,
    ProbeRefMatcher,
    ProbeRefRule,
    ProbeRefs,
    ProbeRefSelector,
    ProbeRefShorthand,
    ProbeRefTarget,
    ProbeSelector,
    ProbeView,
    ProbeWarning,
    RenderedChildren
} from './probe-public-types.js';

export function probe<HostSchema extends Record<string, unknown> = Record<string, unknown>>(
    element: React.ReactElement,
    options?: ProbeOptions<HostSchema>
): ProbeView<HostSchema>;
export function probe(element: React.ReactElement, options: ProbeOptions = {}): unknown {
    return createProbeView(element, options);
}

export const createFakeRefNode: <Node>(node: Node) => ProbeFakeRefNode<Node> = createFakeRefNodeImplementation;

export const matchRefs: <HostSchema extends ProbeHostSchema>(
    rules: readonly ProbeRefRule<HostSchema>[]
) => ProbeRefMatcher<HostSchema> = matchRefsImplementation;
