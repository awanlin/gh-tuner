---
name: gh-tuner
description: >
  Generate delta-based issue triage and PR review summaries.
  Auto-detects the day (issues on Tue/Thu, PRs on Fri).
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

## Run the CLI

```bash
npx gh-tuner@latest <mode> --no-open --output /tmp/gh-tuner-summary.md --config ./gh-tuner.yaml
```

If the user passed `--no-open`, do not open any browser tabs.

## Read and enhance the output

1. Read the generated markdown from `/tmp/gh-tuner-summary.md`.
2. Add an AI priority summary at the top, before the first `##` heading. Format:

   > **Priority:** 3 items need immediate attention — [brief description of the top items by severity/urgency].

3. Save the enhanced output to `workspace/gh-tuner/YYYY-MM-DD-{mode}.md` where `{mode}` is `issues`, `prs`, or `all`.

## Present to the user

Print the full enhanced markdown summary. If `--no-open` was NOT passed, ask whether to open the items in the browser. If yes, run:

```bash
npx gh-tuner@latest <mode> --config ./gh-tuner.yaml --open
```
