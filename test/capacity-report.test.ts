// test/capacity-report.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
vi.mock('../src/capacity/data.js', async (orig) => ({
  ...(await orig<typeof import('../src/capacity/data.js')>()),
  fetchRawFile: vi.fn(),
  searchCapacityPrs: vi.fn(),
  searchCount: vi.fn(),
}));
import { fetchRawFile, searchCapacityPrs, searchCount } from '../src/capacity/data.js';
import { buildCapacityReport, rankCandidates } from '../src/capacity/report.js';

const NOW = new Date('2026-11-22T12:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const OWNERS = `## Core Maintainers\n| a | [me](https://github.com/me) |\n| b | [bob](https://github.com/bob) |\n## Next\n`;
const pr = (n: number, over: object = {}) => ({
  number: n,
  title: `PR ${n}`,
  url: `https://github.com/o/r/pull/${n}`,
  createdAt: ago(n),
  state: 'OPEN',
  isDraft: false,
  author: 'alice',
  authorIsBot: false,
  labels: [],
  assignees: [],
  files: ['src/a.ts'],
  reviews: [],
  comments: [],
  lastCommitAt: ago(n),
  assignedAt: {},
  ...over,
});
const repo = {
  name: 'o/r',
  scope: 'all' as const,
  labels: ['area:docs'],
  capacity: {
    model: 'fair-share' as const,
    ownersSection: 'Core Maintainers',
    stretch: 1.25,
    paceMultiplier: 1.2,
    inProgressMultiplier: 2,
    staleDays: 14,
    inflowWeeks: 12,
    paceWeeks: 52,
  },
};

beforeEach(() => {
  vi.mocked(fetchRawFile).mockReturnValue(OWNERS);
  vi.mocked(searchCount).mockReturnValueOnce(120).mockReturnValueOnce(260); // 10/wk incoming, 5/wk pace
});

describe('buildCapacityReport', () => {
  it('computes weekly/limit/allowed and filters candidates', () => {
    vi.mocked(searchCapacityPrs)
      .mockReturnValueOnce([
        pr(1, { assignees: ['me'], assignedAt: { me: ago(2) } }),
        pr(2, { assignees: ['me'], isDraft: true }),
      ]) // in progress
      .mockReturnValueOnce([
        pr(1, { assignedAt: { me: ago(2) } }),
        pr(9, { assignedAt: { me: ago(10) } }),
      ]) // last 7d
      .mockReturnValueOnce([pr(3)]) // reviewed, unassigned
      .mockReturnValueOnce([
        pr(4, { author: 'bob' }),
        pr(5, { labels: ['area:docs'] }),
        pr(6),
        pr(7, { authorIsBot: true }),
      ]); // candidates
    const r = buildCapacityReport({
      repo,
      user: 'me',
      now: NOW,
      statePath: join(mkdtempSync(join(tmpdir(), 't-')), 's.json'),
      refresh: true,
      withCandidates: true,
    })!;
    // fair 10/2×1.25 = 6.25, cap 5×1.2 = 6 → 6; limit 12
    expect(r.weekly).toBe(6);
    expect(r.limit).toBe(12);
    expect(r.activeCount).toBe(1); // draft parked
    expect(r.pickedUp7d).toBe(1); // #9 assigned 10d ago doesn't count
    expect(r.allowed).toBe(5);
    expect(r.unassignedReviewed.map((p) => p.number)).toEqual([3]);
    expect(r.candidates.map((p) => p.number)).toEqual([5, 6]); // maintainer + bot removed, label first
  });
  it('excludes PRs the user already reviewed from candidates', () => {
    vi.mocked(searchCapacityPrs)
      .mockReset()
      .mockReturnValueOnce([]) // in progress
      .mockReturnValueOnce([]) // last 7d
      .mockReturnValueOnce([pr(3)]) // reviewed, unassigned
      .mockReturnValueOnce([pr(3), pr(4)]); // candidates
    const r = buildCapacityReport({
      repo,
      user: 'me',
      now: NOW,
      statePath: join(mkdtempSync(join(tmpdir(), 't-')), 's.json'),
      refresh: true,
      withCandidates: true,
    })!;
    expect(r.unassignedReviewed.map((p) => p.number)).toEqual([3]);
    expect(r.candidates.map((p) => p.number)).toEqual([4]);
  });
  it('candidate search excludes PRs reviewed by the user', () => {
    vi.mocked(searchCapacityPrs)
      .mockReset()
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);
    buildCapacityReport({
      repo,
      user: 'me',
      now: NOW,
      statePath: join(mkdtempSync(join(tmpdir(), 't-')), 's.json'),
      refresh: true,
      withCandidates: true,
    });
    const queries = vi.mocked(searchCapacityPrs).mock.calls.map((c) => c[0]);
    const candidateQuery = queries.find((q) => q.includes('no:assignee'));
    expect(candidateQuery).toContain('-reviewed-by:me');
  });
  it('returns null when in-progress fetch fails', () => {
    vi.mocked(searchCapacityPrs).mockReturnValue(null);
    expect(
      buildCapacityReport({
        repo,
        user: 'me',
        now: NOW,
        statePath: join(mkdtempSync(join(tmpdir(), 't-')), 's.json'),
        refresh: true,
        withCandidates: false,
      }),
    ).toBeNull();
  });
});

describe('rankCandidates', () => {
  it('labelled first, then oldest first', () => {
    const out = rankCandidates([pr(1), pr(5), pr(3, { labels: ['x'] })] as never, ['x']);
    expect(out.map((p) => p.number)).toEqual([3, 5, 1]);
  });
});
