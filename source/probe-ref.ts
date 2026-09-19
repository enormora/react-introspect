import type {
    ProbeFakeRefNode,
    ProbeHostSchema,
    ProbeRefMatcher,
    ProbeRefRule
} from './probe-public-types.ts';

const matcherType = 'matchRefs';

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null;
}

export function createFakeRefNode<Node extends object>(node: Node): ProbeFakeRefNode<Node> {
    return node;
}

export function isProbeRefMatcher(value: unknown): value is ProbeRefMatcher {
    return isRecord(value) && value.type === matcherType && Array.isArray(value.rules);
}

export function matchRefs<HostSchema extends ProbeHostSchema>(
    rules: readonly ProbeRefRule<HostSchema>[]
): ProbeRefMatcher<HostSchema> {
    return Object.freeze({
        rules: Object.freeze(rules.slice()),
        type: matcherType
    });
}
