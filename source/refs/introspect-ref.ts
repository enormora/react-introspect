import type {
    IntrospectionFakeRefNode,
    IntrospectionHostSchema,
    IntrospectionRefMatcher,
    IntrospectionRefRule,
    IntrospectionRefs,
    IntrospectionRefShorthand,
    IntrospectionRefTarget
} from '../public/introspect-public-types.js';
import { matchesTargetCriteria } from '../matching/introspect-target-criteria.ts';
import { isObject } from '../values/introspect-value-kinds.ts';

const matcherType = 'matchRefs';

export type IntrospectionRefHostTarget = IntrospectionRefTarget<Readonly<Record<PropertyKey, unknown>>, string>;

export function createFakeRefNode<Node>(node: Node): IntrospectionFakeRefNode<Node> {
    return node;
}

function isIntrospectionRefMatcher(value: unknown): value is IntrospectionRefMatcher {
    return isObject(value) && value.type === matcherType && Array.isArray(value.rules);
}

export function matchRefs<HostSchema extends IntrospectionHostSchema>(
    rules: readonly IntrospectionRefRule<HostSchema>[]
): IntrospectionRefMatcher<HostSchema> {
    return Object.freeze({
        rules: Object.freeze(rules.slice()),
        type: matcherType
    });
}

function ruleWhereMatches(rule: IntrospectionRefRule, target: IntrospectionRefHostTarget): boolean {
    return rule.where === undefined || Reflect.apply(rule.where, undefined, [ target ]);
}

function ruleMatchesTarget(rule: IntrospectionRefRule, target: IntrospectionRefHostTarget): boolean {
    return matchesTargetCriteria(rule, target) && ruleWhereMatches(rule, target);
}

function matchingRules(
    refs: IntrospectionRefMatcher,
    target: IntrospectionRefHostTarget
): readonly IntrospectionRefRule[] {
    return refs.rules.filter(function isMatchingRule(rule) {
        return ruleMatchesTarget(rule, target);
    });
}

function resolveMatchedRule(rule: IntrospectionRefRule, target: IntrospectionRefHostTarget): IntrospectionFakeRefNode {
    return typeof rule.node === 'function'
        ? Reflect.apply(rule.node, undefined, [ target ])
        : rule.node;
}

function resolveShorthandRef(
    refs: IntrospectionRefShorthand,
    target: IntrospectionRefHostTarget
): IntrospectionFakeRefNode | null {
    const node = refs[target.type];

    if (node === undefined) {
        return null;
    }

    return node;
}

function resolveRuleRef(
    refs: IntrospectionRefMatcher,
    target: IntrospectionRefHostTarget
): IntrospectionFakeRefNode | null {
    const rules = matchingRules(refs, target);

    if (rules.length > 1) {
        throw new TypeError(`Ref target ${target.name} matches multiple ref rules.`);
    }

    const rule = rules[0];

    return rule === undefined ? null : resolveMatchedRule(rule, target);
}

function countShorthandTargets(targets: readonly IntrospectionRefHostTarget[], type: string): number {
    return targets
        .filter(function matchesType(target) {
            return target.type === type;
        })
        .length;
}

function shorthandTypes(refs: IntrospectionRefShorthand): readonly string[] {
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

export function resolveIntrospectionRef(
    refs: IntrospectionRefs | undefined,
    target: IntrospectionRefHostTarget
): IntrospectionFakeRefNode | null {
    if (refs === undefined) {
        return null;
    }

    return isIntrospectionRefMatcher(refs)
        ? resolveRuleRef(refs, target)
        : resolveShorthandRef(refs, target);
}

export function validateIntrospectionRefs(
    refs: IntrospectionRefs | undefined,
    targets: readonly IntrospectionRefHostTarget[]
): void {
    if (refs === undefined || isIntrospectionRefMatcher(refs)) {
        return;
    }

    for (const type of shorthandTypes(refs)) {
        validateShorthandTargetCount(type, countShorthandTargets(targets, type));
    }
}
