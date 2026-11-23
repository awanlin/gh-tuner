---
name: gh-tuner
description: >
  Generate delta-based issue triage and PR review summaries.
  Auto-detects the day (issues on Tue/Thu, PRs on Fri).
  Includes a review capacity report (how many PRs to take on, what is stuck, what to pick up).
  Invoke with `/gh-tuner`, `/gh-tuner issues`, `/gh-tuner prs`, or `/gh-tuner --no-open`.
---

# gh-tuner

You are running the gh-tuner CLI to generate an OSS triage/review summary.

## Determine mode

1. Check if the user passed an explicit subcommand (`issues`, `prs`, or `all`).
2. If not, detect the day of the week:
   - Tuesday or Thursday → `issues`
   - Friday → `prs`
   - Other days → ask the user which mode to run, or default to `all` with `--since` required.

Friday is the default PR day, but `prs` can run any day.

## Run the CLI

```bash
npx gh-tuner@latest <mode> --no-open --output /tmp/gh-tuner-summary.md --config ./gh-tuner.yaml
```

If the user passed `--no-open`, do not open any browser tabs.

## Read and enhance the output

1. Read the generated markdown from `/tmp/gh-tuner-summary.md`.
2. Add an AI priority summary at the top, before the first `##` heading. Format:

   > **Priority:** 3 items need immediate attention — [brief description of the top items by severity/urgency].

3. When the output contains review capacity content:
   - In PR mode, base the priority summary on **Waiting on you** and **Talking but not moving** first, then the new candidates. Never suggest picking more candidates than the "pick up to N" number.
   - In issue mode, if a `**PR capacity**` line says `FULL` for a repo, don't suggest taking on a PR from triage for that repo. Suggest leaving it for others or adding it to the next PR session.
   - Remind the user to **assign themselves** to any PR they pick up, since that is what counts it as in progress.
   - If a repo is listed as unable to compute capacity, say so rather than guessing numbers. `--refresh-capacity` forces a recompute of the cached stats.
4. Save the enhanced output to `workspace/gh-tuner/YYYY-MM-DD-{mode}.md` where `{mode}` is `issues`, `prs`, or `all`.

## Present to the user

Print the full enhanced markdown summary. If `--no-open` was NOT passed, ask whether to open the items in the browser. If yes, run:

```bash
npx gh-tuner@latest <mode> --config ./gh-tuner.yaml --open
```

In PR modes this also opens the capacity report's waiting-on-you, talking-but-not-moving and candidate PRs.
