import { suite, test } from '@overkill-dev/test';
import { createFrameDepth, enterComponentDepth, isSameFrameDepth, nextDepth } from './introspect-frame-depth.ts';

function Start(): null {
    return null;
}

export const testNode = suite('introspection frame depth', [
    test('treats depths as the same only when budget, counting and policy all match', function (scope) {
        const counting = createFrameDepth({ budget: 2, depthFrom: undefined, transparent: [] });
        const waiting = createFrameDepth({ budget: 2, depthFrom: Start, transparent: [] });

        scope.assert.deepEqual({
            copy: isSameFrameDepth(counting, { ...counting }),
            otherBudget: isSameFrameDepth(counting, nextDepth(counting, 'span')),
            otherCounting: isSameFrameDepth(waiting, enterComponentDepth(waiting, Start)),
            otherPolicy: isSameFrameDepth(
                counting,
                createFrameDepth({ budget: 2, depthFrom: undefined, transparent: [ Start ] })
            )
        }, {
            copy: true,
            otherBudget: false,
            otherCounting: false,
            otherPolicy: false
        });

        return scope.assert.collect();
    }),
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
