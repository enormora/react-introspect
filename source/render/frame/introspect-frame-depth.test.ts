import { suite, test } from '@overkill-dev/test';
import { createFrameDepth, nextDepth } from './introspect-frame-depth.ts';

export const testNode = suite('introspection frame depth', [
    test('decrements numeric depth and preserves full depth', function (scope) {
        function readNextBudget(budget: number | 'full'): number | 'full' {
            return nextDepth(createFrameDepth({ budget, depthFrom: undefined, transparent: [] }), 'span').budget;
        }

        scope.assert.equal(readNextBudget('full'), 'full');
        scope.assert.equal(readNextBudget(2), 1);
        scope.assert.equal(readNextBudget(0), 0);

        return scope.assert.collect();
    })
]);
