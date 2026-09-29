import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type { IntrospectionConsoleDiagnostics } from '../../diagnostics/introspect-diagnostics.ts';
import type { IntrospectionOptions } from '../../public/introspect-public-types.ts';
import { createIntrospectionReconcilerModule } from '../../reconciler/root/introspect-reconciler.ts';
import type { RuntimeIntrospectionView } from '../types/introspect-runtime-types.ts';
import type { IntrospectionRuntimeDependencies } from '../../reconciler/scheduling/introspect-runtime-dependencies-types.ts';
import { createUnitRuntimeDependencies } from '../../reconciler/scheduling/introspect-runtime-dependencies.test.ts';
import { createIntrospectionViewModule, type IntrospectionViewModule } from './introspect-view.ts';

const isolatedConsoleDiagnostics: IntrospectionConsoleDiagnostics = {
    subscribe() {
        return undefined;
    }
};

export function createUnitIntrospectionViewModule(): IntrospectionViewModule {
    return createIntrospectionViewModule({
        consoleDiagnostics: isolatedConsoleDiagnostics,
        reconciler: createIntrospectionReconcilerModule({
            runtime: createUnitRuntimeDependencies()
        })
    });
}

export function createUnitIntrospectionView(
    element: React.ReactElement,
    options: IntrospectionOptions = {},
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
