import { describe, it, expect } from 'vitest';
import { formatAge, generateMarkdown } from '../src/output.js';
import type { GitHubItem } from '../src/github.js';
import type { SummaryInput } from '../src/output.js';

describe('formatAge', () => {
  const now = new Date('2026-07-10T12:00:00Z');

  it('formats days for <7 days', () => {
    expect(formatAge('2026-07-08T00:00:00Z', now)).toBe('2d old');
  });

  it('formats weeks for 1-8 weeks', () => {
    expect(formatAge('2026-06-19T00:00:00Z', now)).toBe('3w old');
  });

  it('formats months for >8 weeks', () => {
    expect(formatAge('2026-04-10T00:00:00Z', now)).toBe('3mo old');
  });

  it('handles same day', () => {
    expect(formatAge('2026-07-10T00:00:00Z', now)).toBe('0d old');
  });
});

describe('generateMarkdown', () => {
  function makeItem(overrides: Partial<GitHubItem> = {}): GitHubItem {
    return {
      number: 1,
      title: 'Test issue',
      url: 'https://github.com/org/repo/issues/1',
      createdAt: '2026-07-08T00:00:00Z',
      updatedAt: '2026-07-09T00:00:00Z',
      labels: ['area:search'],
      author: 'someone',
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

  function makeItems(count: number): GitHubItem[] {
    return Array.from({ length: count }, (_, i) =>
      makeItem({ number: i + 100, url: `https://github.com/org/repo/issues/${i + 100}` }),
    );
  }

  it('generates a valid markdown summary with header', () => {
    const input: SummaryInput = {
      mode: 'issues',
      generatedDate: new Date('2026-07-08'),
      sinceDate: new Date('2026-07-03'),
      reposScanned: 5,
      reposSkipped: 2,
      newItems: [
        makeItem({
          number: 10,
          title: 'New bug',
          url: 'https://github.com/backstage/backstage/issues/10',
        }),
      ],
      updatedItems: [],
      security: [],
      reReview: [],
      excludedAwaiting: makeItems(3),
      excludedSystem: makeItems(7),
      excludedAuthor: [],
      excludedDrafts: [],
      excludedChangesRequested: [],
      excludedAssigned: [],
      mentioned: [],
      showExcluded: false,
      areaStats: [{ area: 'area:search', openIssues: 5, openPrs: 2, oldest: '31d' }],
      failedRepos: [],
    };

    const md = generateMarkdown(input);
    expect(md).toContain('# gh-tuner — Issue Triage Summary');
    expect(md).toContain('**Generated:**');
    expect(md).toContain('**Delta since:**');
    expect(md).toContain('5 (2 skipped');
    expect(md).toContain('- [ ]');
    expect(md).toContain('3 issues excluded (awaiting others)');
    expect(md).toContain('7 system-only updates filtered');
    expect(md).toContain('## Area Stats');
  });

  it('uses PR title when mode is prs', () => {
    const input: SummaryInput = {
      mode: 'prs',
      generatedDate: new Date('2026-07-11'),
      sinceDate: new Date('2026-07-04'),
      reposScanned: 7,
      reposSkipped: 0,
      newItems: [],
      updatedItems: [],
      security: [],
      reReview: [],
      excludedAwaiting: [],
      excludedSystem: [],
      excludedAuthor: [],
      excludedDrafts: [],
      excludedChangesRequested: [],
      excludedAssigned: [],
      mentioned: [],
      showExcluded: false,
      areaStats: [],
      failedRepos: [],
    };

    const md = generateMarkdown(input);
    expect(md).toContain('# gh-tuner — PR Review Summary');
  });

  it('sorts items oldest-first', () => {
    const older = makeItem({
      number: 1,
      createdAt: '2026-06-01T00:00:00Z',
      url: 'https://github.com/org/repo/issues/1',
    });
    const newer = makeItem({
      number: 2,
      createdAt: '2026-07-07T00:00:00Z',
      url: 'https://github.com/org/repo/issues/2',
    });

    const input: SummaryInput = {
      mode: 'issues',
      generatedDate: new Date('2026-07-08'),
      sinceDate: new Date('2026-07-03'),
      reposScanned: 1,
      reposSkipped: 0,
      newItems: [newer, older],
      updatedItems: [],
      security: [],
      reReview: [],
      excludedAwaiting: [],
      excludedSystem: [],
      excludedAuthor: [],
      excludedDrafts: [],
      excludedChangesRequested: [],
      excludedAssigned: [],
      mentioned: [],
      showExcluded: false,
      areaStats: [],
      failedRepos: [],
    };

    const md = generateMarkdown(input);
    const pos1 = md.indexOf('#1');
    const pos2 = md.indexOf('#2');
    expect(pos1).toBeLessThan(pos2);
  });

  it('renders failed repos warning when present', () => {
    const input: SummaryInput = {
      mode: 'prs',
      generatedDate: new Date('2026-07-11'),
      sinceDate: new Date('2026-07-04'),
      reposScanned: 5,
      reposSkipped: 0,
      newItems: [],
      updatedItems: [],
      security: [],
      reReview: [],
      excludedAwaiting: [],
      excludedSystem: [],
      excludedAuthor: [],
      excludedDrafts: [],
      excludedChangesRequested: [],
      excludedAssigned: [],
      mentioned: [],
      showExcluded: false,
      areaStats: [],
      failedRepos: [
        { name: 'backstage/backstage', mode: 'PRs' },
        { name: 'backstage/community-plugins', mode: 'issues' },
      ],
    };

    const md = generateMarkdown(input);
    expect(md).toContain('⚠ Failed to fetch');
    expect(md).toContain('backstage/backstage (PRs)');
    expect(md).toContain('backstage/community-plugins (issues)');
  });

  it('shows own items excluded in footer when excludedAuthor is non-empty', () => {
    const input: SummaryInput = {
      mode: 'prs',
      generatedDate: new Date('2026-07-11'),
      sinceDate: new Date('2026-07-04'),
      reposScanned: 5,
      reposSkipped: 0,
      newItems: [],
      updatedItems: [],
      security: [],
      reReview: [],
      excludedAwaiting: makeItems(2),
      excludedSystem: makeItems(1),
      excludedAuthor: makeItems(4),
      excludedDrafts: [],
      excludedChangesRequested: [],
      excludedAssigned: [],
      mentioned: [],
      showExcluded: false,
      areaStats: [],
      failedRepos: [],
    };

    const md = generateMarkdown(input);
    expect(md).toContain('4 own PRs excluded');
  });

  it('omits own items from footer when excludedAuthor is empty', () => {
    const input: SummaryInput = {
      mode: 'issues',
      generatedDate: new Date('2026-07-08'),
      sinceDate: new Date('2026-07-03'),
      reposScanned: 3,
      reposSkipped: 0,
      newItems: [],
      updatedItems: [],
      security: [],
      reReview: [],
      excludedAwaiting: [],
      excludedSystem: [],
      excludedAuthor: [],
      excludedDrafts: [],
      excludedChangesRequested: [],
      excludedAssigned: [],
      mentioned: [],
      showExcluded: false,
      areaStats: [],
      failedRepos: [],
    };

    const md = generateMarkdown(input);
    expect(md).not.toContain('own issues excluded');
  });

  it('shows drafts excluded in footer when excludedDrafts is non-empty', () => {
    const input: SummaryInput = {
      mode: 'prs',
      generatedDate: new Date('2026-07-11'),
      sinceDate: new Date('2026-07-04'),
      reposScanned: 5,
      reposSkipped: 0,
      newItems: [],
      updatedItems: [],
      security: [],
      reReview: [],
      excludedAwaiting: [],
      excludedSystem: [],
      excludedAuthor: [],
      excludedDrafts: makeItems(3),
      excludedChangesRequested: [],
      excludedAssigned: [],
      mentioned: [],
      showExcluded: false,
      areaStats: [],
      failedRepos: [],
    };

    const md = generateMarkdown(input);
    expect(md).toContain('3 drafts excluded');
  });

  it('renders mentioned section when there are pending mentions', () => {
    const mentionedItem = makeItem({
      number: 99,
      title: 'Need your input on search',
      url: 'https://github.com/backstage/backstage/issues/99',
      comments: [
        { author: 'someone', createdAt: '2026-07-09T10:00:00Z', body: '@awanlin thoughts?' },
      ],
    });

    const input: SummaryInput = {
      mode: 'issues',
      generatedDate: new Date('2026-07-11'),
      sinceDate: new Date('2026-07-04'),
      reposScanned: 5,
      reposSkipped: 0,
      newItems: [],
      updatedItems: [],
      security: [],
      reReview: [],
      excludedAwaiting: [],
      excludedSystem: [],
      excludedAuthor: [],
      excludedDrafts: [],
      excludedChangesRequested: [],
      excludedAssigned: [],
      mentioned: [mentionedItem],
      showExcluded: false,
      areaStats: [],
      failedRepos: [],
    };

    const md = generateMarkdown(input);
    expect(md).toContain('## Mentioned — Awaiting Reply (1)');
    expect(md).toContain('#99');
    expect(md).toContain('Need your input on search');
  });

  it('omits mentioned section when empty', () => {
    const input: SummaryInput = {
      mode: 'prs',
      generatedDate: new Date('2026-07-11'),
      sinceDate: new Date('2026-07-04'),
      reposScanned: 5,
      reposSkipped: 0,
      newItems: [],
      updatedItems: [],
      security: [],
      reReview: [],
      excludedAwaiting: [],
      excludedSystem: [],
      excludedAuthor: [],
      excludedDrafts: [],
      excludedChangesRequested: [],
      excludedAssigned: [],
      mentioned: [],
      showExcluded: false,
      areaStats: [],
      failedRepos: [],
    };

    const md = generateMarkdown(input);
    expect(md).not.toContain('Mentioned');
  });

  it('omits failed repos warning when none failed', () => {
    const input: SummaryInput = {
      mode: 'issues',
      generatedDate: new Date('2026-07-08'),
      sinceDate: new Date('2026-07-03'),
      reposScanned: 3,
      reposSkipped: 0,
      newItems: [],
      updatedItems: [],
      security: [],
      reReview: [],
      excludedAwaiting: [],
      excludedSystem: [],
      excludedAuthor: [],
      excludedDrafts: [],
      excludedChangesRequested: [],
      excludedAssigned: [],
      mentioned: [],
      showExcluded: false,
      areaStats: [],
      failedRepos: [],
    };

    const md = generateMarkdown(input);
    expect(md).not.toContain('Failed to fetch');
  });

  it('renders excluded items section when showExcluded is true', () => {
    const ownPr = makeItem({
      number: 50,
      title: 'My own PR',
      url: 'https://github.com/org/repo/pull/50',
      isPr: true,
    });
    const draftPr = makeItem({
      number: 51,
      title: 'WIP: draft feature',
      url: 'https://github.com/org/repo/pull/51',
      isPr: true,
      isDraft: true,
    });
    const awaitingItem = makeItem({
      number: 52,
      title: 'Waiting on reporter',
      url: 'https://github.com/org/repo/issues/52',
    });

    const input: SummaryInput = {
      mode: 'all',
      generatedDate: new Date('2026-07-11'),
      sinceDate: new Date('2026-07-04'),
      reposScanned: 5,
      reposSkipped: 0,
      newItems: [],
      updatedItems: [],
      security: [],
      reReview: [],
      excludedAwaiting: [awaitingItem],
      excludedSystem: [],
      excludedAuthor: [ownPr],
      excludedDrafts: [draftPr],
      excludedChangesRequested: [],
      excludedAssigned: [],
      mentioned: [],
      showExcluded: true,
      areaStats: [],
      failedRepos: [],
    };

    const md = generateMarkdown(input);
    expect(md).toContain('## Excluded Items');
    expect(md).toContain('### Authored by you (1)');
    expect(md).toContain('#50');
    expect(md).toContain('My own PR');
    expect(md).toContain('### Draft PRs (1)');
    expect(md).toContain('#51');
    expect(md).toContain('### Awaiting others (1)');
    expect(md).toContain('#52');
    expect(md).not.toContain('### System-only updates');
  });

  it('omits excluded items section when showExcluded is false', () => {
    const input: SummaryInput = {
      mode: 'prs',
      generatedDate: new Date('2026-07-11'),
      sinceDate: new Date('2026-07-04'),
      reposScanned: 5,
      reposSkipped: 0,
      newItems: [],
      updatedItems: [],
      security: [],
      reReview: [],
      excludedAwaiting: makeItems(3),
      excludedSystem: makeItems(2),
      excludedAuthor: makeItems(1),
      excludedDrafts: [],
      excludedChangesRequested: [],
      excludedAssigned: [],
      mentioned: [],
      showExcluded: false,
      areaStats: [],
      failedRepos: [],
    };

    const md = generateMarkdown(input);
    expect(md).not.toContain('## Excluded Items');
  });
});
