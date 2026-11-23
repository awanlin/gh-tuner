import { describe, it, expect } from 'vitest';
import {
  isBot,
  hasHumanEngagement,
  isAwaitingOthers,
  hasChangesRequestedByOthers,
  needsReReview,
  isUnrepliedMention,
  hasSecurityKeyword,
  applyFilters,
  isInvolved,
  classifyMentions,
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
    assignees: [],
    state: 'open',
    isPr: false,
    isDraft: false,
    headRefOid: '',
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

  it('returns true when user commented but was mentioned again after', () => {
    const item = makeItem({
      comments: [
        { author: 'someone', createdAt: '2026-07-04T10:00:00Z', body: '@awanlin thoughts?' },
        { author: 'awanlin', createdAt: '2026-07-05T10:00:00Z', body: 'Looking into it' },
        { author: 'someone', createdAt: '2026-07-06T10:00:00Z', body: '@awanlin any update?' },
      ],
    });
    expect(isUnrepliedMention(item, 'awanlin', '2026-07-03')).toBe(true);
  });

  it('returns false when user replied after the latest mention', () => {
    const item = makeItem({
      comments: [
        { author: 'someone', createdAt: '2026-07-04T10:00:00Z', body: '@awanlin thoughts?' },
        { author: 'someone', createdAt: '2026-07-05T10:00:00Z', body: '@awanlin ping' },
        { author: 'awanlin', createdAt: '2026-07-06T10:00:00Z', body: 'Done' },
      ],
    });
    expect(isUnrepliedMention(item, 'awanlin', '2026-07-03')).toBe(false);
  });

  it('returns false when activity after user comment does not mention them', () => {
    const item = makeItem({
      comments: [
        { author: 'someone', createdAt: '2026-07-04T10:00:00Z', body: '@awanlin thoughts?' },
        { author: 'awanlin', createdAt: '2026-07-05T10:00:00Z', body: 'Looking into it' },
        { author: 'someone', createdAt: '2026-07-06T10:00:00Z', body: 'Thanks, will test' },
      ],
    });
    expect(isUnrepliedMention(item, 'awanlin', '2026-07-03')).toBe(false);
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

describe('needsReReview', () => {
  it('returns true when user requested changes and PR head has moved', () => {
    const item = makeItem({
      isPr: true,
      headRefOid: 'new-commit-sha',
      reviews: [{ author: 'awanlin', state: 'CHANGES_REQUESTED', commitOid: 'old-commit-sha' }],
    });
    expect(needsReReview(item, 'awanlin')).toBe(true);
  });

  it('returns false when PR head has not moved since the review', () => {
    const item = makeItem({
      isPr: true,
      headRefOid: 'same-sha',
      reviews: [{ author: 'awanlin', state: 'CHANGES_REQUESTED', commitOid: 'same-sha' }],
    });
    expect(needsReReview(item, 'awanlin')).toBe(false);
  });

  it('returns false when changes were requested by someone else', () => {
    const item = makeItem({
      isPr: true,
      headRefOid: 'new-commit-sha',
      reviews: [{ author: 'other-reviewer', state: 'CHANGES_REQUESTED', commitOid: 'old-sha' }],
    });
    expect(needsReReview(item, 'awanlin')).toBe(false);
  });

  it('returns false for issues', () => {
    const item = makeItem({
      isPr: false,
      headRefOid: 'new-sha',
      reviews: [{ author: 'awanlin', state: 'CHANGES_REQUESTED', commitOid: 'old-sha' }],
    });
    expect(needsReReview(item, 'awanlin')).toBe(false);
  });

  it('returns false when review state is not CHANGES_REQUESTED', () => {
    const item = makeItem({
      isPr: true,
      headRefOid: 'new-sha',
      reviews: [{ author: 'awanlin', state: 'APPROVED', commitOid: 'old-sha' }],
    });
    expect(needsReReview(item, 'awanlin')).toBe(false);
  });

  it('returns false when commitOid is empty', () => {
    const item = makeItem({
      isPr: true,
      headRefOid: 'new-sha',
      reviews: [{ author: 'awanlin', state: 'CHANGES_REQUESTED', commitOid: '' }],
    });
    expect(needsReReview(item, 'awanlin')).toBe(false);
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
        excludeAssigned: false,
      },
      securityKeywords: ['CVE'],
    });

    expect(result.security).toHaveLength(1);
    expect(result.security[0].number).toBe(2);
    expect(result.excludedSystem).toHaveLength(1);
    expect(result.excludedSystem[0].number).toBe(3);
  });

  it('rescues awaiting-others PRs that need re-review', () => {
    const reReviewPr = makeItem({
      number: 10,
      title: 'PR needing re-review',
      createdAt: '2026-06-01T00:00:00Z',
      isPr: true,
      headRefOid: 'new-commit-sha',
      reviews: [{ author: 'awanlin', state: 'CHANGES_REQUESTED', commitOid: 'old-commit-sha' }],
      comments: [
        { author: 'contributor', createdAt: '2026-07-04T10:00:00Z', body: 'Initial submission' },
        { author: 'awanlin', createdAt: '2026-07-05T10:00:00Z', body: 'Please fix X' },
      ],
    });

    const result = applyFilters([reReviewPr], {
      since: '2026-07-03',
      user: 'awanlin',
      filters: {
        humanEngagementOnly: true,
        excludeAwaitingOthers: true,
        excludeAuthor: true,
        excludeDrafts: true,
        excludeChangesRequestedByOthers: true,
        excludeAssigned: false,
      },
      securityKeywords: [],
    });

    expect(result.reReview).toHaveLength(1);
    expect(result.reReview[0].number).toBe(10);
    expect(result.excludedAwaiting).toHaveLength(0);
  });

  it('excludes awaiting-others PRs when head has not moved', () => {
    const staleReviewPr = makeItem({
      number: 11,
      title: 'PR still awaiting changes',
      createdAt: '2026-06-01T00:00:00Z',
      isPr: true,
      headRefOid: 'same-sha',
      reviews: [{ author: 'awanlin', state: 'CHANGES_REQUESTED', commitOid: 'same-sha' }],
      comments: [
        { author: 'contributor', createdAt: '2026-07-04T10:00:00Z', body: 'Initial submission' },
        { author: 'awanlin', createdAt: '2026-07-05T10:00:00Z', body: 'Please fix X' },
      ],
    });

    const result = applyFilters([staleReviewPr], {
      since: '2026-07-03',
      user: 'awanlin',
      filters: {
        humanEngagementOnly: true,
        excludeAwaitingOthers: true,
        excludeAuthor: true,
        excludeDrafts: true,
        excludeChangesRequestedByOthers: true,
        excludeAssigned: false,
      },
      securityKeywords: [],
    });

    expect(result.reReview).toHaveLength(0);
    expect(result.excludedAwaiting).toHaveLength(1);
  });

  describe('excludeAwaitingOthers applies to every section', () => {
    const opts = {
      since: '2026-11-17T19:45:00Z',
      user: 'awanlin',
      filters: {
        humanEngagementOnly: true,
        excludeAwaitingOthers: true,
        excludeAuthor: true,
        excludeDrafts: true,
        excludeChangesRequestedByOthers: true,
        excludeAssigned: false,
      },
      securityKeywords: ['security'],
    };

    it('excludes an updated security item where the user commented last', () => {
      const item = makeItem({
        number: 34728,
        title: 'Storing tokens in localStorage is a security anti-pattern',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-11-18T00:00:00Z',
        comments: [
          { author: 'reporter', createdAt: '2026-10-01T00:00:00Z', body: 'Report' },
          { author: 'awanlin', createdAt: '2026-10-27T00:00:00Z', body: 'Thoughts' },
          { author: 'other', createdAt: '2026-11-18T00:00:00Z', body: 'Same here' },
          { author: 'awanlin', createdAt: '2026-11-18T12:00:00Z', body: 'Follow-up' },
          { author: 'github-actions', createdAt: '2026-11-18T13:00:00Z', body: 'bot' },
        ],
      });
      const result = applyFilters([item], opts);
      expect(result.security).toHaveLength(0);
      expect(result.excludedAwaiting.map((i) => i.number)).toEqual([34728]);
    });

    it('excludes a new security item where the user commented last', () => {
      const item = makeItem({
        number: 2,
        title: 'security problem',
        createdAt: '2026-11-18T00:00:00Z',
        comments: [{ author: 'awanlin', createdAt: '2026-11-18T01:00:00Z', body: 'Looking' }],
      });
      const result = applyFilters([item], opts);
      expect(result.security).toHaveLength(0);
      expect(result.newItems).toHaveLength(0);
      expect(result.excludedAwaiting).toHaveLength(1);
    });

    it('keeps a security item when someone else commented last', () => {
      const item = makeItem({
        number: 3,
        title: 'security problem',
        createdAt: '2026-10-01T00:00:00Z',
        comments: [
          { author: 'awanlin', createdAt: '2026-11-18T00:00:00Z', body: 'Question?' },
          { author: 'reporter', createdAt: '2026-11-18T05:00:00Z', body: 'Answer' },
        ],
      });
      const result = applyFilters([item], opts);
      expect(result.security.map((i) => i.number)).toEqual([3]);
      expect(result.excludedAwaiting).toHaveLength(0);
    });

    it('excludes a new item the user already replied to', () => {
      const item = makeItem({
        number: 36913,
        title: 'Bug in catalog',
        createdAt: '2026-11-18T00:39:00Z',
        comments: [
          { author: 'awanlin', createdAt: '2026-11-18T19:40:00Z', body: 'Fixed in #36924' },
        ],
      });
      const result = applyFilters([item], opts);
      expect(result.newItems).toHaveLength(0);
      expect(result.excludedAwaiting.map((i) => i.number)).toEqual([36913]);
    });

    it('keeps a new item with no comments', () => {
      const item = makeItem({ number: 4, createdAt: '2026-11-18T00:00:00Z' });
      const result = applyFilters([item], opts);
      expect(result.newItems.map((i) => i.number)).toEqual([4]);
    });

    it('excludes an updated item where the user commented last', () => {
      const item = makeItem({
        number: 5,
        createdAt: '2026-10-01T00:00:00Z',
        comments: [{ author: 'awanlin', createdAt: '2026-11-18T00:00:00Z', body: 'Ping' }],
      });
      const result = applyFilters([item], opts);
      expect(result.items).toHaveLength(0);
      expect(result.excludedAwaiting).toHaveLength(1);
    });

    it('treats the exact since timestamp as the new/updated boundary', () => {
      const before = makeItem({
        number: 6,
        createdAt: '2026-11-17T00:39:00Z',
        comments: [{ author: 'other', createdAt: '2026-11-18T00:00:00Z', body: 'Hi' }],
      });
      const after = makeItem({ number: 7, createdAt: '2026-11-17T20:00:00Z' });
      const result = applyFilters([before, after], opts);
      expect(result.newItems.map((i) => i.number)).toEqual([7]);
      expect(result.items.map((i) => i.number)).toEqual([6]);
    });
  });
});

