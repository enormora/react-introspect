import React from 'react';
import { createUnsupportedReactValueError, isReactPortalValue } from './reflect-unsupported-react.ts';

export type ReflectIdNormalization = {
    readonly generator: ((generatedId: string) => string) | undefined;
    readonly prefix: string;
};

type SnapshotValueNormalizationState = {
    readonly ancestors: WeakSet<WeakKey>;
};

type IdReplacementState = {
    readonly normalization: ReflectIdNormalization;
    readonly pattern: RegExp;
    readonly replacements: IdReplacementMap;
};

type IdReplacementMap = Map<string, string>;

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null || typeof value === 'function';
}

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
    return isRecord(value) && typeof value !== 'function' && isPlainObject(value);
}

function isCircularValue(value: unknown, state: SnapshotValueNormalizationState): boolean {
    return isRecord(value) && state.ancestors.has(value);
}

function normalizeCircularValue(): string {
    return '[Circular]';
}

const snapshotValueNormalizer = {
    normalizeArray(
        value: readonly unknown[],
        normalizeIdString: (value: string) => string,
        state: SnapshotValueNormalizationState
    ): readonly unknown[] {
        state.ancestors.add(value);

        const normalized = Object.freeze(value.map(function normalizeArrayItem(item) {
            return isCircularValue(item, state)
                ? normalizeCircularValue()
                : snapshotValueNormalizer.normalizeValue(item, normalizeIdString, state);
        }));

        state.ancestors.delete(value);

        return normalized;
    },
    normalizePlainObject(
        value: Readonly<Record<PropertyKey, unknown>>,
        normalizeIdString: (value: string) => string,
        state: SnapshotValueNormalizationState
    ): Readonly<Record<PropertyKey, unknown>> {
        const normalized: Record<PropertyKey, unknown> = {};

        state.ancestors.add(value);

        for (const key of Reflect.ownKeys(value)) {
            const child: unknown = value[key];

            normalized[key] = isCircularValue(child, state)
                ? normalizeCircularValue()
                : snapshotValueNormalizer.normalizeValue(child, normalizeIdString, state);
        }

        state.ancestors.delete(value);

        return Object.freeze(normalized);
    },
    normalizeReactElement(
        value: React.ReactElement<Readonly<Record<PropertyKey, unknown>>>,
        normalizeIdString: (value: string) => string,
        state: SnapshotValueNormalizationState
    ): Readonly<Record<PropertyKey, unknown>> {
        const props = snapshotValueNormalizer.normalizePlainObject(value.props, normalizeIdString, state);

        return Object.freeze({
            key: value.key,
            props,
            type: value.type
        });
    },
    normalizeValue(
        value: unknown,
        normalizeIdString: (value: string) => string,
        state: SnapshotValueNormalizationState
    ): unknown {
        if (typeof value === 'string') {
            return normalizeIdString(value);
        }

        if (Array.isArray(value)) {
            return snapshotValueNormalizer.normalizeArray(value, normalizeIdString, state);
        }

        if (isReactPortalValue(value)) {
            throw createUnsupportedReactValueError();
        }

        if (React.isValidElement<Readonly<Record<PropertyKey, unknown>>>(value)) {
            return snapshotValueNormalizer.normalizeReactElement(value, normalizeIdString, state);
        }

        return isNormalizableSnapshotObject(value)
            ? snapshotValueNormalizer.normalizePlainObject(value, normalizeIdString, state)
            : value;
    }
};

export function createIdNormalizer(idNormalization: ReflectIdNormalization): (value: string) => string {
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
    normalizeIdString: (value: string) => string
): Readonly<Record<PropertyKey, unknown>> {
    return snapshotValueNormalizer.normalizePlainObject(
        props,
        normalizeIdString,
        { ancestors: new WeakSet() }
    );
}

export function normalizeSnapshotValue(
    value: unknown,
    normalizeIdString: (value: string) => string,
    state: SnapshotValueNormalizationState = { ancestors: new WeakSet() }
): unknown {
    return snapshotValueNormalizer.normalizeValue(value, normalizeIdString, state);
}
