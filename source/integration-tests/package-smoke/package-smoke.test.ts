import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { suite, test } from '@overkill-dev/test';

type PackageManifest = {
    readonly bugs: {
        readonly url: string;
    };
    readonly exports: {
        readonly '.': {
            readonly import: string;
            readonly types: string;
        };
    };
    readonly homepage: string;
    readonly name: string;
    readonly type: string;
};

type PackageExports = {
    readonly createFakeRefNode: () => unknown;
    readonly matchRefs: () => unknown;
    readonly introspect: (element: unknown) => SmokeView;
};

type ReactModule = {
    readonly createElement: (type: string, props: null, ...children: readonly string[]) => unknown;
};

type SmokeView = {
    readonly find: (selector: string) => { readonly textContent: string; } | undefined;
};

const sourceFolder = path.dirname(fileURLToPath(import.meta.url));
const projectFolder = path.join(sourceFolder, '../../..');
const packageFolder = path.join(projectFolder, 'target/package-smoke');
const consumerFolder = path.join(projectFolder, 'target/package-smoke-consumer');
const jsonIndentation = 4;
const consumerPackageJson = {
    name: 'react-introspect-smoke-consumer',
    private: true,
    type: 'module'
};

async function runProjectCommand(command: string, parameters: readonly string[]): Promise<void> {
    await new Promise<void>(function waitForCommand(resolve, reject) {
        const childProcess = spawn(command, parameters, {
            cwd: projectFolder,
            stdio: 'inherit'
        });

        childProcess.once('error', reject);
        childProcess.once('close', function resolveCommand(exitCode) {
            if (exitCode === 0) {
                resolve(undefined);

                return;
            }

            reject(new Error(`Command failed: ${command} ${parameters.join(' ')}`));
        });
    });
}

async function requirePackagedFile(packagedOutputFolder: string, relativePath: string): Promise<void> {
    await fs.access(path.join(packagedOutputFolder, relativePath));
}

async function readPackageManifest(packagedOutputFolder: string): Promise<PackageManifest> {
    return JSON.parse(await fs.readFile(path.join(packagedOutputFolder, 'package.json'), 'utf8')) as PackageManifest;
}

async function writeConsumerProject(consumerProjectFolder: string, packagedOutputFolder: string): Promise<void> {
    const nodeModulesFolder = path.join(consumerProjectFolder, 'node_modules');
    const packageLink = path.join(nodeModulesFolder, 'react-introspect');

    await fs.rm(consumerProjectFolder, { force: true, recursive: true });
    await fs.mkdir(nodeModulesFolder, { recursive: true });
    await fs.symlink(path.relative(nodeModulesFolder, packagedOutputFolder), packageLink, 'dir');
    await fs.writeFile(
        path.join(consumerProjectFolder, 'package.json'),
        `${JSON.stringify(consumerPackageJson, null, jsonIndentation)}\n`
    );
    await fs.writeFile(
        path.join(consumerProjectFolder, 'tsconfig.json'),
        `${
            JSON.stringify(
                {
                    compilerOptions: {
                        module: 'NodeNext',
                        moduleResolution: 'NodeNext',
                        strict: true,
                        target: 'ES2025',
                        types: []
                    },
                    files: [ 'smoke.ts' ]
                },
                null,
                jsonIndentation
            )
        }\n`
    );
    await fs.writeFile(
        path.join(consumerProjectFolder, 'smoke.ts'),
        [
            "import React from 'react';",
            "import { createFakeRefNode, matchRefs, introspect } from 'react-introspect';",
            "import type { IntrospectionView } from 'react-introspect';",
            '',
            'function Button(props: { readonly label: string; readonly onSave: () => void; }): React.ReactNode {',
            "    return React.createElement('button', { onClick: props.onSave }, props.label);",
            '}',
            '',
            'const view: IntrospectionView = introspect(',
            "    React.createElement(Button, { label: 'Save', onSave() {} }),",
            '    { depth: 2 }',
            ');',
            'const button = view.find(Button);',
            "button?.pickProps([ 'label' ]);",
            "view.find('button')?.sendEvent('click');",
            'createFakeRefNode({ focus() {} });',
            "matchRefs([{ type: 'input', node: {} }]);",
            ''
        ]
            .join('\n')
    );
}

async function packPackage(packagedOutputFolder: string): Promise<void> {
    await fs.rm(packagedOutputFolder, { force: true, recursive: true });

    await runProjectCommand('packtory', [
        'pack',
        'react-introspect',
        '--format',
        'folder',
        '--out',
        packagedOutputFolder,
        '--version',
        '0.0.0-smoke'
    ]);
}

async function checkConsumerTypes(consumerProjectFolder: string, packagedOutputFolder: string): Promise<void> {
    await writeConsumerProject(consumerProjectFolder, packagedOutputFolder);

    await runProjectCommand('tsc', [
        '--project',
        path.join(consumerProjectFolder, 'tsconfig.json'),
        '--noEmit'
    ]);
}

export const testNode = suite('package smoke', [
    test('packs and imports the published package shape', async function (scope) {
        await packPackage(packageFolder);

        const [ manifest, packageExports, React ] = await Promise.all([
            readPackageManifest(packageFolder),
            import(
                pathToFileURL(path.join(packageFolder, 'react-introspect.entry-point.js')).href
            ) as Promise<PackageExports>,
            import('react') as Promise<ReactModule>
        ]);
        const view = packageExports.introspect(React.createElement('main', null, 'Smoke'));

        await Promise.all(
            [ 'LICENSE', 'banner.svg', 'logo.svg', 'readme.md' ].map(async function requireFile(fileName) {
                await requirePackagedFile(packageFolder, fileName);
            })
        );
        scope.assert.deepEqual({
            bugsUrl: manifest.bugs.url,
            homepage: manifest.homepage,
            importEntry: manifest.exports['.'].import,
            name: manifest.name,
            runtimeRender: view.find('main')?.textContent,
            type: manifest.type,
            typeEntry: manifest.exports['.'].types
        }, {
            bugsUrl: 'https://github.com/enormora/react-introspect/issues',
            homepage: 'https://github.com/enormora/react-introspect#readme',
            importEntry: './react-introspect.entry-point.js',
            name: 'react-introspect',
            runtimeRender: 'Smoke',
            type: 'module',
            typeEntry: './react-introspect.entry-point.d.ts'
        });
        scope.assert.function(packageExports.createFakeRefNode);
        scope.assert.function(packageExports.matchRefs);
        scope.assert.function(packageExports.introspect);

        await checkConsumerTypes(consumerFolder, packageFolder);

        return scope.assert.collect();
    })
]);
