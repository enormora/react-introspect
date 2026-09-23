import { defineConfig } from '@overkill-dev/test/config';

export const config = defineConfig({
    profiles: {
        coverage: {
            execution: {
                processModel: 'in-process',
                scheduling: 'serial'
            },
            testFamily: 'microtest',
            files: {
                include: [ 'source/**/*.test.ts' ]
            },
            timeouts: {
                collectionMilliseconds: 30_000
            }
        },
        microtest: {
            execution: {
                processModel: 'in-process',
                scheduling: 'serial'
            },
            testFamily: 'microtest',
            files: {
                include: [ 'source/**/*.test.ts' ]
            },
            timeouts: {
                collectionMilliseconds: 30_000
            }
        }
    }
});
