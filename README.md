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

# Preview without recording this run as the start of the next delta
npx gh-tuner@latest issues --no-save-state

# Use a custom config file
npx gh-tuner@latest issues --config ./my-config.yaml

# Show help
npx gh-tuner@latest --help
npx gh-tuner@latest issues --help
```

### Delta window

After each successful run, gh-tuner saves the exact run time per mode (`issues`, `prs`) in `.gh-tuner-state.json` next to the config file. The next run starts its delta from that timestamp, so items covered by the previous run don't come back. The order of precedence is:

1. `--since`, if given
2. The saved timestamp from the last run (for `all`, the earlier of the two modes)
3. The schedule's `since: last-<day>` (midnight UTC of that day)

State is not saved when `--no-save-state` is passed or when any repo failed to fetch.

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
    scope: filtered # only items involving you + label matches (string form)
    labels:
      - area:search
      - area:docs
  - name: org/big-repo
    scope: # per-mode scope (object form)
      issues: all # see all new issues
      prs: filtered # label-filter PRs
    labels:
      - area:search

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
  excludeAuthor: true # skip items you authored
  excludeDrafts: true # skip draft PRs
  excludeChangesRequestedByOthers: true # skip PRs where another reviewer already requested changes
  excludeAssigned: true # skip items that already have an assignee
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
