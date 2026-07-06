import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import chalk from 'chalk';
import { loadConfig } from './config.js';
import { getScheduleForDay, resolveSince, isRepoIncluded } from './schedule.js';
import { fetchIssues, fetchPrs, fetchComments, type GitHubItem } from './github.js';
import { applyFilters, hasSecurityKeyword } from './filters.js';
import { generateMarkdown, formatAge, type SummaryInput, type AreaStat } from './output.js';
import { openItems } from './browser.js';
import type { TunerConfig, RepoConfig } from './config.js';

type Mode = 'issues' | 'prs' | 'all';

interface RunOpts {
  config: string;
  since?: string;
  output?: string;
  open: boolean;
  openAll?: boolean;
}

async function run(mode: Mode, opts: RunOpts): Promise<void> {
  const cfg = loadConfig(opts.config);
  const today = new Date();

  let sinceDate: Date;
  if (opts.since) {
    sinceDate = new Date(opts.since);
  } else {
    const entry = getScheduleForDay(cfg.schedule, today);
    if (!entry) {
      console.error(chalk.red(
        `No schedule entry for ${today.toLocaleDateString('en-US', { weekday: 'long' })}. Use --since to specify a date.`,
      ));
      process.exit(1);
    }
    sinceDate = resolveSince(entry.since, today);
  }

  const sinceStr = sinceDate.toISOString().slice(0, 10);
  console.log(chalk.blue(`GH-Tuner — ${mode} mode`));
  console.log(chalk.blue(`Since: ${sinceStr}`));

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
  let totalExcludedAwaiting = 0;
  let totalExcludedSystem = 0;

  for (const repo of includedRepos) {
    console.log(chalk.gray(`  Fetching ${repo.name}...`));

    let items: GitHubItem[] = [];

    if (mode === 'issues' || mode === 'all') {
      items.push(...fetchIssues(repo.name, sinceStr));
    }
    if (mode === 'prs' || mode === 'all') {
      items.push(...fetchPrs(repo.name, sinceStr));
    }

    if (repo.scope === 'filtered' && repo.labels) {
      items = items.filter(item =>
        item.labels.some(l => repo.labels!.includes(l)) ||
        item.author === cfg.user ||
        item.labels.includes(`involves:${cfg.user}`),
      );
    }

    for (const item of items) {
      item.comments = fetchComments(repo.name, item.number);
    }

    const newItems = items.filter(i => new Date(i.createdAt) > sinceDate);
    const updatedItems = items.filter(i => new Date(i.createdAt) <= sinceDate);

    for (const item of newItems) {
      if (hasSecurityKeyword(item, cfg.securityKeywords)) {
        allSecurity.push(item);
      }
    }

    allNewItems.push(...newItems);

    const filtered = applyFilters(updatedItems, {
      since: sinceStr,
      user: cfg.user,
      filters: cfg.filters,
      securityKeywords: cfg.securityKeywords,
    });

    allUpdatedItems.push(...filtered.items);
    allSecurity.push(...filtered.security);
    totalExcludedAwaiting += filtered.excludedAwaiting;
    totalExcludedSystem += filtered.excludedSystem;
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
    excludedAwaiting: totalExcludedAwaiting,
    excludedSystem: totalExcludedSystem,
    areaStats,
  };

  const markdown = generateMarkdown(summaryInput);

  if (opts.output) {
    writeFileSync(opts.output, markdown);
    console.log(chalk.green(`Summary written to ${opts.output}`));
  } else {
    console.log(markdown);
  }

  if (opts.open) {
    const allItems = [...allSecurity, ...allNewItems, ...allUpdatedItems];
    const unique = [...new Map(allItems.map(i => [i.url, i])).values()];
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
    const areaItems = allItems.filter(i => i.labels.includes(area));
    if (areaItems.length === 0) continue;

    const issues = areaItems.filter(i => !i.isPr);
    const prs = areaItems.filter(i => i.isPr);
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
    .option('--since <date>', 'Override delta window start (ISO date)')
    .option('--output <path>', 'Write markdown to file')
    .option('--no-open', 'Skip opening items in browser')
    .option('--open-all', 'Override the >50 item cap');
}

const program = new Command();

program
  .name('gh-tuner')
  .description('Delta-based issue triage and PR review summaries for OSS maintainers')
  .version('0.1.0');

addCommonOptions(program.command('issues').description('Generate issue triage summary'))
  .action(async (opts) => run('issues', opts));

addCommonOptions(program.command('prs').description('Generate PR review checklist'))
  .action(async (opts) => run('prs', opts));

addCommonOptions(program.command('all').description('Generate both issue and PR summaries'))
  .action(async (opts) => run('all', opts));

program.parse();
