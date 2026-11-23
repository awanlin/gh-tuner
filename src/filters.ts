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
  return item.comments.some((c) => !isBot(c.author) && new Date(c.createdAt) > sinceDate);
}

export function isAwaitingOthers(item: GitHubItem, user: string): boolean {
  const humanComments = item.comments.filter((c) => !isBot(c.author));
  if (humanComments.length === 0) return false;
  const last = humanComments[humanComments.length - 1];
  return last.author === user;
}

export function hasChangesRequestedByOthers(item: GitHubItem, user: string): boolean {
  return item.reviews.some(
    (r) =>
      r.state === 'CHANGES_REQUESTED' &&
      !isBot(r.author) &&
      r.author !== item.author &&
      r.author !== user,
  );
}

export function needsReReview(item: GitHubItem, user: string): boolean {
  if (!item.isPr || !item.headRefOid) return false;
  return item.reviews.some(
    (r) =>
      r.state === 'CHANGES_REQUESTED' &&
      r.author === user &&
      r.commitOid !== '' &&
      r.commitOid !== item.headRefOid,
  );
}

export function isUnrepliedMention(item: GitHubItem, user: string, since: string): boolean {
  const sinceDate = new Date(since);

  const userComments = item.comments.filter(
    (c) => c.author === user && new Date(c.createdAt) > sinceDate,
  );

  if (userComments.length === 0) return true;

  const lastUserDate = new Date(userComments[userComments.length - 1].createdAt);
  return item.comments.some(
    (c) => c.author !== user && new Date(c.createdAt) > lastUserDate && c.body.includes(`@${user}`),
  );
}

/**
 * True when the user has a stake in the item: author, assignee, reviewer, or
 * has commented on it at any time.
 */
export function isInvolved(item: GitHubItem, user: string): boolean {
  return (
    item.author === user ||
    item.assignees.includes(user) ||
    item.reviews.some((r) => r.author === user) ||
    item.comments.some((c) => c.author === user)
  );
}

export interface MentionResult {
  mentioned: GitHubItem[];
  pinged: GitHubItem[];
  excludedAwaiting: GitHubItem[];
  excludedAssigned: GitHubItem[];
}

/**
 * Sorts @-mention search hits. Items assigned to someone else are dropped when
 * `excludeAssigned` is on. With `mentionsRequireInvolvement`, mentions on items
 * the user is not involved in go to `pinged` (FYI) instead of `mentioned`.
 */
export function classifyMentions(
  items: GitHubItem[],
  opts: { since: string; user: string; filters: FilterConfig },
): MentionResult {
  const result: MentionResult = {
    mentioned: [],
    pinged: [],
    excludedAwaiting: [],
    excludedAssigned: [],
  };

  for (const item of items) {
    if (opts.filters.excludeAssigned && item.assignees.some((a) => a !== opts.user)) {
      result.excludedAssigned.push(item);
      continue;
    }
    if (!isUnrepliedMention(item, opts.user, opts.since)) continue;
    if (opts.filters.excludeAwaitingOthers && isAwaitingOthers(item, opts.user)) {
      result.excludedAwaiting.push(item);
      continue;
    }
    if (opts.filters.mentionsRequireInvolvement && !isInvolved(item, opts.user)) {
      result.pinged.push(item);
    } else {
      result.mentioned.push(item);
    }
  }

  return result;
}

export function hasSecurityKeyword(item: GitHubItem, keywords: string[]): boolean {
  const text = `${item.title} ${item.comments.map((c) => c.body).join(' ')}`.toLowerCase();
  return keywords.some((kw) => text.includes(kw.toLowerCase()));
}

export interface FilterResult {
  newItems: GitHubItem[];
  items: GitHubItem[];
  security: GitHubItem[];
  reReview: GitHubItem[];
  excludedAwaiting: GitHubItem[];
  excludedSystem: GitHubItem[];
}

/**
 * Sorts items into sections. Items created after `since` are "new"; the rest
 * are "updated". The awaiting-others check applies to every section (new,
 * updated and security) so items where the user made the last human comment
 * are left out wherever they would have been listed.
 */
export function applyFilters(
  items: GitHubItem[],
  opts: {
    since: string;
    user: string;
    filters: FilterConfig;
    securityKeywords: string[];
  },
): FilterResult {
  const newItems: GitHubItem[] = [];
  const security: GitHubItem[] = [];
  const kept: GitHubItem[] = [];
  const reReview: GitHubItem[] = [];
  const excludedAwaiting: GitHubItem[] = [];
  const excludedSystem: GitHubItem[] = [];
  const sinceDate = new Date(opts.since);

  for (const item of items) {
    const isNew = new Date(item.createdAt) > sinceDate;

    if (!isNew && opts.filters.humanEngagementOnly && !hasHumanEngagement(item, opts.since)) {
      excludedSystem.push(item);
      continue;
    }

    if (opts.filters.excludeAwaitingOthers && isAwaitingOthers(item, opts.user)) {
      if (needsReReview(item, opts.user)) {
        reReview.push(item);
      } else {
        excludedAwaiting.push(item);
      }
      continue;
    }

    const isSecurity = hasSecurityKeyword(item, opts.securityKeywords);
    if (isSecurity) security.push(item);

    if (isNew) {
      newItems.push(item);
    } else if (!isSecurity) {
      kept.push(item);
    }
  }

  return { newItems, items: kept, security, reReview, excludedAwaiting, excludedSystem };
}
