import type { GitHubItem } from './github.js';
import type { FilterConfig } from './config.js';

const KNOWN_BOTS = new Set([
  'github-actions',
  'backstage-service',
  'copilot-pull-request-reviewer',
]);

export function isBot(author: string): boolean {
  if (author.endsWith('[bot]')) return true;
  return KNOWN_BOTS.has(author);
}

export function hasHumanEngagement(item: GitHubItem, since: string): boolean {
  const sinceDate = new Date(since);
  return item.comments.some(
    c => !isBot(c.author) && new Date(c.createdAt) > sinceDate,
  );
}

export function isAwaitingOthers(item: GitHubItem, user: string): boolean {
  const humanComments = item.comments.filter(c => !isBot(c.author));
  if (humanComments.length === 0) return false;
  const last = humanComments[humanComments.length - 1];
  return last.author === user;
}

export function hasSecurityKeyword(item: GitHubItem, keywords: string[]): boolean {
  const text = `${item.title} ${item.comments.map(c => c.body).join(' ')}`.toLowerCase();
  return keywords.some(kw => text.includes(kw.toLowerCase()));
}

export interface FilterResult {
  items: GitHubItem[];
  security: GitHubItem[];
  excludedAwaiting: number;
  excludedSystem: number;
}

export function applyFilters(
  items: GitHubItem[],
  opts: {
    since: string;
    user: string;
    filters: FilterConfig;
    securityKeywords: string[];
  },
): FilterResult {
  const security: GitHubItem[] = [];
  const kept: GitHubItem[] = [];
  let excludedAwaiting = 0;
  let excludedSystem = 0;

  for (const item of items) {
    const isSecurity = hasSecurityKeyword(item, opts.securityKeywords);
    if (isSecurity) {
      security.push(item);
    }

    const isNew = new Date(item.createdAt) > new Date(opts.since);

    if (isNew) {
      if (!isSecurity) kept.push(item);
      continue;
    }

    if (opts.filters.humanEngagementOnly && !hasHumanEngagement(item, opts.since)) {
      excludedSystem++;
      continue;
    }

    if (opts.filters.excludeAwaitingOthers && isAwaitingOthers(item, opts.user)) {
      excludedAwaiting++;
      continue;
    }

    if (!isSecurity) kept.push(item);
  }

  return { items: kept, security, excludedAwaiting, excludedSystem };
}
