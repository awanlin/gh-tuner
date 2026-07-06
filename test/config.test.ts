import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('loadConfig', () => {
  function writeTempConfig(content: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'tuner-test-'));
    const path = join(dir, 'tuner.yaml');
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
  });

  it('throws on missing config file', () => {
    expect(() => loadConfig('/nonexistent/tuner.yaml')).toThrow();
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
});
