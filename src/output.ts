import type { GitHubItem } from './github.js';

export interface AreaStat {
  area: string;
  openIssues: number;
  openPrs: number;
  oldest: string;
}

export interface FailedRepo {
  name: string;
  mode: string;
}

export interface SummaryInput {
  mode: 'issues' | 'prs' | 'all';
  generatedDate: Date;
  sinceDate: Date;
  reposScanned: number;
  reposSkipped: number;
  newItems: GitHubItem[];
  updatedItems: GitHubItem[];
  security: GitHubItem[];
  excludedAwaiting: GitHubItem[];
  excludedSystem: GitHubItem[];
  excludedAuthor: GitHubItem[];
  excludedDrafts: GitHubItem[];
  excludedChangesRequested: GitHubItem[];
  showExcluded: boolean;
  areaStats: AreaStat[];
  failedRepos: FailedRepo[];
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatAge(createdAt: string, now: Date = new Date()): string {
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 7) return `${diffDays}d old`;
  if (diffDays < 56) return `${Math.floor(diffDays / 7)}w old`;
  return `${Math.floor(diffDays / 30)}mo old`;
}

function formatDate(date: Date): string {
  return `${date.toISOString().slice(0, 10)} (${DAYS_OF_WEEK[date.getUTCDay()]})`;
}

function repoFromUrl(url: string): string {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)\//);
  return match ? match[1] : 'unknown';
}

function groupByRepo(items: GitHubItem[]): Map<string, GitHubItem[]> {
  const map = new Map<string, GitHubItem[]>();
  for (const item of items) {
    const repo = repoFromUrl(item.url);
    if (!map.has(repo)) map.set(repo, []);
    map.get(repo)!.push(item);
  }
  for (const group of map.values()) {
    group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  return map;
}

function formatItem(item: GitHubItem, now: Date): string {
  const age = formatAge(item.createdAt, now);
  const labels = item.labels.length > 0 ? ` ${item.labels.map((l) => `\`${l}\``).join(' ')}` : '';
  const commentCount = item.comments.length;
  const extras: string[] = [age];
  if (commentCount > 0) {
    extras.push(`${commentCount} comment${commentCount > 1 ? 's' : ''}`);
  }
  return `- [ ] [#${item.number}](${item.url}) — ${item.title}${labels} (${extras.join(', ')})`;
}

function renderSection(title: string, items: GitHubItem[], now: Date): string {
  if (items.length === 0) return '';

  const grouped = groupByRepo(items);
  const lines: string[] = [`## ${title} (${items.length})`, ''];

  for (const [repo, repoItems] of grouped) {
    lines.push(`### ${repo} (${repoItems.length})`);
    for (const item of repoItems) {
      lines.push(formatItem(item, now));
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function generateMarkdown(input: SummaryInput): string {
  const modeLabel =
    input.mode === 'prs' ? 'PR Review' : input.mode === 'all' ? 'Full' : 'Issue Triage';
  const itemLabel = input.mode === 'prs' ? 'PRs' : input.mode === 'all' ? 'items' : 'issues';
  const lines: string[] = [];

  lines.push(`# gh-tuner — ${modeLabel} Summary`);
  lines.push(`**Generated:** ${formatDate(input.generatedDate)}`);
  lines.push(`**Delta since:** ${formatDate(input.sinceDate)}`);
  lines.push(
    `**Repos scanned:** ${input.reposScanned} (${input.reposSkipped} skipped — biweekly/monthly not due)`,
  );
  lines.push('');

  if (input.security.length > 0) {
    lines.push('## Security');
    for (const item of input.security) {
      lines.push(formatItem(item, input.generatedDate));
    }
    lines.push('');
  }

  const newLabel =
    input.mode === 'prs' ? 'New PRs' : input.mode === 'all' ? 'New Items' : 'New Issues';
  const newSection = renderSection(newLabel, input.newItems, input.generatedDate);
  if (newSection) lines.push(newSection);

  const updatedLabel =
    input.mode === 'prs'
      ? 'Updated PRs — Human Engagement'
      : input.mode === 'all'
        ? 'Updated Items — Human Engagement'
        : 'Updated Issues — Human Engagement';
  const updatedSection = renderSection(updatedLabel, input.updatedItems, input.generatedDate);
  if (updatedSection) lines.push(updatedSection);

  lines.push('---');
  const footerParts = [
    `${input.excludedAwaiting.length} ${itemLabel} excluded (awaiting others)`,
    `${input.excludedSystem.length} system-only updates filtered`,
  ];
  if (input.excludedAuthor.length > 0) {
    footerParts.push(`${input.excludedAuthor.length} own ${itemLabel} excluded`);
  }
  if (input.excludedDrafts.length > 0) {
    footerParts.push(`${input.excludedDrafts.length} drafts excluded`);
  }
  if (input.excludedChangesRequested.length > 0) {
    footerParts.push(`${input.excludedChangesRequested.length} changes requested`);
  }
  lines.push(`*${footerParts.join(' · ')}*`);

  if (input.failedRepos.length > 0) {
    const failures = input.failedRepos.map((r) => `${r.name} (${r.mode})`).join(', ');
    lines.push('');
    lines.push(`> **⚠ Failed to fetch:** ${failures}`);
  }

  lines.push('');

  if (input.areaStats.length > 0) {
    lines.push('## Area Stats');
    lines.push('| Area | Open Issues | Open PRs | Oldest |');
    lines.push('|------|-------------|----------|--------|');
    for (const stat of input.areaStats) {
      lines.push(`| ${stat.area} | ${stat.openIssues} | ${stat.openPrs} | ${stat.oldest} |`);
    }
    lines.push('');
  }

  if (input.showExcluded) {
    lines.push(renderExcludedSection(input));
  }

  return lines.join('\n');
}

function renderExcludedSection(input: SummaryInput): string {
  const sections: { label: string; items: GitHubItem[] }[] = [
    { label: 'Authored by you', items: input.excludedAuthor },
    { label: 'Draft PRs', items: input.excludedDrafts },
    { label: 'Changes requested', items: input.excludedChangesRequested },
    { label: 'Awaiting others', items: input.excludedAwaiting },
    { label: 'System-only updates', items: input.excludedSystem },
  ];

  const nonEmpty = sections.filter((s) => s.items.length > 0);
  if (nonEmpty.length === 0) return '';

  const lines: string[] = ['## Excluded Items', ''];
  for (const section of nonEmpty) {
    lines.push(`### ${section.label} (${section.items.length})`);
    for (const item of section.items) {
      lines.push(`- [#${item.number}](${item.url}) — ${item.title}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
