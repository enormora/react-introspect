import { defineConfig } from '@overkill-dev/test/config';

export const config = defineConfig({
    runtimeStateDir: 'target/.overkill',
    profiles: {
        coverage: {
            execution: {
                processModel: 'in-process',
                scheduling: 'serial'
            },
            testFamily: 'microtest',
            files: {
                exclude: [
                    'source/package/smoke/package-smoke.test.ts',
                    'source/reconciler/runtime/introspect-runtime-integration.test.ts'
                ],
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
                exclude: [
                    'source/package/smoke/package-smoke.test.ts',
                    'source/reconciler/runtime/introspect-runtime-integration.test.ts'
                ],
                include: [ 'source/**/*.test.ts' ]
            },
            timeouts: {
                collectionMilliseconds: 30_000
            }
        },
        integration: {
            execution: {
                processModel: 'supervised-process',
                scheduling: 'serial'
            },
            testFamily: 'integration',
            files: {
                include: [ 'source/package/smoke/package-smoke.test.ts' ]
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
                scheduling: 'serial'
            },
            testFamily: 'integration',
            files: {
                include: [ 'source/reconciler/runtime/introspect-runtime-integration.test.ts' ]
            },
            timeouts: {
                collectionMilliseconds: 30_000,
                hardMilliseconds: 30_000,
                softMilliseconds: 20_000
            }
        }
    }
});
