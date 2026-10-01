import { defineConfig } from '@overkill-dev/test/config';

const microtestFiles = {
    exclude: [ 'source/integration-tests/**' ],
    include: [ 'source/**/*.test.ts' ]
} as const;

const microtestTimeouts = {
    collectionMilliseconds: 30_000
} as const;

export const config = defineConfig({
    runtimeStateDir: 'target/.overkill',
    profiles: {
        coverage: {
            execution: {
                processModel: 'in-process',
                scheduling: 'concurrent'
            },
            testFamily: 'microtest',
            files: microtestFiles,
            timeouts: microtestTimeouts
        },
        microtest: {
            execution: {
                processModel: 'supervised-process',
                scheduling: 'concurrent'
            },
            testFamily: 'microtest',
            files: microtestFiles,
            timeouts: microtestTimeouts
        },
        integration: {
            execution: {
                processModel: 'supervised-process',
                scheduling: 'concurrent'
            },
            testFamily: 'integration',
            files: {
                include: [ 'source/integration-tests/package-smoke/**/*.test.ts' ]
            },
            timeouts: {
                collectionMilliseconds: 30_000,
                hardMilliseconds: 180_000,
                softMilliseconds: 120_000
            }
        },
        'runtime-integration': {
            execution: {
                processModel: 'supervised-process',
                scheduling: 'concurrent'
            },
            testFamily: 'integration',
            files: {
                include: [ 'source/integration-tests/runtime-integration/**/*.test.ts' ]
            },
            timeouts: {
                collectionMilliseconds: 30_000,
                hardMilliseconds: 30_000,
                softMilliseconds: 20_000
            }
        },
        'runtime-integration-development': {
            execution: {
                processModel: 'supervised-process',
                scheduling: 'serial'
            },
            testFamily: 'integration',
            files: {
                include: [ 'source/integration-tests/runtime-integration-development/**/*.test.ts' ]
            },
            timeouts: {
                collectionMilliseconds: 30_000,
                hardMilliseconds: 30_000,
                softMilliseconds: 20_000
            }
        }
    }
});
