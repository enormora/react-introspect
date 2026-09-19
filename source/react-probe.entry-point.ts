import type React from 'react';
import { createProbeView } from './probe-view.ts';
import type { ProbeOptions, ProbeView } from './probe-public-types.ts';
export { createFakeRefNode, matchRefs } from './probe-ref.ts';

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
} from './probe-public-types.ts';

export function probe<HostSchema extends Record<string, unknown> = Record<string, unknown>>(
    element: React.ReactElement,
    options?: ProbeOptions<HostSchema>
): ProbeView<HostSchema>;
export function probe(element: React.ReactElement, options: ProbeOptions = {}): unknown {
    return createProbeView(element, options);
}
