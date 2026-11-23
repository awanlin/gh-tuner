// test/capacity-stale.test.ts
import { describe, it, expect } from 'vitest';
import { classifyInProgress, isActive, type CapacityPr } from '../src/capacity/stale.js';

const NOW = new Date('2026-11-22T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const pr = (over: Partial<CapacityPr> = {}): CapacityPr => ({
  number: 1,
  title: 't',
  url: 'https://github.com/o/r/pull/1',
  createdAt: daysAgo(40),
  state: 'OPEN',
  isDraft: false,
  author: 'alice',
  authorIsBot: false,
  labels: [],
  assignees: ['me'],
  files: [],
  reviews: [],
  comments: [],
  lastCommitAt: daysAgo(30),
  assignedAt: { me: daysAgo(30) },
  ...over,
});
const c = (p: CapacityPr) => classifyInProgress(p, 'me', NOW, 14).status;

describe('classifyInProgress', () => {
  it('draft parks', () => expect(c(pr({ isDraft: true }))).toBe('parked'));
  it('never reviewed → waiting on you', () => expect(c(pr())).toBe('waiting-on-you'));
  it('author pushed after my changes-requested → waiting on you', () =>
    expect(
      c(
        pr({
          reviews: [
            {
              author: 'me',
              state: 'CHANGES_REQUESTED',
              submittedAt: daysAgo(20),
            },
          ],
          lastCommitAt: daysAgo(2),
        }),
      ),
    ).toBe('waiting-on-you'));
  it('author silent 5d after my review → waiting on author', () =>
    expect(
      c(
        pr({
          reviews: [{ author: 'me', state: 'COMMENTED', submittedAt: daysAgo(5) }],
        }),
      ),
    ).toBe('waiting-on-author'));
  it('author silent 14d → parked', () =>
    expect(
      c(
        pr({
          reviews: [
            {
              author: 'me',
              state: 'CHANGES_REQUESTED',
              submittedAt: daysAgo(14),
            },
          ],
        }),
      ),
    ).toBe('parked'));
  it('only other people commented → still parks (only author activity counts)', () =>
    expect(
      c(
        pr({
          reviews: [
            {
              author: 'me',
              state: 'CHANGES_REQUESTED',
              submittedAt: daysAgo(20),
            },
          ],
          comments: [{ author: 'bob', createdAt: daysAgo(1) }],
        }),
      ),
    ).toBe('parked'));
  it('author replied 3d ago, no push → waiting on you', () =>
    expect(
      c(
        pr({
          reviews: [
            {
              author: 'me',
              state: 'CHANGES_REQUESTED',
              submittedAt: daysAgo(6),
            },
          ],
          comments: [{ author: 'alice', createdAt: daysAgo(3) }],
        }),
      ),
    ).toBe('waiting-on-you'));
  it('author only talking for 14d+ → talking-not-moving', () =>
    expect(
      c(
        pr({
          reviews: [
            {
              author: 'me',
              state: 'CHANGES_REQUESTED',
              submittedAt: daysAgo(20),
            },
          ],
          comments: [{ author: 'alice', createdAt: daysAgo(18) }],
        }),
      ),
    ).toBe('talking-not-moving'));
  it('my comment counts as feedback and restarts the clock', () =>
    expect(
      c(
        pr({
          reviews: [
            {
              author: 'me',
              state: 'CHANGES_REQUESTED',
              submittedAt: daysAgo(30),
            },
          ],
          comments: [
            { author: 'alice', createdAt: daysAgo(25) },
            { author: 'me', createdAt: daysAgo(3) },
          ],
        }),
      ),
    ).toBe('waiting-on-author'));
  it('approved, no push since → approved (active)', () => {
    const s = c(
      pr({
        reviews: [{ author: 'me', state: 'APPROVED', submittedAt: daysAgo(20) }],
      }),
    );
    expect(s).toBe('approved');
    expect(isActive(s)).toBe(true);
  });
  it('parked is not active', () => expect(isActive('parked')).toBe(false));
});

describe('case-insensitive logins', () => {
  it('matches user and author ignoring case', () =>
    expect(
      classifyInProgress(
        pr({
          author: 'Alice',
          reviews: [{ author: 'ME', state: 'COMMENTED', submittedAt: daysAgo(20) }],
          comments: [{ author: 'alice', createdAt: daysAgo(18) }],
        }),
        'Me',
        NOW,
        14,
      ).status,
    ).toBe('talking-not-moving'));
});
