// test/capacity-stats.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../src/capacity/data.js', async (orig) => ({
  ...(await orig<typeof import('../src/capacity/data.js')>()),
  searchCount: vi.fn(),
  searchCapacityPrs: vi.fn(),
}));
import { searchCount, searchCapacityPrs } from '../src/capacity/data.js';
import { computeRepoStats, isFresh, configKey } from '../src/capacity/stats.js';
import type { CapacityConfig } from '../src/config.js';

const cap: CapacityConfig = {
  model: 'gap',
  ownersSection: 'Community Plugins',
  stretch: 1.25,
  paceMultiplier: 1.2,
  inProgressMultiplier: 1.5,
  staleDays: 14,
  inflowWeeks: 12,
  paceWeeks: 52,
  codeownersTeam: '@backstage/community-plugins-maintainers',
};
const NOW = new Date('2026-11-22T00:00:00Z');
const mk = (n: number, author: string, files: string[], reviewers: string[]) => ({
  number: n,
  title: '',
  url: '',
  createdAt: '',
  state: 'OPEN',
  isDraft: false,
  author,
  authorIsBot: false,
  labels: [],
  assignees: [],
  files,
  reviews: reviewers.map((r) => ({
    author: r,
    state: 'COMMENTED',
    submittedAt: '',
  })),
  comments: [],
  lastCommitAt: null,
  assignedAt: {},
});

beforeEach(() => {
  vi.mocked(searchCount).mockReset();
  vi.mocked(searchCapacityPrs).mockReset();
});

describe('computeRepoStats', () => {
  it('computes incoming, pace and pool for gap model', () => {
    vi.mocked(searchCount).mockReturnValueOnce(240).mockReturnValueOnce(208);
    vi.mocked(searchCapacityPrs).mockReturnValue([
      mk(1, 'x', ['workspaces/tr/a'], ['bob', 'me']), // ownerless, others=1
      mk(2, 'y', ['.github/ci.yml'], []), // repo
      mk(3, 'z', ['workspaces/ling/a'], ['bob', 'carol']), // mine, others=2
      mk(4, 'w', ['workspaces/owned/a'], ['bob']), // owned → excluded
      mk(5, 'bob', ['workspaces/tr/a'], []), // maintainer-authored → excluded
    ]);
    const s = computeRepoStats({
      repo: 'o/r',
      cap,
      user: 'me',
      maintainers: ['me', 'bob', 'carol'],
      codeowners: { ownerless: new Set(['tr']), mine: new Set(['ling']) },
      now: NOW,
    })!;
    expect(s.inflowPerWeek).toBeCloseTo(20);
    expect(s.pacePerWeek).toBeCloseTo(4);
    expect(s.pool).toEqual({
      sharedPerWeek: 2 / 12,
      ownPerWeek: 1 / 12,
      totalPerWeek: 3 / 12,
      othersRatePerWeek: 3 / 12,
    });
  });
  it('returns null if any query fails', () => {
    vi.mocked(searchCount).mockReturnValueOnce(null);
    expect(
      computeRepoStats({
        repo: 'o/r',
        cap: { ...cap, model: 'fair-share' },
        user: 'me',
        maintainers: ['me'],
        now: NOW,
      }),
    ).toBeNull();
  });
});

describe('isFresh', () => {
  const key = configKey(cap, ['me', 'bob']);
  const s = {
    computedAt: '2026-11-20T00:00:00Z',
    configKey: key,
    inflowPerWeek: 1,
    pacePerWeek: 1,
  };
  it('fresh within 7 days with same key', () => expect(isFresh(s, key, NOW)).toBe(true));
  it('stale after 7 days', () =>
    expect(isFresh({ ...s, computedAt: '2026-11-14T00:00:00Z' }, key, NOW)).toBe(false));
  it('stale when config or maintainers change', () =>
    expect(isFresh(s, configKey(cap, ['me']), NOW)).toBe(false));
  it('future computedAt is not fresh', () =>
    expect(isFresh({ ...s, computedAt: '2026-11-23T00:00:00Z' }, key, NOW)).toBe(false));
  it('missing is not fresh', () => expect(isFresh(undefined, key, NOW)).toBe(false));
});
