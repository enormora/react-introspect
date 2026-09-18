import { defineConfig } from '@overkill-dev/test/config';

export const config = defineConfig({
    profiles: {
        microtest: {
            execution: {
                processModel: 'in-process',
                scheduling: 'serial'
            },
            testFamily: 'microtest',
            files: {
                include: [ 'target/build/source/*.test.js' ]
            },
            timeouts: {
                collectionMilliseconds: 30_000
            }
        }
    }
});
