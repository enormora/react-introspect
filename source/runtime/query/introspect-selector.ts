import type { IntrospectionHostSchema, IntrospectionSelector } from '../../public/introspect-public-types.ts';
import type { RuntimeIntrospectionNode } from '../types/introspect-runtime-types.ts';
import { matchesTargetCriteria } from '../../matching/introspect-target-criteria.ts';
import { isObject } from '../../values/introspect-value-kinds.ts';

const selectorFields = Object.freeze([
    'has',
    'key',
    'props',
    'textContent',
    'type',
    'where'
]);

function hasProperty(value: Readonly<Record<PropertyKey, unknown>>, property: PropertyKey): boolean {
    return Object.hasOwn(value, property);
}

function isSelectorObject(value: unknown): value is IntrospectionSelector {
    return isObject(value) && !hasProperty(value, '$$typeof') && selectorFields.some(function hasSelectorField(field) {
        return hasProperty(value, field);
    });
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
    return matchesTargetCriteria(selector, node) &&
        textContentMatches(node, selector) &&
        hasMatches(node, selector) &&
        whereMatches(node, selector);
}