describe('isInvolved', () => {
  const ping = { author: 'other', createdAt: '2026-07-04T00:00:00Z', body: '@me please look' };

  it('is true when the user is the author', () => {
    expect(isInvolved(makeItem({ author: 'me' }), 'me')).toBe(true);
  });

  it('is true when the user is an assignee', () => {
    expect(isInvolved(makeItem({ assignees: ['me'] }), 'me')).toBe(true);
  });

  it('is true when the user has reviewed', () => {
    const item = makeItem({
      reviews: [{ author: 'me', state: 'COMMENTED', commitOid: 'abc' }],
    });
    expect(isInvolved(item, 'me')).toBe(true);
  });

  it('is true when the user has commented at any time', () => {
    const item = makeItem({
      comments: [{ author: 'me', createdAt: '2025-01-01T00:00:00Z', body: 'old note' }, ping],
    });
    expect(isInvolved(item, 'me')).toBe(true);
  });

  it('is false when only others comment and mention the user', () => {
    expect(isInvolved(makeItem({ comments: [ping] }), 'me')).toBe(false);
  });
});

describe('classifyMentions', () => {
  const since = '2026-07-01T00:00:00Z';
  const ping = { author: 'other', createdAt: '2026-07-04T00:00:00Z', body: '@me please look' };
  const filters = {
    humanEngagementOnly: true,
    excludeAwaitingOthers: true,
    excludeAuthor: true,
    excludeDrafts: true,
    excludeChangesRequestedByOthers: true,
    excludeAssigned: true,
    mentionsRequireInvolvement: true,
  };

  it('excludes items assigned to another user when excludeAssigned is on', () => {
    const item = makeItem({ assignees: ['someone'], comments: [ping] });
    const r = classifyMentions([item], { since, user: 'me', filters });
    expect(r.excludedAssigned).toEqual([item]);
    expect(r.mentioned).toEqual([]);
    expect(r.pinged).toEqual([]);
  });

  it('keeps items assigned to someone else when excludeAssigned is off', () => {
    const item = makeItem({ assignees: ['someone'], comments: [ping] });
    const r = classifyMentions([item], {
      since,
      user: 'me',
      filters: { ...filters, excludeAssigned: false, mentionsRequireInvolvement: false },
    });
    expect(r.mentioned).toEqual([item]);
  });

  it('keeps items assigned to the user', () => {
    const item = makeItem({ assignees: ['me'], comments: [ping] });
    const r = classifyMentions([item], { since, user: 'me', filters });
    expect(r.mentioned).toEqual([item]);
  });

  it('sends not-involved mentions to pinged when the flag is on', () => {
    const item = makeItem({ comments: [ping] });
    const r = classifyMentions([item], { since, user: 'me', filters });
    expect(r.pinged).toEqual([item]);
    expect(r.mentioned).toEqual([]);
  });

  it('sends not-involved mentions to mentioned when the flag is off', () => {
    const item = makeItem({ comments: [ping] });
    const r = classifyMentions([item], {
      since,
      user: 'me',
      filters: { ...filters, mentionsRequireInvolvement: false },
    });
    expect(r.mentioned).toEqual([item]);
    expect(r.pinged).toEqual([]);
  });

  it('always sends involved mentions to mentioned', () => {
    const item = makeItem({
      isPr: true,
      reviews: [{ author: 'me', state: 'APPROVED', commitOid: 'abc' }],
      comments: [ping],
    });
    const r = classifyMentions([item], { since, user: 'me', filters });
    expect(r.mentioned).toEqual([item]);
  });

  it('drops mentions the user already replied to', () => {
    const item = makeItem({
      comments: [ping, { author: 'me', createdAt: '2026-07-05T00:00:00Z', body: 'done' }],
    });
    const r = classifyMentions([item], {
      since,
      user: 'me',
      filters: { ...filters, excludeAwaitingOthers: false },
    });
    expect(r.mentioned).toEqual([]);
    expect(r.pinged).toEqual([]);
  });

  it('routes awaiting-others mentions to excludedAwaiting', () => {
    const item = makeItem({
      comments: [
        { ...ping, createdAt: '2026-06-20T00:00:00Z' },
        { author: 'me', createdAt: '2026-06-25T00:00:00Z', body: 'over to you @other' },
      ],
    });
    const r = classifyMentions([item], { since, user: 'me', filters });
    expect(r.excludedAwaiting).toEqual([item]);
    expect(r.mentioned).toEqual([]);
  });
});
