import type { IntrospectionHostSchema, IntrospectionSelector } from './introspect-public-types.ts';
import type { RuntimeIntrospectionNode } from './introspect-runtime-types.ts';

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

function isSelectorObject(value: unknown): value is IntrospectionSelector {
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

function typeMatches<HostSchema extends IntrospectionHostSchema>(
    node: RuntimeIntrospectionNode,
    selector: IntrospectionSelector<HostSchema>
): boolean {
    return !hasProperty(selector, 'type') || selector.type === node.type;
}

function keyMatches<HostSchema extends IntrospectionHostSchema>(
    node: RuntimeIntrospectionNode,
    selector: IntrospectionSelector<HostSchema>
): boolean {
    return !hasProperty(selector, 'key') || selector.key === node.key;
}

function propsMatch<HostSchema extends IntrospectionHostSchema>(
    node: RuntimeIntrospectionNode,
    selector: IntrospectionSelector<HostSchema>
): boolean {
    return !hasProperty(selector, 'props') || matchesPartial(node.props, selector.props);
}

function regexpMatches(pattern: RegExp, value: string): boolean {
    const freshPattern = new RegExp(pattern.source, pattern.flags);

    return freshPattern.test(value);
}

function textContentMatches<HostSchema extends IntrospectionHostSchema>(
    node: RuntimeIntrospectionNode,
    selector: IntrospectionSelector<HostSchema>
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

function hasMatches<HostSchema extends IntrospectionHostSchema>(
    node: RuntimeIntrospectionNode,
    selector: IntrospectionSelector<HostSchema>
): boolean {
    return !hasProperty(selector, 'has') || node.find(selector.has) !== undefined;
}

function whereMatches<HostSchema extends IntrospectionHostSchema>(
    node: RuntimeIntrospectionNode,
    selector: IntrospectionSelector<HostSchema>
): boolean {
    const { where } = selector;

    return where === undefined || Reflect.apply(where, undefined, [ node ]) === true;
}

export function toSelector<HostSchema extends IntrospectionHostSchema>(
    selector: unknown
): IntrospectionSelector<HostSchema> {
    if (isSelectorObject(selector)) {
        return selector;
    }

    return { type: selector };
}

export function nodeMatchesSelector<HostSchema extends IntrospectionHostSchema>(
    node: RuntimeIntrospectionNode,
    selector: IntrospectionSelector<HostSchema>
): boolean {
    return typeMatches(node, selector) &&
        keyMatches(node, selector) &&
        propsMatch(node, selector) &&
        textContentMatches(node, selector) &&
        hasMatches(node, selector) &&
        whereMatches(node, selector);
}
