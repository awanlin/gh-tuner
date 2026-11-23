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

# Recompute cached capacity stats (see Review capacity)
npx gh-tuner@latest prs --refresh-capacity

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

The run state (last run time) is not saved when `--no-save-state` is passed or when any repo failed to fetch. The capacity stats cache (see Review capacity) is still updated either way.

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
  - name: org/maintained-repo
    scope:
      issues: all
      prs: filtered
    labels:
      - area:search # ranks PR candidates instead of filtering them
    capacity: # enables review capacity (see below)
      model: fair-share # fair-share | gap
      ownersSection: Core Maintainers
      inProgressMultiplier: 2

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
  excludeAssigned: true # skip items that already have an assignee (also applies to mentions)
  mentionsRequireInvolvement: true # only list mentions on items you're involved in
```

### Mentions

Items where you were @-mentioned and haven't replied are listed under **Mentioned — Awaiting Reply**. `excludeAssigned` applies here too, so mentions on items assigned to someone else are dropped.

With `mentionsRequireInvolvement: true` (default `false`), only mentions on items you're involved in are listed there. You're involved if any of these is true:

- You're an assignee.
- You've reviewed it (any state).
- You've commented on it at any time.
- You're the author.

Other mentions go in a collapsed **Pinged — not involved** list after the Mentioned section. They're counted in the footer and are never opened with `--open`.

## Review capacity

For repos with a `capacity` block, gh-tuner replaces the delta "New/Updated PRs" sections with a review capacity report. It works out how many PRs you can reasonably take on per week, tracks what you already have in progress, and suggests new PRs to pick up. In `issues` mode only the one-line `**PR capacity**` summary is added, so you can see whether a PR from triage fits.

For these repos, `labels` rank PR candidates instead of filtering them. Matching PRs come first, then the oldest.

### Config keys

```yaml
capacity:
  model: fair-share # required: fair-share | gap
  ownersSection: Core Maintainers # required: heading in backstage/backstage OWNERS.md
  codeownersTeam: '@org/team' # required for gap: team that alone marks a workspace as ownerless
  stretch: 1.25 # multiplier on your fair share or floor
  paceMultiplier: 1.2 # ceiling relative to your own review pace
  inProgressMultiplier: 2 # in-progress limit = ceil(weekly x this)
  staleDays: 14 # days of silence before a PR is parked or called stuck
  inflowWeeks: 12 # window for counting incoming PRs
  paceWeeks: 52 # window for measuring your own review pace
```

### Models

- **fair-share**: the weekly target is `min(inflow / maintainers x stretch, pace x paceMultiplier)`, rounded and at least 1. `inflow` is incoming non-bot PRs per week over `inflowWeeks`, and `pace` is the PRs you reviewed per week over `paceWeeks`.
- **gap**: for repos where workspaces have owners. The pool is PRs on workspaces that are ownerless (the `codeownersTeam` is the only owner) or that you own. The weekly target is `min(max(gap, floor), floor(pace x paceMultiplier))`, at least 1. `gap` is the pool rate minus what other maintainers review per week, rounded up. `floor` is `(shared pool / maintainers + your own workspaces) x stretch`.

The in-progress limit is `ceil(weekly x inProgressMultiplier)`. New pickups allowed this week are capped by the weekly target (minus PRs already picked up in the last 7 days) and by the room left under the limit.

### What counts as in progress

A PR is in progress when you are assigned to it. Assign yourself to any PR you pick up, otherwise it is not counted. PRs you reviewed but are not assigned to are listed separately so you can assign yourself or let go.

### Parking rules

Each in-progress PR gets a status:

- **Waiting on you**: you have not reviewed yet, the author pushed after your last activity, or the author replied recently.
- **Approved**: your last activity was an approval and nothing was pushed since. It is waiting on a merge.
- **Talking but not moving**: the author commented but did not push, and you have been quiet for `staleDays` or more.
- **Waiting on author**: you gave feedback less than `staleDays` ago and the author has not responded.
- **Parked**: drafts, and PRs where the author has been silent for `staleDays` or more since your feedback. Parked PRs do not count toward the limit.

### Caching

Incoming PR rate, review pace and pool stats are cached in `.gh-tuner-state.json` for 7 days, and recomputed early when the config or the maintainer list changes. Pass `--refresh-capacity` to force a recompute.

If capacity can't be computed for a repo (for example a GitHub fetch failure), the report says so and the rest of the run continues.

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
