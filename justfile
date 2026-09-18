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

test-unit:
    ./node_modules/.bin/overkill run --config overkill.config.ts --profile microtest source/test-runner-smoke.test.ts

test-unit-with-coverage:
    ./node_modules/.bin/c8 --config .c8rc.json ./node_modules/.bin/overkill run --config overkill.config.ts --profile microtest source/test-runner-smoke.test.ts --measure-resource-usage

test-types:
    ./node_modules/.bin/tstyche

test: test-unit-with-coverage test-types

publish-dry-run: compile
    packtory publish
