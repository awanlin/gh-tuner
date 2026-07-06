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
      state: 'open',
      isPr: false,
      comments: [],
      ...overrides,
    };
  }

  it('generates a valid markdown summary with header', () => {
    const input: SummaryInput = {
      mode: 'issues',
      generatedDate: new Date('2026-07-08'),
      sinceDate: new Date('2026-07-03'),
      reposScanned: 5,
      reposSkipped: 2,
      newItems: [makeItem({ number: 10, title: 'New bug', url: 'https://github.com/backstage/backstage/issues/10' })],
      updatedItems: [],
      security: [],
      excludedAwaiting: 3,
      excludedSystem: 7,
      areaStats: [{ area: 'area:search', openIssues: 5, openPrs: 2, oldest: '31d' }],
    };

    const md = generateMarkdown(input);
    expect(md).toContain('# Tuner — Issue Triage Summary');
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
      excludedAwaiting: 0,
      excludedSystem: 0,
      areaStats: [],
    };

    const md = generateMarkdown(input);
    expect(md).toContain('# Tuner — PR Review Summary');
  });

  it('sorts items oldest-first', () => {
    const older = makeItem({ number: 1, createdAt: '2026-06-01T00:00:00Z', url: 'https://github.com/org/repo/issues/1' });
    const newer = makeItem({ number: 2, createdAt: '2026-07-07T00:00:00Z', url: 'https://github.com/org/repo/issues/2' });

    const input: SummaryInput = {
      mode: 'issues',
      generatedDate: new Date('2026-07-08'),
      sinceDate: new Date('2026-07-03'),
      reposScanned: 1,
      reposSkipped: 0,
      newItems: [newer, older],
      updatedItems: [],
      security: [],
      excludedAwaiting: 0,
      excludedSystem: 0,
      areaStats: [],
    };

    const md = generateMarkdown(input);
    const pos1 = md.indexOf('#1');
    const pos2 = md.indexOf('#2');
    expect(pos1).toBeLessThan(pos2);
  });
});
