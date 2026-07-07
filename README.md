# gh-tuner

Delta-based issue triage and PR review summaries for OSS maintainers.

gh-tuner scans your GitHub repos, filters out noise, and generates a structured
markdown checklist of what needs your attention — aligned to your review schedule.

## Install

```bash
git clone git@github.com:awanlin/gh-tuner.git
cd gh-tuner
yarn install
yarn build
```

## Usage

```bash
# Issue triage (auto-detects delta window on Tue/Thu)
gh-tuner issues

# PR review checklist (auto-detects delta window on Fri)
gh-tuner prs

# Both
gh-tuner all

# Override delta window
gh-tuner issues --since 2026-07-01

# Save to file without opening browser
gh-tuner issues --no-open --output summary.md
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

A GitHub Actions workflow (`.github/workflows/CI.yml`) runs on every pull request to `main`. It tests against Node 22 and 24 and runs:

1. **Type check** — `yarn build`
2. **Lint** — `yarn lint` (ESLint with typescript-eslint)
3. **Format check** — `yarn format:check` (Prettier)
4. **Tests** — `yarn test` (Vitest)

## License

MIT
