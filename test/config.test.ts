import { describe, it, expect } from 'vitest';
import { loadConfig, getScope } from '../src/config.js';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('loadConfig', () => {
  function writeTempConfig(content: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'gh-tuner-test-'));
    const path = join(dir, 'gh-tuner.yaml');
    writeFileSync(path, content);
    return path;
  }

  it('parses a valid config file', () => {
    const path = writeTempConfig(`
user: testuser
startDate: 2026-07-07
repos:
  - name: org/repo1
    scope: all
    cadence: weekly
  - name: org/repo2
    scope: filtered
    labels:
      - area:search
schedule:
  tuesday:
    mode: issues
    since: last-thursday
securityKeywords:
  - CVE
filters:
  humanEngagementOnly: true
  excludeAwaitingOthers: false
`);
    const config = loadConfig(path);
    expect(config.user).toBe('testuser');
    expect(config.startDate).toBe('2026-07-07');
    expect(config.repos).toHaveLength(2);
    expect(config.repos[0]).toEqual({
      name: 'org/repo1',
      scope: 'all',
      cadence: 'weekly',
    });
    expect(config.repos[1]).toEqual({
      name: 'org/repo2',
      scope: 'filtered',
      labels: ['area:search'],
    });
    expect(config.schedule.tuesday).toEqual({
      mode: 'issues',
      since: 'last-thursday',
    });
    expect(config.securityKeywords).toEqual(['CVE']);
    expect(config.filters.humanEngagementOnly).toBe(true);
    expect(config.filters.excludeAwaitingOthers).toBe(false);
    expect(config.filters.excludeAuthor).toBe(true);
    expect(config.filters.excludeDrafts).toBe(true);
    expect(config.filters.excludeChangesRequestedByOthers).toBe(true);
  });

  it('throws on missing config file', () => {
    expect(() => loadConfig('/nonexistent/gh-tuner.yaml')).toThrow();
  });

  it('defaults excludeAuthor and excludeDrafts to true when not specified', () => {
    const path = writeTempConfig(`
user: testuser
startDate: 2026-07-07
repos:
  - name: org/repo1
    scope: all
schedule:
  tuesday:
    mode: issues
    since: last-thursday
filters:
  humanEngagementOnly: true
  excludeAwaitingOthers: true
`);
    const config = loadConfig(path);
    expect(config.filters.excludeAuthor).toBe(true);
    expect(config.filters.excludeDrafts).toBe(true);
    expect(config.filters.excludeChangesRequestedByOthers).toBe(true);
    expect(config.filters.excludeAssigned).toBe(false);
  });

  it('respects excludeAuthor when explicitly set to false', () => {
    const path = writeTempConfig(`
user: testuser
startDate: 2026-07-07
repos:
  - name: org/repo1
    scope: all
schedule:
  tuesday:
    mode: issues
    since: last-thursday
filters:
  humanEngagementOnly: true
  excludeAwaitingOthers: true
  excludeAuthor: false
`);
    const config = loadConfig(path);
    expect(config.filters.excludeAuthor).toBe(false);
  });

  it('throws on missing required field', () => {
    const path = writeTempConfig(`
startDate: 2026-07-07
repos: []
schedule: {}
securityKeywords: []
filters:
  humanEngagementOnly: true
  excludeAwaitingOthers: true
`);
    expect(() => loadConfig(path)).toThrow(/user/);
  });

  it('parses object scope with per-mode values', () => {
    const path = writeTempConfig(`
user: testuser
startDate: 2026-07-07
repos:
  - name: org/repo1
    scope:
      issues: all
      prs: filtered
    labels:
      - area:search
schedule:
  tuesday:
    mode: issues
    since: last-thursday
filters:
  humanEngagementOnly: true
  excludeAwaitingOthers: true
`);
    const config = loadConfig(path);
    expect(config.repos[0].scope).toEqual({ issues: 'all', prs: 'filtered' });
    expect(config.repos[0].labels).toEqual(['area:search']);
  });

  it('throws on object scope missing prs key', () => {
    const path = writeTempConfig(`
user: testuser
startDate: 2026-07-07
repos:
  - name: org/repo1
    scope:
      issues: all
schedule:
  tuesday:
    mode: issues
    since: last-thursday
filters:
  humanEngagementOnly: true
  excludeAwaitingOthers: true
`);
    expect(() => loadConfig(path)).toThrow(/scope/);
  });

  it('throws on invalid scope value in object form', () => {
    const path = writeTempConfig(`
user: testuser
startDate: 2026-07-07
repos:
  - name: org/repo1
    scope:
      issues: everything
      prs: filtered
schedule:
  tuesday:
    mode: issues
    since: last-thursday
filters:
  humanEngagementOnly: true
  excludeAwaitingOthers: true
`);
    expect(() => loadConfig(path)).toThrow(/scope/);
  });
});

describe('getScope', () => {
  it('returns the string scope for any mode', () => {
    const repo = { name: 'org/repo', scope: 'all' as const };
    expect(getScope(repo, 'issues')).toBe('all');
    expect(getScope(repo, 'prs')).toBe('all');
  });

  it('returns the per-mode scope from an object', () => {
    const repo = { name: 'org/repo', scope: { issues: 'all' as const, prs: 'filtered' as const } };
    expect(getScope(repo, 'issues')).toBe('all');
    expect(getScope(repo, 'prs')).toBe('filtered');
  });
});
