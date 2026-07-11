import { describe, it, expect } from 'vitest';
import {
  isBot,
  hasHumanEngagement,
  isAwaitingOthers,
  hasChangesRequestedByOthers,
  isUnrepliedMention,
  hasSecurityKeyword,
  applyFilters,
} from '../src/filters.js';
import type { GitHubItem } from '../src/github.js';

function makeItem(overrides: Partial<GitHubItem> = {}): GitHubItem {
  return {
    number: 1,
    title: 'Test issue',
    url: 'https://github.com/org/repo/issues/1',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-05T00:00:00Z',
    labels: [],
    author: 'someuser',
    state: 'open',
    isPr: false,
    isDraft: false,
    reviews: [],
    comments: [],
    ...overrides,
  };
}

describe('isBot', () => {
  it('detects [bot] suffix', () => {
    expect(isBot('dependabot[bot]')).toBe(true);
    expect(isBot('github-actions[bot]')).toBe(true);
  });

  it('detects known bot logins', () => {
    expect(isBot('github-actions')).toBe(true);
    expect(isBot('backstage-service')).toBe(true);
    expect(isBot('copilot-pull-request-reviewer')).toBe(true);
  });

  it('does not flag regular users', () => {
    expect(isBot('awanlin')).toBe(false);
    expect(isBot('somecontributor')).toBe(false);
  });
});

describe('hasHumanEngagement', () => {
  it('returns true when a human commented after since', () => {
    const item = makeItem({
      comments: [{ author: 'humanuser', createdAt: '2026-07-04T10:00:00Z', body: 'Looks good' }],
    });
    expect(hasHumanEngagement(item, '2026-07-03')).toBe(true);
  });

  it('returns false when only bots commented after since', () => {
    const item = makeItem({
      comments: [
        { author: 'github-actions[bot]', createdAt: '2026-07-04T10:00:00Z', body: 'CI passed' },
      ],
    });
    expect(hasHumanEngagement(item, '2026-07-03')).toBe(false);
  });

  it('returns false when human comments are before since', () => {
    const item = makeItem({
      comments: [{ author: 'humanuser', createdAt: '2026-07-01T10:00:00Z', body: 'Old comment' }],
    });
    expect(hasHumanEngagement(item, '2026-07-03')).toBe(false);
  });
});

describe('isAwaitingOthers', () => {
  it('returns true when user is the last human commenter', () => {
    const item = makeItem({
      comments: [
        { author: 'reporter', createdAt: '2026-07-01T10:00:00Z', body: 'Bug report' },
        { author: 'awanlin', createdAt: '2026-07-02T10:00:00Z', body: 'Can you share logs?' },
      ],
    });
    expect(isAwaitingOthers(item, 'awanlin')).toBe(true);
  });

  it('returns false when someone else commented after user', () => {
    const item = makeItem({
      comments: [
        { author: 'awanlin', createdAt: '2026-07-02T10:00:00Z', body: 'Can you share logs?' },
        { author: 'reporter', createdAt: '2026-07-03T10:00:00Z', body: 'Here are the logs' },
      ],
    });
    expect(isAwaitingOthers(item, 'awanlin')).toBe(false);
  });

  it('ignores bot comments when finding last human commenter', () => {
    const item = makeItem({
      comments: [
        { author: 'awanlin', createdAt: '2026-07-02T10:00:00Z', body: 'Looking into it' },
        { author: 'github-actions[bot]', createdAt: '2026-07-03T10:00:00Z', body: 'Stale' },
      ],
    });
    expect(isAwaitingOthers(item, 'awanlin')).toBe(true);
  });
});

describe('isUnrepliedMention', () => {
  it('returns true when user has not commented since the date', () => {
    const item = makeItem({
      comments: [
        { author: 'someone', createdAt: '2026-07-05T10:00:00Z', body: '@awanlin thoughts?' },
      ],
    });
    expect(isUnrepliedMention(item, 'awanlin', '2026-07-03')).toBe(true);
  });

  it('returns false when user has commented since the date', () => {
    const item = makeItem({
      comments: [
        { author: 'someone', createdAt: '2026-07-04T10:00:00Z', body: '@awanlin thoughts?' },
        { author: 'awanlin', createdAt: '2026-07-05T10:00:00Z', body: 'Looking into it' },
      ],
    });
    expect(isUnrepliedMention(item, 'awanlin', '2026-07-03')).toBe(false);
  });

  it('returns true when user commented before since but not after', () => {
    const item = makeItem({
      comments: [
        { author: 'awanlin', createdAt: '2026-07-01T10:00:00Z', body: 'Old reply' },
        { author: 'someone', createdAt: '2026-07-05T10:00:00Z', body: '@awanlin any update?' },
      ],
    });
    expect(isUnrepliedMention(item, 'awanlin', '2026-07-03')).toBe(true);
  });

  it('returns true when there are no comments at all', () => {
    const item = makeItem({ comments: [] });
    expect(isUnrepliedMention(item, 'awanlin', '2026-07-03')).toBe(true);
  });
});

