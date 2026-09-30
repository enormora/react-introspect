type Props = Readonly<Record<PropertyKey, unknown>>;

const reactReservedPropKeys = new Set<PropertyKey>([ 'children', 'key', 'ref' ]);

export function readPublicProps(props: Props, internalKeys: ReadonlySet<PropertyKey>): Props {
    const publicKeys = Reflect.ownKeys(props).filter(function isPublicKey(key) {
        return !reactReservedPropKeys.has(key) && !internalKeys.has(key);
    });

    return Object.freeze(Object.fromEntries(publicKeys.map(function readPublicEntry(key) {
        return [ key, props[key] ];
    })));
}
