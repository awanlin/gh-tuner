// test/capacity-data.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as child_process from 'node:child_process';
import {
  searchCount,
  searchCapacityPrs,
  fetchRawFile,
  isoDaysAgo,
  BOT_QUERY,
} from '../src/capacity/data.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
const exec = vi.mocked(child_process.execFileSync);
beforeEach(() => {
  exec.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const node = {
  number: 7,
  title: 'Fix',
  url: 'https://github.com/o/r/pull/7',
  createdAt: '2026-11-01T00:00:00Z',
  state: 'OPEN',
  isDraft: false,
  author: { login: 'alice', __typename: 'User' },
  labels: { nodes: [{ name: 'area:techdocs' }] },
  assignees: { nodes: [{ login: 'me' }] },
  files: { nodes: [{ path: 'workspaces/x/a.ts' }] },
  reviews: {
    nodes: [
      {
        author: { login: 'me' },
        state: 'COMMENTED',
        submittedAt: '2026-11-02T00:00:00Z',
      },
    ],
  },
  comments: {
    nodes: [{ author: { login: 'alice' }, createdAt: '2026-11-03T00:00:00Z' }],
  },
  commits: { nodes: [{ commit: { committedDate: '2026-11-04T00:00:00Z' } }] },
  timelineItems: {
    nodes: [{ createdAt: '2026-11-02T00:00:00Z', assignee: { login: 'me' } }],
  },
};

describe('searchCount', () => {
  it('returns issueCount', () => {
    exec.mockReturnValue(JSON.stringify({ data: { search: { issueCount: 42 } } }));
    expect(searchCount('repo:o/r is:pr')).toBe(42);
  });
  it('returns null when gh fails', () => {
    exec.mockImplementation((cmd) => {
      if (cmd === 'sleep') return '';
      throw new Error('502');
    });
    expect(searchCount('repo:o/r is:pr')).toBeNull();
  });
});

describe('searchCapacityPrs', () => {
  it('maps nodes and follows pagination', () => {
    exec
      .mockReturnValueOnce(
        JSON.stringify({
          data: {
            search: {
              pageInfo: { hasNextPage: true, endCursor: 'c1' },
              nodes: [node],
            },
          },
        }),
      )
      .mockReturnValueOnce(
        JSON.stringify({
          data: {
            search: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [{ ...node, number: 8 }],
            },
          },
        }),
      );
    const prs = searchCapacityPrs('repo:o/r is:pr')!;
    expect(prs.map((p) => p.number)).toEqual([7, 8]);
    expect(prs[0]).toMatchObject({
      author: 'alice',
      authorIsBot: false,
      labels: ['area:techdocs'],
      assignees: ['me'],
      files: ['workspaces/x/a.ts'],
      lastCommitAt: '2026-11-04T00:00:00Z',
      assignedAt: { me: '2026-11-02T00:00:00Z' },
    });
    const secondArgs = exec.mock.calls[1][1] as string[];
    expect(secondArgs).toContain('cursor=c1');
  });
  it('requests small pages (25) to avoid 502s', () => {
    exec.mockReturnValue(
      JSON.stringify({
        data: { search: { pageInfo: { hasNextPage: false }, nodes: [] } },
      }),
    );
    searchCapacityPrs('q');
    expect((exec.mock.calls[0][1] as string[]).join(' ')).toContain('first:25');
  });
  it('returns null if any page fails, never a partial list', () => {
    exec
      .mockReturnValueOnce(
        JSON.stringify({
          data: {
            search: {
              pageInfo: { hasNextPage: true, endCursor: 'c1' },
              nodes: [node],
            },
          },
        }),
      )
      .mockImplementation((cmd) => {
        if (cmd === 'sleep') return '';
        throw new Error('502');
      });
    expect(searchCapacityPrs('q')).toBeNull();
  });
  it('returns null when maxPages is hit with more pages remaining', () => {
    exec.mockReturnValue(
      JSON.stringify({
        data: {
          search: {
            pageInfo: { hasNextPage: true, endCursor: 'c' },
            nodes: [node],
          },
        },
      }),
    );
    expect(searchCapacityPrs('q', { maxPages: 2 })).toBeNull();
    expect(exec).toHaveBeenCalledTimes(2);
  });
  it('detects bots case-insensitively', () => {
    exec.mockReturnValue(
      JSON.stringify({
        data: {
          search: {
            pageInfo: { hasNextPage: false },
            nodes: [{ ...node, author: { login: 'Renovate', __typename: 'User' } }],
          },
        },
      }),
    );
    expect(searchCapacityPrs('q')![0].authorIsBot).toBe(true);
  });
  it('marks App/Bot authors as bots', () => {
    exec.mockReturnValue(
      JSON.stringify({
        data: {
          search: {
            pageInfo: { hasNextPage: false },
            nodes: [{ ...node, author: { login: 'renovate', __typename: 'Bot' } }],
          },
        },
      }),
    );
    expect(searchCapacityPrs('q')![0].authorIsBot).toBe(true);
  });
});

describe('helpers', () => {
  it('isoDaysAgo', () =>
    expect(isoDaysAgo(new Date('2026-11-22T12:00:00Z'), 7)).toBe('2026-11-15'));
  it('BOT_QUERY excludes renovate and dependabot', () => {
    expect(BOT_QUERY).toContain('-author:app/renovate');
    expect(BOT_QUERY).toContain('-author:app/dependabot');
    expect(BOT_QUERY).toContain('-author:app/backstage-goalie');
    expect(BOT_QUERY).toContain('-author:backstage-goalie');
  });
  it('fetchRawFile returns content or null', () => {
    exec.mockReturnValueOnce('hello\n');
    expect(fetchRawFile('o/r', 'OWNERS.md')).toBe('hello');
  });
});
