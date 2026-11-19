import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'));
import { loadConfig, getScope } from './config.js';
import { getScheduleForDay, resolveSince, isRepoIncluded } from './schedule.js';
import {
  fetchIssues,
  fetchPrs,
  fetchMentionedIssues,
  fetchMentionedPrs,
  fetchComments,
  lastExecFailed,
  type GitHubItem,
} from './github.js';
import {
  applyFilters,
  hasChangesRequestedByOthers,
  isUnrepliedMention,
  isAwaitingOthers,
} from './filters.js';
import { loadState, saveState, statePathFor, resolveSavedSince, selectSince } from './state.js';
import {
  generateMarkdown,
  formatAge,
  type SummaryInput,
  type AreaStat,
  type FailedRepo,
} from './output.js';
import { openItems } from './browser.js';
import type { TunerConfig, RepoConfig } from './config.js';

type Mode = 'issues' | 'prs' | 'all';

interface RunOpts {
  config: string;
  since?: string;
  output?: string;
  open: boolean;
  openAll?: boolean;
  showExcluded?: boolean;
  saveState: boolean;
}

async function run(mode: Mode, opts: RunOpts): Promise<void> {
  const cfg = loadConfig(opts.config);
  const today = new Date();
  const statePath = statePathFor(opts.config);
  const savedSince = resolveSavedSince(loadState(statePath), mode);

  const { since: sinceDate, source: sinceSource } = selectSince(opts.since, savedSince, () => {
    const entry = getScheduleForDay(cfg.schedule, today);
    if (!entry) {
      console.error(
        chalk.red(
          `No schedule entry for ${today.toLocaleDateString('en-US', { weekday: 'long' })}. Use --since to specify a date.`,
        ),
      );
      process.exit(1);
    }
    return resolveSince(entry.since, today);
  });

  const sinceIso = sinceDate.toISOString();
  const sinceStr = sinceIso.slice(0, 10);
  console.log(chalk.blue(`gh-tuner — ${mode} mode`));
  console.log(chalk.blue(`Since: ${sinceIso} (from ${sinceSource})`));

  const includedRepos: RepoConfig[] = [];
  let skipped = 0;

  for (const repo of cfg.repos) {
    if (isRepoIncluded(repo, cfg.startDate, today)) {
      includedRepos.push(repo);
    } else {
      skipped++;
    }
  }

  console.log(chalk.blue(`Repos: ${includedRepos.length} included, ${skipped} skipped`));

  const allNewItems: GitHubItem[] = [];
  const allUpdatedItems: GitHubItem[] = [];
  const allSecurity: GitHubItem[] = [];
  const failedRepos: FailedRepo[] = [];
  const allExcludedAwaiting: GitHubItem[] = [];
  const allExcludedSystem: GitHubItem[] = [];
  const allExcludedAuthor: GitHubItem[] = [];
  const allExcludedDrafts: GitHubItem[] = [];
  const allExcludedChangesRequested: GitHubItem[] = [];
  const allReReview: GitHubItem[] = [];
  const allExcludedAssigned: GitHubItem[] = [];

  for (const repo of includedRepos) {
    console.log(chalk.gray(`  Fetching ${repo.name}...`));

    let items: GitHubItem[] = [];

    if (mode === 'issues' || mode === 'all') {
      items.push(...fetchIssues(repo.name, sinceStr));
      if (lastExecFailed()) {
        failedRepos.push({ name: repo.name, mode: 'issues' });
      }
    }
    if (mode === 'prs' || mode === 'all') {
      items.push(...fetchPrs(repo.name, sinceStr));
      if (lastExecFailed()) {
        failedRepos.push({ name: repo.name, mode: 'PRs' });
      }
    }

    if (repo.labels) {
      items = items.filter((item) => {
        if (getScope(repo, item.isPr ? 'prs' : 'issues') !== 'filtered') return true;
        return (
          item.labels.some((l) => repo.labels!.includes(l)) ||
          item.author === cfg.user ||
          item.labels.includes(`involves:${cfg.user}`)
        );
      });
    }

    if (cfg.filters.excludeAuthor) {
      items = items.filter((item) => {
        if (item.author === cfg.user) {
          allExcludedAuthor.push(item);
          return false;
        }
        return true;
      });
    }

    if (cfg.filters.excludeDrafts) {
      items = items.filter((item) => {
        if (item.isDraft) {
          allExcludedDrafts.push(item);
          return false;
        }
        return true;
      });
    }

    if (cfg.filters.excludeChangesRequestedByOthers) {
      items = items.filter((item) => {
        if (item.isPr && hasChangesRequestedByOthers(item, cfg.user)) {
          allExcludedChangesRequested.push(item);
          return false;
        }
        return true;
      });
    }

    if (cfg.filters.excludeAssigned) {
      items = items.filter((item) => {
        const assignedToOthers = item.assignees.some((a) => a !== cfg.user);
        if (assignedToOthers) {
          allExcludedAssigned.push(item);
          return false;
        }
        return true;
      });
    }

    // GitHub search is date-granular; drop items not touched since the exact timestamp.
    items = items.filter((item) => new Date(item.updatedAt) > sinceDate);

    for (const item of items) {
      item.comments = fetchComments(repo.name, item.number);
    }

    const filtered = applyFilters(items, {
      since: sinceIso,
      user: cfg.user,
      filters: cfg.filters,
      securityKeywords: cfg.securityKeywords,
    });

    allNewItems.push(...filtered.newItems);
    allUpdatedItems.push(...filtered.items);
    allSecurity.push(...filtered.security);
    allReReview.push(...filtered.reReview);
    allExcludedAwaiting.push(...filtered.excludedAwaiting);
    allExcludedSystem.push(...filtered.excludedSystem);
  }

  const allMentioned: GitHubItem[] = [];
  const seenUrls = new Set(
    [
      ...allNewItems,
      ...allUpdatedItems,
      ...allSecurity,
      ...allReReview,
      ...allExcludedAwaiting,
      ...allExcludedSystem,
      ...allExcludedAuthor,
      ...allExcludedDrafts,
      ...allExcludedChangesRequested,
    ].map((i) => i.url),
  );

  for (const repo of includedRepos) {
    let mentioned: GitHubItem[] = [];

    if (mode === 'issues' || mode === 'all') {
      mentioned.push(...fetchMentionedIssues(repo.name, sinceStr, cfg.user));
    }
    if (mode === 'prs' || mode === 'all') {
      mentioned.push(...fetchMentionedPrs(repo.name, sinceStr, cfg.user));
    }

    mentioned = mentioned.filter((i) => !seenUrls.has(i.url) && new Date(i.updatedAt) > sinceDate);

    for (const item of mentioned) {
      item.comments = fetchComments(repo.name, item.number);
    }

    for (const item of mentioned) {
      if (!isUnrepliedMention(item, cfg.user, sinceIso)) continue;
      if (cfg.filters.excludeAwaitingOthers && isAwaitingOthers(item, cfg.user)) {
        allExcludedAwaiting.push(item);
        continue;
      }
      allMentioned.push(item);
    }
  }

  const areaStats = computeAreaStats(cfg, allNewItems, allUpdatedItems, allSecurity, today);

  const summaryInput: SummaryInput = {
    mode,
    generatedDate: today,
    sinceDate,
    reposScanned: includedRepos.length,
    reposSkipped: skipped,
    newItems: allNewItems,
    updatedItems: allUpdatedItems,
    security: allSecurity,
    reReview: allReReview,
    excludedAwaiting: allExcludedAwaiting,
    excludedSystem: allExcludedSystem,
    excludedAuthor: allExcludedAuthor,
    excludedDrafts: allExcludedDrafts,
    excludedChangesRequested: allExcludedChangesRequested,
    excludedAssigned: allExcludedAssigned,
    mentioned: allMentioned,
    showExcluded: opts.showExcluded ?? false,
    areaStats,
    failedRepos,
  };

  const markdown = generateMarkdown(summaryInput);

  if (opts.output) {
    writeFileSync(opts.output, markdown);
    console.log(chalk.green(`Summary written to ${opts.output}`));
  } else {
    console.log(markdown);
  }

  if (!opts.saveState) {
    console.log(chalk.gray('State not saved (--no-save-state)'));
  } else if (failedRepos.length > 0) {
    console.log(chalk.yellow('State not saved: some repos failed to fetch'));
  } else {
    saveState(statePath, mode, today);
  }

  if (opts.open) {
    const allItems = [...allSecurity, ...allReReview, ...allNewItems, ...allUpdatedItems];
    const unique = [...new Map(allItems.map((i) => [i.url, i])).values()];
    await openItems(unique, { openAll: opts.openAll });
  }
}

