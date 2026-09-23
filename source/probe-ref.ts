import type {
    ProbeFakeRefNode,
    ProbeHostSchema,
    ProbeRefMatcher,
    ProbeRefRule,
    ProbeRefs,
    ProbeRefShorthand,
    ProbeRefTarget
} from './probe-public-types.js';

const matcherType = 'matchRefs';

export type ProbeRefHostTarget = ProbeRefTarget<Readonly<Record<PropertyKey, unknown>>, string>;

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null;
}

export function createFakeRefNode<Node>(node: Node): ProbeFakeRefNode<Node> {
    return node;
}

function isProbeRefMatcher(value: unknown): value is ProbeRefMatcher {
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

function hasProperty(value: Readonly<Record<PropertyKey, unknown>>, property: PropertyKey): boolean {
    return Object.hasOwn(value, property);
}

function matchesPartial(value: unknown, partial: unknown): boolean {
    if (Object.is(value, partial)) {
        return true;
    }

    if (Array.isArray(value) && Array.isArray(partial)) {
        return partial.every(function matchesArrayItem(item, index) {
            return matchesPartial(value[index], item);
        });
    }

    if (!isRecord(value) || !isRecord(partial)) {
        return false;
    }

    return Reflect.ownKeys(partial).every(function matchesKey(key) {
        return matchesPartial(value[key], partial[key]);
    });
}

function ruleTypeMatches(rule: ProbeRefRule, target: ProbeRefHostTarget): boolean {
    return !hasProperty(rule, 'type') || rule.type === target.type;
}

function ruleKeyMatches(rule: ProbeRefRule, target: ProbeRefHostTarget): boolean {
    return !hasProperty(rule, 'key') || rule.key === target.key;
}

function rulePropsMatch(rule: ProbeRefRule, target: ProbeRefHostTarget): boolean {
    return !hasProperty(rule, 'props') || matchesPartial(target.props, rule.props);
}

function ruleWhereMatches(rule: ProbeRefRule, target: ProbeRefHostTarget): boolean {
    return rule.where === undefined || Reflect.apply(rule.where, undefined, [ target ]);
}

function ruleMatchesTarget(rule: ProbeRefRule, target: ProbeRefHostTarget): boolean {
    return ruleTypeMatches(rule, target) &&
        ruleKeyMatches(rule, target) &&
        rulePropsMatch(rule, target) &&
        ruleWhereMatches(rule, target);
}

function matchingRules(refs: ProbeRefMatcher, target: ProbeRefHostTarget): readonly ProbeRefRule[] {
    return refs.rules.filter(function isMatchingRule(rule) {
        return ruleMatchesTarget(rule, target);
    });
}

function resolveMatchedRule(rule: ProbeRefRule, target: ProbeRefHostTarget): ProbeFakeRefNode {
    return typeof rule.node === 'function'
        ? Reflect.apply(rule.node, undefined, [ target ])
        : rule.node;
}

function resolveShorthandRef(
    refs: ProbeRefShorthand,
    target: ProbeRefHostTarget
): ProbeFakeRefNode | null {
    const node = refs[target.type];

    if (node === undefined) {
        return null;
    }

    return node;
}

function resolveRuleRef(
    refs: ProbeRefMatcher,
    target: ProbeRefHostTarget
): ProbeFakeRefNode | null {
    const rules = matchingRules(refs, target);

    if (rules.length > 1) {
        throw new TypeError(`Ref target ${target.name} matches multiple ref rules.`);
    }

    const rule = rules[0];

    return rule === undefined ? null : resolveMatchedRule(rule, target);
}

function countShorthandTargets(targets: readonly ProbeRefHostTarget[], type: string): number {
    return targets
        .filter(function matchesType(target) {
            return target.type === type;
        })
        .length;
}

function shorthandTypes(refs: ProbeRefShorthand): readonly string[] {
    return Reflect.ownKeys(refs).filter(function isStringType(type): type is string {
        return typeof type === 'string';
    });
}

function validateShorthandTargetCount(type: string, targetCount: number): void {
    if (targetCount === 0) {
        throw new TypeError(`Ref shorthand ${type} matched no host refs.`);
    }

    if (targetCount > 1) {
        throw new TypeError(`Ref shorthand ${type} matched multiple host refs.`);
    }
}

export function resolveProbeRef(
    refs: ProbeRefs | undefined,
    target: ProbeRefHostTarget
): ProbeFakeRefNode | null {
    if (refs === undefined) {
        return null;
    }

    return isProbeRefMatcher(refs)
        ? resolveRuleRef(refs, target)
        : resolveShorthandRef(refs, target);
}

export function validateProbeRefs(
    refs: ProbeRefs | undefined,
    targets: readonly ProbeRefHostTarget[]
): void {
    if (refs === undefined || isProbeRefMatcher(refs)) {
        return;
    }

    for (const type of shorthandTypes(refs)) {
        validateShorthandTargetCount(type, countShorthandTargets(targets, type));
    }
}
