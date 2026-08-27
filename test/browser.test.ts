import { describe, it, expect } from 'vitest';
import { openItems } from '../src/browser.js';
import type { GitHubItem } from '../src/github.js';

function makeItems(count: number): GitHubItem[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    title: `Item ${i + 1}`,
    url: `https://github.com/org/repo/issues/${i + 1}`,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    labels: [],
    author: 'someone',
    state: 'open',
    isPr: false,
    headRefOid: '',
    comments: [],
  }));
}

describe('openItems', () => {
  it('opens all items when <=15', async () => {
    const result = await openItems(makeItems(10), { dryRun: true });
    expect(result.opened).toBe(10);
    expect(result.capped).toBe(false);
  });

  it('opens all items when 16-50', async () => {
    const result = await openItems(makeItems(30), { dryRun: true });
    expect(result.opened).toBe(30);
    expect(result.capped).toBe(false);
  });

  it('caps at 25 when >50 items', async () => {
    const result = await openItems(makeItems(60), { dryRun: true });
    expect(result.opened).toBe(25);
    expect(result.capped).toBe(true);
    expect(result.total).toBe(60);
  });

  it('opens all when openAll is true even with >50 items', async () => {
    const result = await openItems(makeItems(60), { dryRun: true, openAll: true });
    expect(result.opened).toBe(60);
    expect(result.capped).toBe(false);
  });

  it('handles empty list', async () => {
    const result = await openItems([], { dryRun: true });
    expect(result.opened).toBe(0);
    expect(result.capped).toBe(false);
  });
});