function computeAreaStats(
  cfg: TunerConfig,
  newItems: GitHubItem[],
  updatedItems: GitHubItem[],
  security: GitHubItem[],
  now: Date,
): AreaStat[] {
  const allItems = [...newItems, ...updatedItems, ...security];
  const allLabels = new Set<string>();

  for (const repo of cfg.repos) {
    if (repo.labels) {
      for (const label of repo.labels) {
        allLabels.add(label);
      }
    }
  }

  const stats: AreaStat[] = [];

  for (const area of allLabels) {
    const areaItems = allItems.filter((i) => i.labels.includes(area));
    if (areaItems.length === 0) continue;

    const issues = areaItems.filter((i) => !i.isPr);
    const prs = areaItems.filter((i) => i.isPr);
    const oldest = areaItems.reduce((prev, curr) =>
      new Date(prev.createdAt) < new Date(curr.createdAt) ? prev : curr,
    );

    stats.push({
      area,
      openIssues: issues.length,
      openPrs: prs.length,
      oldest: formatAge(oldest.createdAt, now),
    });
  }

  return stats.sort((a, b) => a.area.localeCompare(b.area));
}

function addCommonOptions(cmd: Command): Command {
  return cmd
    .option('--config <path>', 'Path to config file', './gh-tuner.yaml')
    .option('--since <date>', 'Override delta window start (ISO date or timestamp)')
    .option('--no-save-state', 'Do not record this run as the start of the next delta')
    .option('--output <path>', 'Write markdown to file')
    .option('--no-open', 'Skip opening items in browser')
    .option('--open-all', 'Override the >50 item cap')
    .option('--show-excluded', 'List items removed by filters');
}

const program = new Command();

program
  .name('gh-tuner')
  .description('Delta-based issue triage and PR review summaries for OSS maintainers')
  .version(pkg.version);

addCommonOptions(program.command('issues').description('Generate issue triage summary')).action(
  async (opts) => run('issues', opts),
);

addCommonOptions(program.command('prs').description('Generate PR review checklist')).action(
  async (opts) => run('prs', opts),
);

addCommonOptions(program.command('all').description('Generate both issue and PR summaries')).action(
  async (opts) => run('all', opts),
);

program.parse();
