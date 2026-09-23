import type {
    ReflectFakeRefNode,
    ReflectHostSchema,
    ReflectRefMatcher,
    ReflectRefRule,
    ReflectRefs,
    ReflectRefShorthand,
    ReflectRefTarget
} from './reflect-public-types.js';

const matcherType = 'matchRefs';

export type ReflectRefHostTarget = ReflectRefTarget<Readonly<Record<PropertyKey, unknown>>, string>;

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null;
}

export function createFakeRefNode<Node>(node: Node): ReflectFakeRefNode<Node> {
    return node;
}

function isReflectRefMatcher(value: unknown): value is ReflectRefMatcher {
    return isRecord(value) && value.type === matcherType && Array.isArray(value.rules);
}

export function matchRefs<HostSchema extends ReflectHostSchema>(
    rules: readonly ReflectRefRule<HostSchema>[]
): ReflectRefMatcher<HostSchema> {
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

function ruleTypeMatches(rule: ReflectRefRule, target: ReflectRefHostTarget): boolean {
    return !hasProperty(rule, 'type') || rule.type === target.type;
}

function ruleKeyMatches(rule: ReflectRefRule, target: ReflectRefHostTarget): boolean {
    return !hasProperty(rule, 'key') || rule.key === target.key;
}

function rulePropsMatch(rule: ReflectRefRule, target: ReflectRefHostTarget): boolean {
    return !hasProperty(rule, 'props') || matchesPartial(target.props, rule.props);
}

function ruleWhereMatches(rule: ReflectRefRule, target: ReflectRefHostTarget): boolean {
    return rule.where === undefined || Reflect.apply(rule.where, undefined, [ target ]);
}

function ruleMatchesTarget(rule: ReflectRefRule, target: ReflectRefHostTarget): boolean {
    return ruleTypeMatches(rule, target) &&
        ruleKeyMatches(rule, target) &&
        rulePropsMatch(rule, target) &&
        ruleWhereMatches(rule, target);
}

function matchingRules(refs: ReflectRefMatcher, target: ReflectRefHostTarget): readonly ReflectRefRule[] {
    return refs.rules.filter(function isMatchingRule(rule) {
        return ruleMatchesTarget(rule, target);
    });
}

function resolveMatchedRule(rule: ReflectRefRule, target: ReflectRefHostTarget): ReflectFakeRefNode {
    return typeof rule.node === 'function'
        ? Reflect.apply(rule.node, undefined, [ target ])
        : rule.node;
}

function resolveShorthandRef(
    refs: ReflectRefShorthand,
    target: ReflectRefHostTarget
): ReflectFakeRefNode | null {
    const node = refs[target.type];

    if (node === undefined) {
        return null;
    }

    return node;
}

function resolveRuleRef(
    refs: ReflectRefMatcher,
    target: ReflectRefHostTarget
): ReflectFakeRefNode | null {
    const rules = matchingRules(refs, target);

    if (rules.length > 1) {
        throw new TypeError(`Ref target ${target.name} matches multiple ref rules.`);
    }

    const rule = rules[0];

    return rule === undefined ? null : resolveMatchedRule(rule, target);
}

function countShorthandTargets(targets: readonly ReflectRefHostTarget[], type: string): number {
    return targets
        .filter(function matchesType(target) {
            return target.type === type;
        })
        .length;
}

function shorthandTypes(refs: ReflectRefShorthand): readonly string[] {
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

export function resolveReflectRef(
    refs: ReflectRefs | undefined,
    target: ReflectRefHostTarget
): ReflectFakeRefNode | null {
    if (refs === undefined) {
        return null;
    }

    return isReflectRefMatcher(refs)
        ? resolveRuleRef(refs, target)
        : resolveShorthandRef(refs, target);
}

export function validateReflectRefs(
    refs: ReflectRefs | undefined,
    targets: readonly ReflectRefHostTarget[]
): void {
    if (refs === undefined || isReflectRefMatcher(refs)) {
        return;
    }

    for (const type of shorthandTypes(refs)) {
        validateShorthandTargetCount(type, countShorthandTargets(targets, type));
    }
}
