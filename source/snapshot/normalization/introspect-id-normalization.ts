import React from 'react';
import {
    createUnsupportedReactValueError,
    isReactPortalValue
} from '../../render/frame/introspect-unsupported-react.ts';
import { isObjectOrFunction } from '../../values/introspect-value-kinds.ts';

export type IntrospectionIdNormalization = {
    readonly generator: ((generatedId: string) => string) | undefined;
    readonly prefix: string;
};

type SnapshotElementDescriber = (
    element: React.ReactElement<Readonly<Record<PropertyKey, unknown>>>,
    location: string,
    normalizeElementProps: () => Readonly<Record<PropertyKey, unknown>>
) => unknown;

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

function isPlainObject(value: Readonly<Record<PropertyKey, unknown>>): boolean {
    const prototype: unknown = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
}

function escapeRegularExpression(value: string): string {
    return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function createReactIdPattern(prefix: string): RegExp {
    return new RegExp(`_${escapeRegularExpression(prefix)}[rR]_[0-9a-z]+(?:_[0-9a-z]+)*_`, 'gu');
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

function isNormalizableSnapshotObject(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return isObjectOrFunction(value) && typeof value !== 'function' && isPlainObject(value);
}

function isCircularValue(value: unknown, state: SnapshotPropsNormalization): boolean {
    return isObjectOrFunction(value) && state.ancestors.has(value);
}

function normalizeCircularValue(): string {
    return '[Circular]';
}

function childLocation(location: string, key: PropertyKey): string {
    return location === '' ? String(key) : `${location}.${String(key)}`;
}

const snapshotValueNormalizer = {
    normalizeArray(
        value: readonly unknown[],
        state: SnapshotPropsNormalization,
        location: string
    ): readonly unknown[] {
        state.ancestors.add(value);

        const normalized = Object.freeze(value.map(function normalizeArrayItem(item, index) {
            return isCircularValue(item, state)
                ? normalizeCircularValue()
                : snapshotValueNormalizer.normalizeValue(item, state, childLocation(location, index));
        }));

        state.ancestors.delete(value);

        return normalized;
    },
    normalizePlainObject(
        value: Readonly<Record<PropertyKey, unknown>>,
        state: SnapshotPropsNormalization,
        location: string
    ): Readonly<Record<PropertyKey, unknown>> {
        const normalized: Record<PropertyKey, unknown> = {};

        state.ancestors.add(value);

        for (const key of Reflect.ownKeys(value)) {
            const child: unknown = value[key];

            normalized[key] = isCircularValue(child, state)
                ? normalizeCircularValue()
                : snapshotValueNormalizer.normalizeValue(child, state, childLocation(location, key));
        }

        state.ancestors.delete(value);

        return Object.freeze(normalized);
    },
    normalizeValue(
        value: unknown,
        state: SnapshotPropsNormalization,
        location: string
    ): unknown {
        if (typeof value === 'string') {
            return state.normalizeIdString(value);
        }

        if (Array.isArray(value)) {
            return snapshotValueNormalizer.normalizeArray(value, state, location);
        }

        if (isReactPortalValue(value)) {
            throw createUnsupportedReactValueError();
        }

        if (React.isValidElement<Readonly<Record<PropertyKey, unknown>>>(value)) {
            return state.describeElement(value, location, function normalizeElementProps() {
                return snapshotValueNormalizer.normalizePlainObject(value.props, state, location);
            });
        }

        return isNormalizableSnapshotObject(value)
            ? snapshotValueNormalizer.normalizePlainObject(value, state, location)
            : value;
    }
};

function describeElementAsPlainData(
    element: React.ReactElement<Readonly<Record<PropertyKey, unknown>>>,
    _location: string,
    normalizeElementProps: () => Readonly<Record<PropertyKey, unknown>>
): Readonly<Record<PropertyKey, unknown>> {
    return Object.freeze({
        key: element.key,
        props: normalizeElementProps(),
        type: element.type
    });
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
    return snapshotValueNormalizer.normalizePlainObject(props, normalization, '');
}

export function normalizeSnapshotValue(value: unknown, normalizeIdString: (value: string) => string): unknown {
    return snapshotValueNormalizer.normalizeValue(
        value,
        {
            ancestors: new WeakSet(),
            describeElement: describeElementAsPlainData,
            normalizeIdString
        },
        ''
    );
}
