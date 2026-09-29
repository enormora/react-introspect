type Props = Readonly<Record<PropertyKey, unknown>>;

const reactReservedPropKeys = new Set<PropertyKey>([ 'children', 'key', 'ref' ]);

export function isReactReservedPropKey(key: PropertyKey): boolean {
    return reactReservedPropKeys.has(key);
}

export function readPublicProps(props: Props, internalKeys: ReadonlySet<PropertyKey>): Props {
    const publicProps: Record<PropertyKey, unknown> = {};

    for (const key of Reflect.ownKeys(props)) {
        if (!isReactReservedPropKey(key) && !internalKeys.has(key)) {
            publicProps[key] = props[key];
        }
    }

    return Object.freeze(publicProps);
}
