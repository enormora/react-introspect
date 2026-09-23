import React from 'react';

const reactPortalType = Symbol.for('react.portal');

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null || typeof value === 'function';
}

export function isReactPortalValue(value: unknown): boolean {
    return isRecord(value) && value.$$typeof === reactPortalType;
}

export function createUnsupportedReactValueError(): Error {
    return new TypeError('React Introspect cannot represent portal output yet.');
}

export function assertSupportedReactValue(value: unknown): void {
    if (isReactPortalValue(value)) {
        throw createUnsupportedReactValueError();
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            assertSupportedReactValue(item);
        }

        return;
    }

    if (React.isValidElement(value) && isRecord(value.props)) {
        assertSupportedReactValue(value.props.children);
    }
}
