const usageErrors = new WeakSet<TypeError>();

export function createIntrospectionUsageError(message: string): TypeError {
    const error = new TypeError(message);

    usageErrors.add(error);

    return error;
}

export function isIntrospectionUsageError(error: unknown): error is TypeError {
    return error instanceof TypeError && usageErrors.has(error);
}
