# Tuner

Delta-based issue triage and PR review summaries for OSS maintainers.

Tuner scans your GitHub repos, filters out noise, and generates a structured
markdown checklist of what needs your attention — aligned to your review schedule.

## Install

```bash
git clone git@github.com:awanlin/tuner.git
cd tuner
npm install
npm run build
```

## Usage

```bash
# Issue triage (auto-detects delta window on Tue/Thu)
tuner issues

# PR review checklist (auto-detects delta window on Fri)
tuner prs

# Both
tuner all

# Override delta window
tuner issues --since 2026-07-01

# Save to file without opening browser
tuner issues --no-open --output summary.md
```

## Configuration

Create a `tuner.yaml` in your project root:

```yaml
user: your-github-username
startDate: 2026-07-07

repos:
  - name: org/repo
    scope: all        # fetch all issues/PRs
    cadence: weekly   # weekly | biweekly | monthly
  - name: org/other-repo
    scope: filtered   # only items involving you + label matches
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
  humanEngagementOnly: true    # only surface human comments, not system activity
  excludeAwaitingOthers: true  # skip items where you're the last commenter
```

## Requirements

- Node.js 20+
- [GitHub CLI](https://cli.github.com/) (`gh`) authenticated

## License

MIT
