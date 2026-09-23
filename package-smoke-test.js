import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectFolder = path.dirname(fileURLToPath(import.meta.url));
const packageFolder = path.join(projectFolder, 'target/package-smoke');
const consumerFolder = path.join(projectFolder, 'target/package-smoke-consumer');
const jsonIndentation = 4;
const consumerPackageJson = {
    name: 'react-probe-smoke-consumer',
    private: true,
    type: 'module'
};

async function run(command, parameters) {
    await new Promise(function waitForCommand(resolve, reject) {
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

async function requireFile(relativePath) {
    await fs.access(path.join(packageFolder, relativePath));
}

async function assertManifest() {
    const manifest = JSON.parse(await fs.readFile(path.join(packageFolder, 'package.json'), 'utf8'));

    assert.equal(manifest.name, 'react-probe');
    assert.equal(manifest.type, 'module');
    assert.equal(manifest.bugs.url, 'https://github.com/enormora/react-probe/issues');
    assert.equal(manifest.homepage, 'https://github.com/enormora/react-probe#readme');
    assert.equal(manifest.exports['.'].import, './react-probe.entry-point.js');
    assert.equal(manifest.exports['.'].types, './react-probe.entry-point.d.ts');
}

async function assertRuntimeImport() {
    const packageExports = await import(pathToFileURL(path.join(packageFolder, 'react-probe.entry-point.js')).href);
    const React = await import('react');

    assert.equal(typeof packageExports.createFakeRefNode, 'function');
    assert.equal(typeof packageExports.matchRefs, 'function');
    assert.equal(typeof packageExports.probe, 'function');

    const view = packageExports.probe(React.createElement('main', null, 'Smoke'));

    assert.equal(view.find('main')?.textContent, 'Smoke');
}

async function writeConsumerProject() {
    const nodeModulesFolder = path.join(consumerFolder, 'node_modules');
    const packageLink = path.join(nodeModulesFolder, 'react-probe');

    await fs.rm(consumerFolder, { force: true, recursive: true });
    await fs.mkdir(nodeModulesFolder, { recursive: true });
    await fs.symlink(path.relative(nodeModulesFolder, packageFolder), packageLink, 'dir');
    await fs.writeFile(
        path.join(consumerFolder, 'package.json'),
        `${JSON.stringify(consumerPackageJson, null, jsonIndentation)}\n`
    );
    await fs.writeFile(
        path.join(consumerFolder, 'tsconfig.json'),
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
        path.join(consumerFolder, 'smoke.ts'),
        [
            "import React from 'react';",
            "import { createFakeRefNode, matchRefs, probe } from 'react-probe';",
            "import type { ProbeView } from 'react-probe';",
            '',
            'function Button(props: { readonly label: string; readonly onSave: () => void; }): React.ReactNode {',
            "    return React.createElement('button', { onClick: props.onSave }, props.label);",
            '}',
            '',
            "const view: ProbeView = probe(React.createElement(Button, { label: 'Save', onSave() {} }), { depth: 2 });",
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

await fs.rm(packageFolder, { force: true, recursive: true });

await run('packtory', [
    'pack',
    'react-probe',
    '--format',
    'folder',
    '--out',
    packageFolder,
    '--version',
    '0.0.0-smoke'
]);

await requireFile('LICENSE');
await requireFile('banner.svg');
await requireFile('logo.svg');
await requireFile('readme.md');
await assertManifest();
await assertRuntimeImport();
await writeConsumerProject();

await run('tsc', [
    '--project',
    path.join(consumerFolder, 'tsconfig.json'),
    '--noEmit'
]);
