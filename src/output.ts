import type { GitHubItem } from './github.js';
import type { CapacityReport, ClassifiedPr } from './capacity/report.js';
import type { CapacityPr } from './capacity/stale.js';

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
  reReview: GitHubItem[];
  excludedAwaiting: GitHubItem[];
  excludedSystem: GitHubItem[];
  excludedAuthor: GitHubItem[];
  excludedDrafts: GitHubItem[];
  excludedChangesRequested: GitHubItem[];
  excludedAssigned: GitHubItem[];
  mentioned: GitHubItem[];
  pinged: GitHubItem[];
  showExcluded: boolean;
  areaStats: AreaStat[];
  failedRepos: FailedRepo[];
  capacity?: CapacityReport[];
  capacityFailed?: string[];
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

function formatTimestamp(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC (${DAYS_OF_WEEK[date.getUTCDay()]})`;
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

export function renderCapacityLine(reports: CapacityReport[]): string {
  const parts = reports.map((r) =>
    r.allowed === 0
      ? `${r.repo}: ${r.activeCount}/${r.limit} FULL`
      : `${r.repo}: ${r.activeCount}/${r.limit} in progress, ${r.allowed} left this week`,
  );
  return `**PR capacity** — ${parts.join(' · ')}`;
}

function capItem(pr: CapacityPr, note: string, now: Date, box = true): string {
  const labels = pr.labels.length ? ` ${pr.labels.map((l) => `\`${l}\``).join(' ')}` : '';
  return `- ${box ? '[ ] ' : ''}[#${pr.number}](${pr.url}) — ${pr.title}${labels} (${note || formatAge(pr.createdAt, now)})`;
}

export function renderCapacitySections(r: CapacityReport, now: Date): string {
  const L: string[] = [
    `## PR Capacity — ${r.repo}`,
    `**${r.weekly}/wk · up to ${r.limit} in progress** · ${r.activeCount} active · ${r.pickedUp7d} picked up in last 7d · **${r.allowed} new allowed**`,
    `<sub>${r.explain}</sub>`,
    '',
  ];
  const group = (status: ClassifiedPr['status'], title: string) => {
    const xs = r.inProgress.filter((c) => c.status === status);
    if (!xs.length) return;
    L.push(`### ${title} (${xs.length})`, ...xs.map((c) => capItem(c.pr, c.reason, now)), '');
  };
  group('waiting-on-you', 'Waiting on you');
  group('approved', 'Approved — awaiting merge');
  group('talking-not-moving', 'Talking but not moving');
  group('waiting-on-author', 'Waiting on author');
  if (r.unassignedReviewed.length) {
    L.push(
      `### Reviewed but not assigned (${r.unassignedReviewed.length}) — assign yourself or let go`,
      ...r.unassignedReviewed.map((p) => capItem(p, '', now)),
      '',
    );
  }
  if (r.candidates.length) {
    L.push(
      `### New candidates — pick up to ${r.allowed} (${r.candidates.length})`,
      ...r.candidates.map((p) => capItem(p, '', now)),
    );
    L.push('');
  }
  const parked = r.inProgress.filter((c) => c.status === 'parked');
  if (parked.length) {
    L.push(
      `<details><summary>Parked (${parked.length})</summary>`,
      '',
      ...parked.map((c) => capItem(c.pr, c.reason, now, false)),
      '</details>',
      '',
    );
  }
  return L.join('\n');
}

export function generateMarkdown(input: SummaryInput): string {
  const modeLabel =
    input.mode === 'prs' ? 'PR Review' : input.mode === 'all' ? 'Full' : 'Issue Triage';
  const itemLabel = input.mode === 'prs' ? 'PRs' : input.mode === 'all' ? 'items' : 'issues';
  const lines: string[] = [];

  lines.push(`# gh-tuner — ${modeLabel} Summary`);
  lines.push(`**Generated:** ${formatDate(input.generatedDate)}`);
  lines.push(`**Delta since:** ${formatTimestamp(input.sinceDate)}`);
  lines.push(
    `**Repos scanned:** ${input.reposScanned} (${input.reposSkipped} skipped — biweekly/monthly not due)`,
  );
  if (input.mode === 'issues' && input.capacity?.length) {
    lines.push(renderCapacityLine(input.capacity));
  }
  if (input.capacityFailed?.length) {
    lines.push(`> **⚠ Capacity unavailable:** ${input.capacityFailed.join(', ')}`);
  }
  lines.push('');

  if (input.mode !== 'issues') {
    for (const r of input.capacity ?? [])
      lines.push(renderCapacitySections(r, input.generatedDate));
  }

  if (input.security.length > 0) {
    lines.push('## Security');
    for (const item of input.security) {
      lines.push(formatItem(item, input.generatedDate));
    }
    lines.push('');
  }

  const reReviewSection = renderSection(
    'Needs Re-Review — Changes Addressed',
    input.reReview,
    input.generatedDate,
  );
  if (reReviewSection) lines.push(reReviewSection);

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

  const mentionedSection = renderSection(
    'Mentioned — Awaiting Reply',
    input.mentioned,
    input.generatedDate,
  );
  if (mentionedSection) lines.push(mentionedSection);

  if (input.pinged.length > 0) {
    lines.push(
      `<details><summary>Pinged — not involved (${input.pinged.length})</summary>`,
      '',
      ...input.pinged.map((i) => {
        const labels = i.labels.length ? ` ${i.labels.map((l) => `\`${l}\``).join(' ')}` : '';
        return `- [#${i.number}](${i.url}) — ${i.title}${labels} (${formatAge(i.createdAt, input.generatedDate)})`;
      }),
      '</details>',
      '',
    );
  }

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
  if (input.excludedAssigned.length > 0) {
    footerParts.push(`${input.excludedAssigned.length} already assigned`);
  }
  if (input.pinged.length > 0) {
    footerParts.push(`${input.pinged.length} pings (not involved)`);
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
    { label: 'Already assigned', items: input.excludedAssigned },
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
