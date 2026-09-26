import { isObject } from '../values/introspect-value-kinds.ts';

type TargetCriteria = {
    readonly key?: unknown;
    readonly props?: unknown;
    readonly type?: unknown;
};

type CriteriaTarget = {
    readonly key: string | null;
    readonly props: unknown;
    readonly type: unknown;
};

function matchesPartial(value: unknown, partial: unknown): boolean {
    if (Object.is(value, partial)) {
        return true;
    }

    if (Array.isArray(value) && Array.isArray(partial)) {
        return partial.every(function matchesArrayItem(item, index) {
            return matchesPartial(value[index], item);
        });
    }

    if (!isObject(value) || !isObject(partial)) {
        return false;
    }

    return Reflect.ownKeys(partial).every(function matchesKey(key) {
        return matchesPartial(value[key], partial[key]);
    });
}

function isUnconstrained(criteria: TargetCriteria, field: keyof TargetCriteria): boolean {
    return !Object.hasOwn(criteria, field);
}

export function matchesTargetCriteria(criteria: TargetCriteria, target: CriteriaTarget): boolean {
    return (isUnconstrained(criteria, 'type') || criteria.type === target.type) &&
        (isUnconstrained(criteria, 'key') || criteria.key === target.key) &&
        (isUnconstrained(criteria, 'props') || matchesPartial(target.props, criteria.props));
}
