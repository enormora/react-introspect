import type { ReflectHostSchema, ReflectSelector } from './reflect-public-types.ts';
import type { RuntimeReflectNode } from './reflect-runtime-types.ts';

const selectorFields = Object.freeze([
    'has',
    'key',
    'props',
    'textContent',
    'type',
    'where'
]);

function hasProperty(value: Readonly<Record<PropertyKey, unknown>>, property: PropertyKey): boolean {
    return Reflect.has(value, property);
}

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null;
}

function isSelectorObject(value: unknown): value is ReflectSelector {
    return isRecord(value) && !hasProperty(value, '$$typeof') && selectorFields.some(function hasSelectorField(field) {
        return hasProperty(value, field);
    });
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

function typeMatches<HostSchema extends ReflectHostSchema>(
    node: RuntimeReflectNode,
    selector: ReflectSelector<HostSchema>
): boolean {
    return !hasProperty(selector, 'type') || selector.type === node.type;
}

function keyMatches<HostSchema extends ReflectHostSchema>(
    node: RuntimeReflectNode,
    selector: ReflectSelector<HostSchema>
): boolean {
    return !hasProperty(selector, 'key') || selector.key === node.key;
}

function propsMatch<HostSchema extends ReflectHostSchema>(
    node: RuntimeReflectNode,
    selector: ReflectSelector<HostSchema>
): boolean {
    return !hasProperty(selector, 'props') || matchesPartial(node.props, selector.props);
}

function regexpMatches(pattern: RegExp, value: string): boolean {
    const freshPattern = new RegExp(pattern.source, pattern.flags);

    return freshPattern.test(value);
}

function textContentMatches<HostSchema extends ReflectHostSchema>(
    node: RuntimeReflectNode,
    selector: ReflectSelector<HostSchema>
): boolean {
    if (!hasProperty(selector, 'textContent')) {
        return true;
    }

    const { textContent } = selector;

    if (textContent === undefined) {
        return true;
    }

    return typeof textContent === 'string'
        ? textContent === node.textContent
        : regexpMatches(textContent, node.textContent);
}

function hasMatches<HostSchema extends ReflectHostSchema>(
    node: RuntimeReflectNode,
    selector: ReflectSelector<HostSchema>
): boolean {
    return !hasProperty(selector, 'has') || node.find(selector.has) !== undefined;
}

function whereMatches<HostSchema extends ReflectHostSchema>(
    node: RuntimeReflectNode,
    selector: ReflectSelector<HostSchema>
): boolean {
    const { where } = selector;

    return where === undefined || Reflect.apply(where, undefined, [ node ]) === true;
}

export function toSelector<HostSchema extends ReflectHostSchema>(
    selector: unknown
): ReflectSelector<HostSchema> {
    if (isSelectorObject(selector)) {
        return selector;
    }

    return { type: selector };
}

export function nodeMatchesSelector<HostSchema extends ReflectHostSchema>(
    node: RuntimeReflectNode,
    selector: ReflectSelector<HostSchema>
): boolean {
    return typeMatches(node, selector) &&
        keyMatches(node, selector) &&
        propsMatch(node, selector) &&
        textContentMatches(node, selector) &&
        hasMatches(node, selector) &&
        whereMatches(node, selector);
}
