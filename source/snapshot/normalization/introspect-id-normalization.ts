import React from 'react';
import { assertNotPortal } from '../../values/introspect-unsupported-react.ts';
import { type NestedReplacement, replaceNestedTargets } from '../../values/introspect-nested-replacement.ts';

export type IntrospectionIdNormalization = {
    readonly generator: ((generatedId: string) => string) | undefined;
    readonly prefix: string;
};

type SnapshotElement = React.ReactElement<Readonly<Record<PropertyKey, unknown>>>;

export type SnapshotElementDescriber = (element: SnapshotElement, location: string) => unknown;

export type SnapshotPropsNormalization = {
    readonly ancestors: WeakSet<WeakKey>;
    readonly describeElement: SnapshotElementDescriber;
    readonly normalizeIdString: (value: string) => string;
};

type IdReplacementState = {
    readonly normalization: IntrospectionIdNormalization;
    readonly pattern: RegExp;
    readonly replacements: IdReplacementMap;
};

type IdReplacementMap = Map<string, string>;

function createReactIdPattern(prefix: string): RegExp {
    return new RegExp(`_${RegExp.escape(prefix)}[rR]_[0-9a-z]+(?:_[0-9a-z]+)*_`, 'gu');
}

function replaceGeneratedId(state: IdReplacementState, generatedId: string): string {
    const existingReplacement = state.replacements.get(generatedId);

    if (existingReplacement !== undefined) {
        return existingReplacement;
    }

    const replacement = state.normalization.generator?.(generatedId) ?? generatedId;

    state.replacements.set(generatedId, replacement);

    return replacement;
}

function isSupportedReactElement(value: unknown): value is SnapshotElement {
    assertNotPortal(value);

    return React.isValidElement<Readonly<Record<PropertyKey, unknown>>>(value);
}

function toElementReplacement(normalization: SnapshotPropsNormalization): NestedReplacement<SnapshotElement> {
    return {
        ancestors: normalization.ancestors,
        isTarget: isSupportedReactElement,
        replaceTarget: normalization.describeElement
    };
}

function normalizeSnapshotProp(value: unknown, normalization: SnapshotPropsNormalization, location: string): unknown {
    return typeof value === 'string'
        ? normalization.normalizeIdString(value)
        : replaceNestedTargets(value, toElementReplacement(normalization), location);
}

export function createIdNormalizer(idNormalization: IntrospectionIdNormalization): (value: string) => string {
    const state: IdReplacementState = {
        normalization: idNormalization,
        pattern: createReactIdPattern(idNormalization.prefix),
        replacements: new Map<string, string>()
    };

    return function normalizeIdString(value) {
        return idNormalization.generator === undefined
            ? value
            : value.replaceAll(state.pattern, function replaceId(generatedId) {
                return replaceGeneratedId(state, generatedId);
            });
    };
}

export function normalizeSnapshotProps(
    props: Readonly<Record<PropertyKey, unknown>>,
    normalization: SnapshotPropsNormalization
): Readonly<Record<PropertyKey, unknown>> {
    const normalized: Record<PropertyKey, unknown> = {};

    for (const key of Reflect.ownKeys(props)) {
        normalized[key] = normalizeSnapshotProp(props[key], normalization, String(key));
    }

    return Object.freeze(normalized);
}

export function normalizeSnapshotValue(value: unknown, normalizeIdString: (value: string) => string): unknown {
    const normalization: SnapshotPropsNormalization = {
        ancestors: new WeakSet(),
        describeElement(element, location) {
            return Object.freeze({
                key: element.key,
                props: replaceNestedTargets(element.props, toElementReplacement(normalization), location),
                type: element.type
            });
        },
        normalizeIdString
    };

    return normalizeSnapshotProp(value, normalization, '');
}
