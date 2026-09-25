import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type { IntrospectionConsoleDiagnostics } from '../../diagnostics/introspect-diagnostics.ts';
import { createIntrospectionReconcilerModule } from '../../reconciler/root/introspect-reconciler.ts';
import type {
    RuntimeIntrospectionOptions,
    RuntimeIntrospectionView
} from '../types/introspect-runtime-types.ts';
import type { IntrospectionRuntimeDependencies } from './introspect-runtime-dependencies-types.ts';
import { createUnitRuntimeDependencies } from './introspect-runtime-dependencies.test.ts';
import { createIntrospectionViewModule } from './introspect-view.ts';

const isolatedConsoleDiagnostics: IntrospectionConsoleDiagnostics = Object.freeze({
    subscribe() {
        return undefined;
    }
});

export function createUnitIntrospectionView(
    element: React.ReactElement,
    options: RuntimeIntrospectionOptions = {},
    consoleDiagnostics: IntrospectionConsoleDiagnostics = isolatedConsoleDiagnostics,
    runtimeDependencies: IntrospectionRuntimeDependencies = createUnitRuntimeDependencies()
): RuntimeIntrospectionView {
    const viewModule = createIntrospectionViewModule({
        consoleDiagnostics,
        reconciler: createIntrospectionReconcilerModule({
            runtime: runtimeDependencies
        })
    });

    return viewModule.createView(element, options);
}

export const testNode = suite('unit introspection view', [
    test('creates views through the unit module graph', function (scope) {
        const view = createUnitIntrospectionView(React.createElement('main', null, 'unit'));

        scope.assert.equal(view.textContent, 'unit');

        return scope.assert.collect();
    })
]);
