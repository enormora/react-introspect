import { defineConfig } from '@overkill-dev/test/config';

export const config = defineConfig({
    profiles: {
        microtest: {
            testFamily: 'microtest',
            files: {
                include: [ './source/test-runner-smoke.test.ts' ]
            },
            timeouts: {
                collectionMilliseconds: 5000
            }
        }
    }
});
