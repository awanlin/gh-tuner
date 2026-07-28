import { describe, it, expect } from 'vitest';
import { resolveSince, getScheduleForDay, isRepoIncluded } from '../src/schedule.js';

describe('resolveSince', () => {
  it('resolves last-thursday from a Tuesday', () => {
    // Tuesday 2026-07-07 -> last Thursday was 2026-07-02
    const result = resolveSince('last-thursday', new Date('2026-07-07'));
    expect(result.toISOString().slice(0, 10)).toBe('2026-07-02');
  });

  it('resolves last-tuesday from a Thursday', () => {
    // Thursday 2026-07-09 -> last Tuesday was 2026-07-07
    const result = resolveSince('last-tuesday', new Date('2026-07-09'));
    expect(result.toISOString().slice(0, 10)).toBe('2026-07-07');
  });

  it('resolves last-friday from a Friday', () => {
    // Friday 2026-07-10 -> last Friday was 2026-07-03
    const result = resolveSince('last-friday', new Date('2026-07-10'));
    expect(result.toISOString().slice(0, 10)).toBe('2026-07-03');
  });

  it('resolves last-friday from a Friday going back a full week', () => {
    const result = resolveSince('last-friday', new Date('2026-07-17'));
    expect(result.toISOString().slice(0, 10)).toBe('2026-07-10');
  });
});

describe('getScheduleForDay', () => {
  const schedule = {
    tuesday: { mode: 'issues' as const, since: 'last-thursday' },
    thursday: { mode: 'issues' as const, since: 'last-tuesday' },
    friday: { mode: 'prs' as const, since: 'last-friday' },
  };

  it('returns the matching entry for tuesday', () => {
    const entry = getScheduleForDay(schedule, new Date('2026-07-07'));
    expect(entry).toEqual({ mode: 'issues', since: 'last-thursday' });
  });

  it('returns null for an unscheduled day', () => {
    // Monday
    const entry = getScheduleForDay(schedule, new Date('2026-07-06'));
    expect(entry).toBeNull();
  });
});

describe('isRepoIncluded', () => {
  const startDate = '2026-07-07'; // a Tuesday

  it('always includes weekly repos', () => {
    const repo = { name: 'org/repo', scope: 'all' as const, cadence: 'weekly' as const };
    expect(isRepoIncluded(repo, startDate, new Date('2026-07-08'))).toBe(true);
    expect(isRepoIncluded(repo, startDate, new Date('2026-07-15'))).toBe(true);
  });

  it('includes biweekly repos on even weeks from startDate', () => {
    const repo = { name: 'org/repo', scope: 'all' as const, cadence: 'biweekly' as const };
    // Week 0 (startDate week) — included
    expect(isRepoIncluded(repo, startDate, new Date('2026-07-08'))).toBe(true);
    // Week 1 — excluded
    expect(isRepoIncluded(repo, startDate, new Date('2026-07-15'))).toBe(false);
    // Week 2 — included
    expect(isRepoIncluded(repo, startDate, new Date('2026-07-22'))).toBe(true);
  });

  it('includes monthly repos only once per month cycle', () => {
    const repo = { name: 'org/repo', scope: 'all' as const, cadence: 'monthly' as const };
    // Same month as startDate — included (first run)
    expect(isRepoIncluded(repo, startDate, new Date('2026-07-07'))).toBe(true);
    // Still July, second week — excluded
    expect(isRepoIncluded(repo, startDate, new Date('2026-07-14'))).toBe(false);
    // August — new month, included
    expect(isRepoIncluded(repo, startDate, new Date('2026-08-04'))).toBe(true);
  });

  it('always includes filtered repos regardless of cadence', () => {
    const repo = { name: 'org/repo', scope: 'filtered' as const, labels: ['area:search'] };
    expect(isRepoIncluded(repo, startDate, new Date('2026-07-08'))).toBe(true);
    expect(isRepoIncluded(repo, startDate, new Date('2026-07-15'))).toBe(true);
    expect(isRepoIncluded(repo, startDate, new Date('2026-08-15'))).toBe(true);
  });

  it('always includes repos with per-mode scope containing filtered', () => {
    const repo = {
      name: 'org/repo',
      scope: { issues: 'all' as const, prs: 'filtered' as const },
      labels: ['area:search'],
    };
    expect(isRepoIncluded(repo, startDate, new Date('2026-07-08'))).toBe(true);
    expect(isRepoIncluded(repo, startDate, new Date('2026-07-15'))).toBe(true);
  });

  it('applies cadence to repos with per-mode scope all/all', () => {
    const repo = {
      name: 'org/repo',
      scope: { issues: 'all' as const, prs: 'all' as const },
      cadence: 'biweekly' as const,
    };
    // Week 0 — included
    expect(isRepoIncluded(repo, startDate, new Date('2026-07-08'))).toBe(true);
    // Week 1 — excluded
    expect(isRepoIncluded(repo, startDate, new Date('2026-07-15'))).toBe(false);
  });
});
