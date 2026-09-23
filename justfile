export PATH := './node_modules/.bin:' + env_var('PATH')

default:
    @just --list

compile:
    tsc --build

eslint *OPTIONS:
    eslint package.json '*.js' 'source/**/*.ts' 'tool-configurations/**/*.{js,ts,json,yml}' readme.md --config tool-configurations/eslint.config.js --cache --cache-location './target/.eslintcache' --cache-strategy content --max-warnings 0 {{OPTIONS}}

eslint-fix: (eslint '--fix')

lint-filename:
    ls-lint -config tool-configurations/ls-lint.yml

lint-unused-code:
    knip --config tool-configurations/knip.json
    knip --config tool-configurations/knip.json --production

lint-dependencies:
    depcruise source tool-configurations/dependency-cruiser.config.js tool-configurations/eslint.config.js tool-configurations/overkill.config.ts packtory.config.js --config tool-configurations/dependency-cruiser.config.js

lint-duplication *OPTIONS:
    jscpd source --config tool-configurations/jscpd.json {{OPTIONS}}

lint: eslint lint-filename lint-unused-code lint-dependencies lint-duplication

lint-fix: eslint-fix

test-unit:
    NODE_OPTIONS='--allow-fs-read=. --allow-fs-write=target' overkill run --config tool-configurations/overkill.config.ts --profile microtest

test-unit-with-coverage:
    c8 --config tool-configurations/c8.json node node_modules/@overkill-dev/test/packages/test/overkill.entry-point.js run --config tool-configurations/overkill.config.ts --profile coverage --measure-resource-usage

test-types:
    ./node_modules/.bin/tstyche --config tool-configurations/tstyche.json

test-package-smoke: compile
    node node_modules/@overkill-dev/test/packages/test/overkill.entry-point.js run --config tool-configurations/overkill.config.ts --profile integration

test: test-unit-with-coverage test-types test-package-smoke

publish-dry-run: test-package-smoke
    packtory publish
