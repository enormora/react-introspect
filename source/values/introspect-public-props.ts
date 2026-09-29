const reactReservedPropKeys = new Set<PropertyKey>([ 'children', 'key', 'ref' ]);

export function isReactReservedPropKey(key: PropertyKey): boolean {
    return reactReservedPropKeys.has(key);
}
