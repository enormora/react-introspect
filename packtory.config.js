import fs from 'node:fs/promises';
import path from 'node:path';

const projectFolder = process.cwd();
const rootPackageJson = JSON.parse(await fs.readFile(path.join(projectFolder, 'package.json'), 'utf8'));

const packageMetadata = {
    author: rootPackageJson.author,
    description: rootPackageJson.description,
    keywords: rootPackageJson.keywords,
    license: rootPackageJson.license,
    repository: rootPackageJson.repository,
    engines: rootPackageJson.engines
};

export const config = {
    registrySettings: {
        auth: {
            publish: { type: 'npm-oidc', provider: 'auto' },
            metadata: 'auto'
        }
    },
    checks: {
        typeScriptIntegrity: {
            enabled: true,
            declarations: 'all'
        },
        requiredFiles: {
            enabled: true,
            files: [ 'LICENSE', 'readme.md', 'banner.svg', 'logo.svg' ]
        }
    },
    commonPackageSettings: {
        sourcesFolder: path.join(projectFolder, 'target/build/source'),
        mainPackageJson: rootPackageJson,
        includeSourceMapFiles: true,
        publishSettings: {
            access: 'public',
            provenance: { type: 'auto' }
        }
    },
    packages: [
        {
            name: 'react-probe',
            roots: {
                main: {
                    js: 'react-probe.entry-point.js',
                    declarationFile: 'react-probe.entry-point.d.ts'
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
            additionalPackageJsonAttributes: packageMetadata
        }
    ]
};
