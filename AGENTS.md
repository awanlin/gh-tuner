# Agent Instructions

## About this repo

gh-tuner is a TypeScript CLI that generates delta-based issue triage and PR review summaries across multiple GitHub repos. It is a personal tool — contributions from others are not accepted.

## Version bumping

Every PR must include a version bump in `package.json`. CI will fail if the version has not changed compared to `main`.

Bump the version using semver based on the nature of the change:

- **patch** (`0.1.x`) — bug fixes, dependency updates, CI/config changes, docs
- **minor** (`0.x.0`) — new features, new CLI flags, new config options
- **major** (`x.0.0`) — breaking changes to CLI interface, config format, or output format

Run this to bump:

```bash
npm version patch|minor|major --no-git-tag-version
npm pkg fix
yarn install
```

- `npm pkg fix` is required because `npm version` collapses the `bin` field to a string, which npm publish rejects. `npm pkg fix` restores the correct object form.
- `yarn install` is required to update the lockfile — CI will fail with `--immutable` if the lockfile is out of sync.

Do not create git tags — the CD pipeline handles publishing.

## Development

- **Build:** `yarn tsc`
- **Test:** `yarn test`
- **Lint:** `yarn lint`
- **Format:** `yarn format`
- **Full type check:** `yarn tsc:full`

## CI/CD

- **CI** runs on every PR: type check, lint, format check, tests, and version bump check
- **CD** runs on push to `main`: build and publish to npm
