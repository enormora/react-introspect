import { defineConfig } from '@overkill-dev/test/config';

export const config = defineConfig({
    runtimeStateDir: 'target/.overkill',
    profiles: {
        microtest: {
            execution: {
                processModel: 'supervised-process',
                scheduling: 'concurrent'
            },
            testFamily: 'microtest',
            files: {
                exclude: [ 'source/integration-tests/**' ],
                include: [ 'source/**/*.test.ts' ]
            },
            timeouts: {
                collectionMilliseconds: 30_000
            },
            coverage: {
                outputDir: '../target/coverage',
                outputs: [ 'lcov', 'text' ],
                sources: {
                    mode: 'all',
                    include: [ 'source/**/*.ts' ],
                    exclude: [
                        'source/**/*.entry-point.ts',
                        'source/**/*.test.ts',
                        'source/**/*.type-test.ts',
                        'source/**/*-types.ts'
                    ]
                },
                thresholds: {
                    branches: 100,
                    functions: 100,
                    lines: 100
                }
            }
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