describe('hasSecurityKeyword', () => {
  it('matches keywords in title', () => {
    const item = makeItem({ title: 'CVE-2026-1234 in dependency X' });
    expect(hasSecurityKeyword(item, ['CVE', 'security'])).toBe(true);
  });

  it('matches keywords case-insensitively', () => {
    const item = makeItem({ title: 'Security vulnerability found' });
    expect(hasSecurityKeyword(item, ['security'])).toBe(true);
  });

  it('returns false when no keywords match', () => {
    const item = makeItem({ title: 'Add pagination support' });
    expect(hasSecurityKeyword(item, ['CVE', 'security'])).toBe(false);
  });
});

describe('hasChangesRequestedByOthers', () => {
  it('returns true when a human has requested changes', () => {
    const item = makeItem({
      author: 'contributor',
      isPr: true,
      reviews: [{ author: 'reviewer1', state: 'CHANGES_REQUESTED' }],
    });
    expect(hasChangesRequestedByOthers(item, 'awanlin')).toBe(true);
  });

  it('returns false when a human has only approved', () => {
    const item = makeItem({
      author: 'contributor',
      isPr: true,
      reviews: [{ author: 'reviewer1', state: 'APPROVED' }],
    });
    expect(hasChangesRequestedByOthers(item, 'awanlin')).toBe(false);
  });

  it('returns false when a human has only commented', () => {
    const item = makeItem({
      author: 'contributor',
      isPr: true,
      reviews: [{ author: 'reviewer1', state: 'COMMENTED' }],
    });
    expect(hasChangesRequestedByOthers(item, 'awanlin')).toBe(false);
  });

  it('returns false when only bots have requested changes', () => {
    const item = makeItem({
      author: 'contributor',
      isPr: true,
      reviews: [{ author: 'copilot-pull-request-reviewer', state: 'CHANGES_REQUESTED' }],
    });
    expect(hasChangesRequestedByOthers(item, 'awanlin')).toBe(false);
  });

  it('returns false when the PR author requested changes on their own PR', () => {
    const item = makeItem({
      author: 'contributor',
      isPr: true,
      reviews: [{ author: 'contributor', state: 'CHANGES_REQUESTED' }],
    });
    expect(hasChangesRequestedByOthers(item, 'awanlin')).toBe(false);
  });

  it('returns false when only the configured user requested changes', () => {
    const item = makeItem({
      author: 'contributor',
      isPr: true,
      reviews: [{ author: 'awanlin', state: 'CHANGES_REQUESTED' }],
    });
    expect(hasChangesRequestedByOthers(item, 'awanlin')).toBe(false);
  });

  it('returns false when there are no reviews', () => {
    const item = makeItem({ author: 'contributor', isPr: true, reviews: [] });
    expect(hasChangesRequestedByOthers(item, 'awanlin')).toBe(false);
  });

  it('returns true when mixed reviews include a qualifying changes request', () => {
    const item = makeItem({
      author: 'contributor',
      isPr: true,
      reviews: [
        { author: 'copilot-pull-request-reviewer', state: 'COMMENTED' },
        { author: 'awanlin', state: 'APPROVED' },
        { author: 'other-maintainer', state: 'CHANGES_REQUESTED' },
      ],
    });
    expect(hasChangesRequestedByOthers(item, 'awanlin')).toBe(true);
  });
});

describe('applyFilters', () => {
  it('separates security items and filters system-only updates', () => {
    const newItem = makeItem({
      number: 1,
      title: 'New issue',
      createdAt: '2026-07-04T00:00:00Z',
    });
    const securityItem = makeItem({
      number: 2,
      title: 'CVE in core',
      createdAt: '2026-07-04T00:00:00Z',
    });
    const systemOnlyItem = makeItem({
      number: 3,
      title: 'Old issue',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-07-04T00:00:00Z',
      comments: [
        { author: 'github-actions[bot]', createdAt: '2026-07-04T10:00:00Z', body: 'Stale' },
      ],
    });

    const result = applyFilters([newItem, securityItem, systemOnlyItem], {
      since: '2026-07-03',
      user: 'awanlin',
      filters: {
        humanEngagementOnly: true,
        excludeAwaitingOthers: true,
        excludeAuthor: true,
        excludeDrafts: true,
        excludeChangesRequestedByOthers: true,
      },
      securityKeywords: ['CVE'],
    });

    expect(result.security).toHaveLength(1);
    expect(result.security[0].number).toBe(2);
    expect(result.excludedSystem).toHaveLength(1);
    expect(result.excludedSystem[0].number).toBe(3);
  });
});
