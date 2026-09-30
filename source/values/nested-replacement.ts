import { isObject } from './value-kinds.ts';

type PlainContainer = Readonly<Record<PropertyKey, unknown>> | readonly unknown[];

export type NestedReplacement<Target> = {
    readonly ancestors: WeakSet<WeakKey>;
    readonly isTarget: (value: unknown) => value is Target;
    readonly replaceTarget: (target: Target, location: string) => unknown;
};

const circularValueMarker = '[Circular]';

function isReadonlyArray(value: unknown): value is readonly unknown[] {
    return Array.isArray(value);
}

function isPlainContainer(value: unknown): value is PlainContainer {
    if (isReadonlyArray(value)) {
        return true;
    }

    if (!isObject(value)) {
        return false;
    }

    const prototype: unknown = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
}

function readContainerValues(container: PlainContainer): readonly unknown[] {
    if (isReadonlyArray(container)) {
        return container;
    }

    return Reflect.ownKeys(container).map(function readContainerValue(key) {
        return container[key];
    });
}

function childLocation(location: string, key: PropertyKey): string {
    return location === '' ? String(key) : `${location}.${String(key)}`;
}

function holdsTarget<Target>(
    value: unknown,
    replacement: NestedReplacement<Target>,
    visited: WeakSet<WeakKey>
): boolean {
    if (replacement.isTarget(value)) {
        return true;
    }

    if (!isPlainContainer(value) || visited.has(value)) {
        return false;
    }

    visited.add(value);

    return readContainerValues(value).some(function holdsNestedTarget(item) {
        return holdsTarget(item, replacement, visited);
    });
}

const nestedTargetReplacer = {
    rebuildArray<Target>(
        items: readonly unknown[],
        replacement: NestedReplacement<Target>,
        location: string
    ): readonly unknown[] {
        return Object.freeze(items.map(function rebuildItem(item, index) {
            return nestedTargetReplacer.replace(item, replacement, childLocation(location, index));
        }));
    },
    rebuildContainer<Target>(
        container: PlainContainer,
        replacement: NestedReplacement<Target>,
        location: string
    ): PlainContainer {
        replacement.ancestors.add(container);

        const rebuilt = isReadonlyArray(container)
            ? nestedTargetReplacer.rebuildArray(container, replacement, location)
            : nestedTargetReplacer.rebuildRecord(container, replacement, location);

        replacement.ancestors.delete(container);

        return rebuilt;
    },
    rebuildRecord<Target>(
        record: Readonly<Record<PropertyKey, unknown>>,
        replacement: NestedReplacement<Target>,
        location: string
    ): Readonly<Record<PropertyKey, unknown>> {
        return Object.freeze(Object.fromEntries(
            Reflect.ownKeys(record).map(function rebuildEntry(key) {
                return [ key, nestedTargetReplacer.replace(record[key], replacement, childLocation(location, key)) ];
            })
        ));
    },
    replace<Target>(value: unknown, replacement: NestedReplacement<Target>, location: string): unknown {
        if (replacement.isTarget(value)) {
            return replacement.replaceTarget(value, location);
        }

        if (!isPlainContainer(value)) {
            return value;
        }

        if (replacement.ancestors.has(value)) {
            return circularValueMarker;
        }

        return holdsTarget(value, replacement, new WeakSet())
            ? nestedTargetReplacer.rebuildContainer(value, replacement, location)
            : value;
    }
};

export function replaceNestedTargets<Target>(
    value: unknown,
    replacement: NestedReplacement<Target>,
    location: string
): unknown {
    return nestedTargetReplacer.replace(value, replacement, location);
}
