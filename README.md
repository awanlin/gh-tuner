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


## Hi there 👋

I'm André Wanlin a Customer Success Engineer [@spotify](https://github.com/spotify) working on [@backstage](https://github.com/backstage/backstage) based in Winnipeg, Manitoba, Canada 🇨🇦

### Around the Web

- 💼 LinkedIn: [André Wanlin](https://www.linkedin.com/in/andr%C3%A9-wanlin-31a00a16a/)
- 🎮 Discord: `Ahhhndre`

## Backstage

### Community

I enjoying engaging with the Backstage Community where I can and as I have time. Here's an overview of my current and past community activities:

- [Active CNCF Ambassador](https://www.cncf.io/people/ambassadors/?_sft_lf-country=ca&p=andre-wanlin&_sf_s=andre+wanlin) where I help promote Backstage and interact with other CNCF project, as time permits
- Active Co-Chair for BackstageCon - previously co-hosted [BackstageCon Atlanta 2025](https://www.youtube.com/watch?v=vcMzVi92n-w&list=PL8iP9yIjU0Q33vpSaBlAvIhgDb-9smXUU) and [BackstageCon Amsterdam 2026](https://www.youtube.com/watch?v=93M6jStFEf4&list=PL8iP9yIjU0Q0eZv3LncHLG3g5itFec995). Looking forward to [BackstageCon Salt Lake City 2026](https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/co-located-events/backstagecon/)!
- Backstage ContribFest - I've been leading, [along with amazing co-hosts](https://contribfest.backstage.io/hall-of-hosts/), this session at KubeCon in Europe and North America since November 2024 (4 sessions so far and counting). Looking forward to doing it again in Salt Lake City in November 2026!

### Open Source

Here's my current open source work and responsibilities:

- Active Backstage [Core Maintainer](https://github.com/backstage/backstage/blob/master/OWNERS.md#core-maintainers) and help review [Pull Requests](https://github.com/backstage/backstage/pulls) and [Issues](https://github.com/backstage/backstage/issues) as well as help on the [Backstage Discord Server](https://discord.com/invite/MUpMjP2)
- Owner of the Backstage [DevTools](https://github.com/backstage/backstage/tree/master/plugins/devtools) plugin in the Backstage repository
- Maintainer in the Backstage [Documentation Project Area](https://github.com/backstage/backstage/blob/master/OWNERS.md#documentation) and [Documentation Special Interest Group (SIG)](https://github.com/backstage/community/tree/main/sigs/sig-docs)
- Maintainer in the Backstage [Community Plugins Project Area](https://github.com/backstage/backstage/blob/master/OWNERS.md#community-plugins) and help review [Pull Requests](https://github.com/backstage/community-plugins/pulls) and [Issues](https://github.com/backstage/community-plugins/issues)
- Owner of the Backstage [Azure DevOps](https://github.com/backstage/community-plugins/tree/main/workspaces/azure-devops) and [Linguist](https://github.com/backstage/community-plugins/tree/main/workspaces/linguist) plugins in the Backstage Community Plugins repository
- Supporting Maintainer of the Backstage [Demo site](https://demo.backstage.io/) and its [repository](https://github.com/backstage/demo)
- Supporting Maintainer of the [`mkdocs-techdocs-core plugin`](https://github.com/backstage/mkdocs-techdocs-core) where I help review [Pull Requests](https://github.com/backstage/mkdocs-techdocs-core/pulls) and [Issues](https://github.com/backstage/mkdocs-techdocs-core/issues)

### Backstage Discord

As I mentioned above I'm often on the Backstage Discord Sever helping answer questions. 

- **Office hours:** 6:30-7:30 CST Tuesdays and Thursdays
- **Dedicated PR/Issue Reviews:** 12:00-15:00 CST on Fridays

## Offline

When I'm offline you can catch me at the local dog park with my Frenchton Bailey 🐶
