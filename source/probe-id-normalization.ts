export type ProbeIdNormalization = {
    readonly generator: ((generatedId: string) => string) | undefined;
    readonly prefix: string;
};

type IdReplacementState = {
    readonly normalization: ProbeIdNormalization;
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

const snapshotValueNormalizer = {
    normalizeArray(
        value: readonly unknown[],
        normalizeIdString: (value: string) => string,
        seen: WeakMap<WeakKey, unknown>
    ): readonly unknown[] {
        return Object.freeze(value.map(function normalizeArrayItem(item) {
            return snapshotValueNormalizer.normalizeValue(item, normalizeIdString, seen);
        }));
    },
    normalizePlainObject(
        value: Readonly<Record<PropertyKey, unknown>>,
        normalizeIdString: (value: string) => string,
        seen: WeakMap<WeakKey, unknown>
    ): Readonly<Record<PropertyKey, unknown>> {
        const normalized: Record<PropertyKey, unknown> = {};

        seen.set(value, normalized);

        for (const key of Reflect.ownKeys(value)) {
            const child: unknown = value[key];

            normalized[key] = isRecord(child) && seen.has(child)
                ? seen.get(child)
                : snapshotValueNormalizer.normalizeValue(child, normalizeIdString, seen);
        }

        return Object.freeze(normalized);
    },
    normalizeValue(
        value: unknown,
        normalizeIdString: (value: string) => string,
        seen: WeakMap<WeakKey, unknown>
    ): unknown {
        if (typeof value === 'string') {
            return normalizeIdString(value);
        }

        if (Array.isArray(value)) {
            return snapshotValueNormalizer.normalizeArray(value, normalizeIdString, seen);
        }

        return isNormalizableSnapshotObject(value)
            ? snapshotValueNormalizer.normalizePlainObject(value, normalizeIdString, seen)
            : value;
    }
};

export function createIdNormalizer(idNormalization: ProbeIdNormalization): (value: string) => string {
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
        new WeakMap<WeakKey, unknown>()
    );
}

export function normalizeSnapshotValue(
    value: unknown,
    normalizeIdString: (value: string) => string,
    seen: WeakMap<WeakKey, unknown> = new WeakMap<WeakKey, unknown>()
): unknown {
    return snapshotValueNormalizer.normalizeValue(value, normalizeIdString, seen);
}
