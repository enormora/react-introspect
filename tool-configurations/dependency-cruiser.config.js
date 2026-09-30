const configFiles = [
    '^tool-configurations/dependency-cruiser\\.config\\.js$',
    '^tool-configurations/eslint\\.config\\.js$',
    '^tool-configurations/overkill\\.config\\.ts$',
    '^packtory\\.config\\.js$'
];

const entryPointFiles = [ '^source/.+\\.entry-point\\.ts$' ];
const testFiles = [ '\\.(test|type-test)\\.ts$' ];
const excludedFiles = [ '^(\\./)?target/' ];
const ignoreFromOrphans = [ ...configFiles, ...entryPointFiles, ...testFiles ];

/**
 * @type {import('dependency-cruiser').IConfiguration}
 */
export default {
    forbidden: [
        {
            name: 'no-circular',
            severity: 'error',
            from: {},
            to: {
                circular: true
            }
        },
        {
            name: 'no-values-to-other-layers',
            severity: 'error',
            from: {
                path: '^source/values/',
                pathNot: testFiles
            },
            to: {
                path: '^source/',
                pathNot: '^source/values/'
            }
        },
        {
            name: 'no-react-elements-to-other-layers',
            severity: 'error',
            from: {
                path: '^source/react-elements/',
                pathNot: testFiles
            },
            to: {
                path: '^source/',
                pathNot: '^source/(react-elements|values)/'
            }
        },
        {
            name: 'no-public-to-other-layers',
            severity: 'error',
            from: {
                path: '^source/public/',
                pathNot: testFiles
            },
            to: {
                path: '^source/',
                pathNot: '^source/public/'
            }
        },
        {
            name: 'no-shared-layers-to-pipeline',
            severity: 'error',
            from: {
                path: '^source/(diagnostics|matching|refs)/',
                pathNot: testFiles
            },
            to: {
                path: '^source/(reconciler|render|runtime|snapshot)/'
            }
        },
        {
            name: 'no-snapshot-to-upper-layers',
            severity: 'error',
            from: {
                path: '^source/snapshot/',
                pathNot: testFiles
            },
            to: {
                path: '^source/(reconciler|render|runtime)/'
            }
        },
        {
            name: 'no-render-to-upper-layers',
            severity: 'error',
            from: {
                path: '^source/render/',
                pathNot: testFiles
            },
            to: {
                path: '^source/(reconciler|runtime|snapshot)/'
            }
        },
        {
            name: 'no-reconciler-to-runtime',
            severity: 'error',
            from: {
                path: '^source/reconciler/',
                pathNot: testFiles
            },
            to: {
                path: '^source/runtime/'
            }
        },
        {
            name: 'no-orphans',
            severity: 'error',
            from: {
                orphan: true,
                pathNot: ignoreFromOrphans
            },
            to: {}
        },
        {
            name: 'no-internal-orphans',
            severity: 'error',
            from: {
                pathNot: []
            },
            module: {
                numberOfDependentsLessThan: 1,
                pathNot: ignoreFromOrphans
            }
        },
        {
            name: 'no-internal-but-tested-orphans',
            severity: 'error',
            from: {
                pathNot: testFiles
            },
            module: {
                numberOfDependentsLessThan: 1,
                pathNot: [
                    ...ignoreFromOrphans,
                    '.*(?<!\\.(ts|js))$',
                    '^node_modules/',
                    ...excludedFiles
                ]
            }
        },
        {
            name: 'no-deprecated-npm',
            severity: 'error',
            from: {},
            to: {
                dependencyTypes: [ 'deprecated' ]
            }
        },
        {
            name: 'no-duplicate-dep-types',
            severity: 'error',
            from: {},
            to: {
                dependencyTypes: [ 'npm' ],
                dependencyTypesNot: [ 'type-only' ],
                moreThanOneDependencyType: true
            }
        },
        {
            name: 'not-to-dev-dep',
            severity: 'error',
            from: {
                path: '^source/',
                pathNot: testFiles
            },
            to: {
                dependencyTypes: [ 'npm-dev' ],
                moreThanOneDependencyType: false,
                pathNot: [ '^node_modules/@types/', '\\.d\\.ts$' ]
            }
        },
        {
            name: 'no-non-package-json',
            severity: 'error',
            from: {},
            to: {
                dependencyTypes: [ 'npm-no-pkg', 'npm-unknown' ]
            }
        },
        {
            name: 'not-test-file-import',
            severity: 'error',
            from: {
                pathNot: testFiles
            },
            to: {
                path: testFiles
            }
        }
    ],
    options: {
        doNotFollow: {
            path: 'node_modules|target/',
            dependencyTypes: [ 'npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled', 'npm-no-pkg' ]
        },
        exclude: {
            path: excludedFiles
        },
        moduleSystems: [ 'cjs', 'es6', 'tsd' ],
        tsPreCompilationDeps: true,
        tsConfig: {
            fileName: 'tsconfig.json'
        },
        preserveSymlinks: false,
        combinedDependencies: true,
        reporterOptions: {
            dot: {
                collapsePattern: 'node_modules/[^/]+'
            }
        }
    }
};
