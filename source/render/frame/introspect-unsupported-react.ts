import React from 'react';
import { isObjectOrFunction } from '../../values/introspect-value-kinds.ts';

const reactPortalType = Symbol.for('react.portal');

export function assertNotPortal(value: unknown): void {
    if (isObjectOrFunction(value) && value.$$typeof === reactPortalType) {
        throw new TypeError('React Introspect cannot represent portal output yet.');
    }
}

export function assertSupportedReactValue(value: unknown): void {
    assertNotPortal(value);

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
