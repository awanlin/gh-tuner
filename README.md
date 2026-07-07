# gh-tuner

> [!NOTE]
> This is a personal tool. Contributions are not accepted.

Delta-based issue triage and PR review summaries for OSS maintainers.

gh-tuner scans your GitHub repos, filters out noise, and generates a structured
markdown checklist of what needs your attention — aligned to your review schedule.

## Quick start

Run directly with npx (no install needed):

```bash
# Issue triage (auto-detects delta window based on your schedule)
npx gh-tuner@latest issues

# PR review checklist
npx gh-tuner@latest prs

# Both issues and PRs
npx gh-tuner@latest all
```

### Options

```bash
# Override the delta window start date
npx gh-tuner@latest issues --since 2026-07-01

# Save output to a file instead of stdout
npx gh-tuner@latest issues --output summary.md

# Skip opening items in the browser
npx gh-tuner@latest issues --no-open

# Force open all items even if there are more than 50
npx gh-tuner@latest issues --open-all

# Use a custom config file
npx gh-tuner@latest issues --config ./my-config.yaml

# Show help
npx gh-tuner@latest --help
npx gh-tuner@latest issues --help
```

## Install from source

```bash
git clone git@github.com:awanlin/gh-tuner.git
cd gh-tuner
yarn install
yarn tsc
```

## Configuration

Create a `gh-tuner.yaml` in your project root:

```yaml
user: your-github-username
startDate: 2026-07-07

repos:
  - name: org/repo
    scope: all # fetch all issues/PRs
    cadence: weekly # weekly | biweekly | monthly
  - name: org/other-repo
    scope: filtered # only items involving you + label matches
    labels:
      - area:search
      - area:docs

schedule:
  tuesday:
    mode: issues
    since: last-thursday
  thursday:
    mode: issues
    since: last-tuesday
  friday:
    mode: prs
    since: last-friday

securityKeywords:
  - security
  - CVE
  - GHSA

filters:
  humanEngagementOnly: true # only surface human comments, not system activity
  excludeAwaitingOthers: true # skip items where you're the last commenter
```

## Requirements

- Node.js 22 or 24 (LTS versions only — pinned via `.nvmrc` to 24)
- [GitHub CLI](https://cli.github.com/) (`gh`) authenticated

## CI

A GitHub Actions workflow (`.github/workflows/CI.yml`) runs on every pull request:

1. **Version check** — verifies `package.json` version was bumped
2. **Type check** — `yarn tsc:full`
3. **Lint** — `yarn lint` (ESLint with typescript-eslint)
4. **Format check** — `yarn format:check` (Prettier)
5. **Tests** — `yarn test` (Vitest)

## License

MIT
