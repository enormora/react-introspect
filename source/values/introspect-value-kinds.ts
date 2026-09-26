type PropertyRecord = Readonly<Record<PropertyKey, unknown>>;

export function isObject(value: unknown): value is PropertyRecord {
    return typeof value === 'object' && value !== null;
}

export function isObjectOrFunction(value: unknown): value is PropertyRecord {
    return isObject(value) || typeof value === 'function';
}

export function isIterable(value: unknown): value is Iterable<unknown> {
    return isObjectOrFunction(value) && typeof value[Symbol.iterator] === 'function';
}

export function isThenable(value: unknown): value is PromiseLike<unknown> {
    return isObjectOrFunction(value) && typeof Reflect.get(value, 'then') === 'function';
}
