import fs from 'node:fs/promises';
import path from 'node:path';

const projectFolder = process.cwd();
const rootPackageJson = JSON.parse(await fs.readFile(path.join(projectFolder, 'package.json'), 'utf8'));

const packageMetadata = {
    author: rootPackageJson.author,
    bugs: rootPackageJson.bugs,
    description: rootPackageJson.description,
    homepage: rootPackageJson.homepage,
    keywords: rootPackageJson.keywords,
    license: rootPackageJson.license,
    repository: rootPackageJson.repository,
    engines: rootPackageJson.engines
};

export const configuration = {
    registrySettings: {
        authentication: {
            publish: { type: 'npm-open-identity-connect', provider: 'automatic' },
            metadata: 'automatic'
        }
    },
    checks: {
        typeScriptIntegrity: { enabled: true, declarations: 'all' },
        noDuplicatedFiles: {
            enabled: true
        },
        requiredFiles: {
            enabled: true,
            files: [ 'LICENSE', 'readme.md', 'banner.svg', 'logo.svg' ]
        },
        noUnusedBundleDependencies: { enabled: true },
        noDevelopmentDependencyImports: { enabled: true },
        uniqueTargetPaths: { enabled: true },
        noSideEffects: {
            enabled: false
        },
        noUnexposedExecutables: { enabled: true },
        nodeEngineCompatibility: { enabled: true }
    },
    commonPackageSettings: {
        sourcesFolder: path.join(projectFolder, 'target/build/source'),
        mainPackageManifest: rootPackageJson,
        includeSourceMapFiles: true,
        publishSettings: {
            access: 'public',
            provenance: { type: 'automatic' }
        }
    },
    packages: [
        {
            name: 'react-introspect',
            roots: {
                main: {
                    javaScript: 'react-introspect.entry-point.js',
                    declarationFile: 'react-introspect.entry-point.d.ts'
                }
            },
            additionalFiles: [
                {
                    inputFilePath: path.join(projectFolder, 'LICENSE'),
                    targetFilePath: 'LICENSE'
                },
                {
                    inputFilePath: path.join(projectFolder, 'readme.md'),
                    targetFilePath: 'readme.md'
                },
                {
                    inputFilePath: path.join(projectFolder, 'banner.svg'),
                    targetFilePath: 'banner.svg'
                },
                {
                    inputFilePath: path.join(projectFolder, 'logo.svg'),
                    targetFilePath: 'logo.svg'
                }
            ],
            additionalPackageManifestAttributes: packageMetadata
        }
    ]
};
