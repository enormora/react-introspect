import React from 'react';
import { isObjectOrFunction } from '../../values/introspect-value-kinds.ts';

const reactPortalType = Symbol.for('react.portal');

export function isReactPortalValue(value: unknown): boolean {
    return isObjectOrFunction(value) && value.$$typeof === reactPortalType;
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

    if (React.isValidElement(value) && isObjectOrFunction(value.props)) {
        assertSupportedReactValue(value.props.children);
    }
}
