export PATH := './node_modules/.bin:' + env_var('PATH')

default:
    @just --list

compile:
    tsc --build

eslint *OPTIONS:
    eslint package.json '*.js' 'source/**/*.ts' overkill.config.ts readme.md --cache --cache-location './target/.eslintcache' --cache-strategy content --max-warnings 0 {{OPTIONS}}

eslint-fix: (eslint '--fix')

lint-filename:
    ls-lint

lint-unused-code:
    knip
    knip --production

lint-dependencies:
    depcruise source dependency-cruiser.config.js eslint.config.js overkill.config.ts packtory.config.js --config dependency-cruiser.config.js

lint-duplication *OPTIONS:
    jscpd source --config jscpd.json {{OPTIONS}}

lint: eslint lint-filename lint-unused-code lint-dependencies lint-duplication

lint-fix: eslint-fix

test-unit: compile
    ./node_modules/.bin/overkill run --config overkill.config.ts --profile microtest target/build/source/test-runner-smoke.test.js target/build/source/probe-public-api.test.js

test-unit-with-coverage: compile
    ./node_modules/.bin/c8 --config .c8rc.json node node_modules/@overkill-dev/test/packages/test/overkill.entry-point.js run --config overkill.config.ts --profile microtest target/build/source/test-runner-smoke.test.js target/build/source/probe-public-api.test.js --measure-resource-usage

test-types:
    ./node_modules/.bin/tstyche

test: test-unit-with-coverage test-types

publish-dry-run: compile
    packtory publish
