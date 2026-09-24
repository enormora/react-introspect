import { suite, test } from '@overkill-dev/test';

function packageFoundationStatus(): string {
    return 'ready';
}

export const testNode = suite('repository foundation', [
    test('runs unit tests through Overkill', function verifyTestRunner(scope) {
        scope.assert.equal(packageFoundationStatus(), 'ready');

        return scope.assert.collect();
    })
]);
