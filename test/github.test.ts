import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as child_process from 'node:child_process';
import {
  ghExec,
  fetchIssues,
  fetchPrs,
  fetchMentionedIssues,
  fetchMentionedPrs,
  fetchComments,
  lastExecFailed,
} from '../src/github.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

const mockExecFileSync = vi.mocked(child_process.execFileSync);

beforeEach(() => {
  mockExecFileSync.mockReset();
});

describe('ghExec', () => {
  it('calls execFileSync with gh and args array', () => {
    mockExecFileSync.mockReturnValue('output\n');
    const result = ghExec(['issue', 'list', '--repo', 'org/repo']);

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['issue', 'list', '--repo', 'org/repo'],
      expect.objectContaining({ encoding: 'utf-8', timeout: 30_000 }),
    );
    expect(result).toBe('output');
  });

  it('trims whitespace from output', () => {
    mockExecFileSync.mockReturnValue('  result  \n');
    expect(ghExec(['version'])).toBe('result');
  });

  it('retries on failure and succeeds on later attempt', () => {
    const error = new Error('Command failed') as Error & { stderr: string };
    error.stderr = 'HTTP 504: request timed out\n';

    let callCount = 0;
    mockExecFileSync.mockImplementation(((cmd: string) => {
      if (cmd === 'sleep') return '';
      callCount++;
      if (callCount < 3) throw error;
      return 'success\n';
    }) as typeof child_process.execFileSync);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = ghExec(['pr', 'list', '--repo', 'backstage/backstage']);

    expect(result).toBe('success');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('attempt 1/3'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('attempt 2/3'));
    spy.mockRestore();
  });

  it('returns empty string after all retries exhausted', () => {
    const error = new Error('Command failed') as Error & { stderr: string };
    error.stderr = 'HTTP 504: request timed out\n';
    mockExecFileSync.mockImplementation(((cmd: string) => {
      if (cmd === 'sleep') return '';
      throw error;
    }) as typeof child_process.execFileSync);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = ghExec(['pr', 'list', '--repo', 'backstage/backstage']);

    expect(result).toBe('');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('failed after 3 attempts'));
    spy.mockRestore();
  });

  it('sets lastExecFailed to true after all retries exhausted', () => {
    mockExecFileSync.mockImplementation(((cmd: string) => {
      if (cmd === 'sleep') return '';
      throw new Error('fail');
    }) as typeof child_process.execFileSync);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    ghExec(['pr', 'list']);

    expect(lastExecFailed()).toBe(true);
    spy.mockRestore();
  });

  it('sets lastExecFailed to false on success', () => {
    mockExecFileSync.mockReturnValue('ok\n');
    ghExec(['version']);

    expect(lastExecFailed()).toBe(false);
  });

  it('handles errors without stderr property', () => {
    mockExecFileSync.mockImplementation(((cmd: string) => {
      if (cmd === 'sleep') return '';
      throw new Error('ETIMEDOUT');
    }) as typeof child_process.execFileSync);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = ghExec(['api', 'repos/org/repo/comments']);

    expect(result).toBe('');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('ETIMEDOUT'));
    spy.mockRestore();
  });

  it('preserves special characters in args without shell interpretation', () => {
    mockExecFileSync.mockReturnValue('[]');
    ghExec(['issue', 'list', '--search', 'updated:>=2026-07-03']);

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['issue', 'list', '--search', 'updated:>=2026-07-03'],
      expect.any(Object),
    );
  });
});

describe('fetchIssues', () => {
  it('returns parsed issues from gh output', () => {
    const ghOutput = JSON.stringify([
      {
        number: 123,
        title: 'Bug report',
        url: 'https://github.com/org/repo/issues/123',
        createdAt: '2026-07-05T10:00:00Z',
        updatedAt: '2026-07-06T12:00:00Z',
        labels: [{ name: 'bug' }, { name: 'area:search' }],
        author: { login: 'contributor' },
        state: 'OPEN',
      },
    ]);
    mockExecFileSync.mockReturnValue(ghOutput);

    const items = fetchIssues('org/repo', '2026-07-03');

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      number: 123,
      title: 'Bug report',
      url: 'https://github.com/org/repo/issues/123',
      createdAt: '2026-07-05T10:00:00Z',
      updatedAt: '2026-07-06T12:00:00Z',
      labels: ['bug', 'area:search'],
      author: 'contributor',
      assignees: [],
      state: 'OPEN',
      isPr: false,
      isDraft: false,
      reviews: [],
      comments: [],
    });
  });

  it('passes correct search query with >= intact', () => {
    mockExecFileSync.mockReturnValue('[]');
    fetchIssues('backstage/backstage', '2026-07-03');

    const args = mockExecFileSync.mock.calls[0][1] as string[];
    expect(args).toContain('--search');
    const searchIdx = args.indexOf('--search');
    expect(args[searchIdx + 1]).toBe('updated:>=2026-07-03');
  });

  it('returns empty array when gh returns empty string', () => {
    mockExecFileSync.mockReturnValue('');
    expect(fetchIssues('org/repo', '2026-07-03')).toEqual([]);
  });

  it('returns empty array when gh command fails after retries', () => {
    mockExecFileSync.mockImplementation(((cmd: string) => {
      if (cmd === 'sleep') return '';
      throw new Error('Command failed');
    }) as typeof child_process.execFileSync);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(fetchIssues('org/repo', '2026-07-03')).toEqual([]);
    expect(lastExecFailed()).toBe(true);
    spy.mockRestore();
  });

  it('handles items with null author', () => {
    const ghOutput = JSON.stringify([
      {
        number: 1,
        title: 'Issue',
        url: 'https://github.com/org/repo/issues/1',
        createdAt: '2026-07-05T00:00:00Z',
        updatedAt: '2026-07-06T00:00:00Z',
        labels: [],
        author: null,
        state: 'OPEN',
      },
    ]);
    mockExecFileSync.mockReturnValue(ghOutput);

    const items = fetchIssues('org/repo', '2026-07-03');
    expect(items[0].author).toBe('unknown');
  });

  it('handles items with no labels', () => {
    const ghOutput = JSON.stringify([
      {
        number: 1,
        title: 'Issue',
        url: 'https://github.com/org/repo/issues/1',
        createdAt: '2026-07-05T00:00:00Z',
        updatedAt: '2026-07-06T00:00:00Z',
        labels: null,
        author: { login: 'user' },
        state: 'OPEN',
      },
    ]);
    mockExecFileSync.mockReturnValue(ghOutput);

    const items = fetchIssues('org/repo', '2026-07-03');
    expect(items[0].labels).toEqual([]);
  });

  it('returns multiple issues sorted as received', () => {
    const ghOutput = JSON.stringify([
      {
        number: 10,
        title: 'First',
        url: 'https://github.com/org/repo/issues/10',
        createdAt: '2026-07-03T00:00:00Z',
        updatedAt: '2026-07-05T00:00:00Z',
        labels: [],
        author: { login: 'a' },
        state: 'OPEN',
      },
      {
        number: 20,
        title: 'Second',
        url: 'https://github.com/org/repo/issues/20',
        createdAt: '2026-07-04T00:00:00Z',
        updatedAt: '2026-07-06T00:00:00Z',
        labels: [{ name: 'area:docs' }],
        author: { login: 'b' },
        state: 'OPEN',
      },
    ]);
    mockExecFileSync.mockReturnValue(ghOutput);

    const items = fetchIssues('org/repo', '2026-07-03');
    expect(items).toHaveLength(2);
    expect(items[0].number).toBe(10);
    expect(items[1].number).toBe(20);
  });
});

describe('fetchPrs', () => {
  it('returns parsed PRs with isPr set to true', () => {
    const ghOutput = JSON.stringify([
      {
        number: 456,
        title: 'feat: add search',
        url: 'https://github.com/org/repo/pull/456',
        createdAt: '2026-07-05T10:00:00Z',
        updatedAt: '2026-07-06T12:00:00Z',
        labels: [{ name: 'area:search' }],
        author: { login: 'contributor' },
        state: 'OPEN',
        reviewDecision: 'APPROVED',
      },
    ]);
    mockExecFileSync.mockReturnValue(ghOutput);

    const items = fetchPrs('org/repo', '2026-07-03');

    expect(items).toHaveLength(1);
    expect(items[0].isPr).toBe(true);
    expect(items[0].isDraft).toBe(false);
    expect(items[0].reviews).toEqual([]);
    expect(items[0].number).toBe(456);
  });

  it('maps reviews from PR data', () => {
    const ghOutput = JSON.stringify([
      {
        number: 500,
        title: 'reviewed PR',
        url: 'https://github.com/org/repo/pull/500',
        createdAt: '2026-07-05T10:00:00Z',
        updatedAt: '2026-07-06T12:00:00Z',
        labels: [],
        author: { login: 'contributor' },
        state: 'OPEN',
        reviews: [
          { author: { login: 'reviewer1' }, state: 'APPROVED' },
          { author: { login: 'copilot-pull-request-reviewer' }, state: 'COMMENTED' },
        ],
        reviewDecision: 'APPROVED',
      },
    ]);
    mockExecFileSync.mockReturnValue(ghOutput);

    const items = fetchPrs('org/repo', '2026-07-03');

    expect(items[0].reviews).toEqual([
      { author: 'reviewer1', state: 'APPROVED' },
      { author: 'copilot-pull-request-reviewer', state: 'COMMENTED' },
    ]);
  });

  it('maps isDraft from PR data', () => {
    const ghOutput = JSON.stringify([
      {
        number: 789,
        title: 'wip: draft PR',
        url: 'https://github.com/org/repo/pull/789',
        createdAt: '2026-07-05T10:00:00Z',
        updatedAt: '2026-07-06T12:00:00Z',
        labels: [],
        author: { login: 'contributor' },
        state: 'OPEN',
        isDraft: true,
        reviewDecision: '',
      },
    ]);
    mockExecFileSync.mockReturnValue(ghOutput);

    const items = fetchPrs('org/repo', '2026-07-03');

    expect(items[0].isDraft).toBe(true);
  });

  it('passes correct search query with >= intact', () => {
    mockExecFileSync.mockReturnValue('[]');
    fetchPrs('backstage/backstage', '2026-07-01');

    const args = mockExecFileSync.mock.calls[0][1] as string[];
    const searchIdx = args.indexOf('--search');
    expect(args[searchIdx + 1]).toBe('updated:>=2026-07-01');
  });

  it('returns empty array when gh returns empty string', () => {
    mockExecFileSync.mockReturnValue('');
    expect(fetchPrs('org/repo', '2026-07-03')).toEqual([]);
  });

  it('returns empty array when gh command fails after retries', () => {
    mockExecFileSync.mockImplementation(((cmd: string) => {
      if (cmd === 'sleep') return '';
      throw new Error('Command failed');
    }) as typeof child_process.execFileSync);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(fetchPrs('org/repo', '2026-07-03')).toEqual([]);
    expect(lastExecFailed()).toBe(true);
    spy.mockRestore();
  });
});

describe('fetchMentionedIssues', () => {
  it('passes mentions qualifier in search', () => {
    mockExecFileSync.mockReturnValue('[]');
    fetchMentionedIssues('backstage/backstage', '2026-07-03', 'awanlin');

    const args = mockExecFileSync.mock.calls[0][1] as string[];
    const searchIdx = args.indexOf('--search');
    expect(args[searchIdx + 1]).toBe('updated:>=2026-07-03 mentions:awanlin');
  });
});

describe('fetchMentionedPrs', () => {
  it('passes mentions qualifier in search', () => {
    mockExecFileSync.mockReturnValue('[]');
    fetchMentionedPrs('backstage/backstage', '2026-07-03', 'awanlin');

    const args = mockExecFileSync.mock.calls[0][1] as string[];
    const searchIdx = args.indexOf('--search');
    expect(args[searchIdx + 1]).toBe('updated:>=2026-07-03 mentions:awanlin');
  });
});

describe('fetchComments', () => {
  it('returns parsed comments from gh api output', () => {
    const ghOutput = JSON.stringify([
      {
        user: { login: 'reviewer' },
        created_at: '2026-07-05T10:00:00Z',
        body: 'Looks good to me',
      },
      {
        user: { login: 'author' },
        created_at: '2026-07-05T11:00:00Z',
        body: 'Thanks!',
      },
    ]);
    mockExecFileSync.mockReturnValue(ghOutput);

    const comments = fetchComments('org/repo', 123);

    expect(comments).toHaveLength(2);
    expect(comments[0]).toEqual({
      author: 'reviewer',
      createdAt: '2026-07-05T10:00:00Z',
      body: 'Looks good to me',
    });
    expect(comments[1]).toEqual({
      author: 'author',
      createdAt: '2026-07-05T11:00:00Z',
      body: 'Thanks!',
    });
  });

  it('returns empty array when gh returns empty string', () => {
    mockExecFileSync.mockReturnValue('');
    expect(fetchComments('org/repo', 123)).toEqual([]);
  });

  it('handles null user gracefully', () => {
    const ghOutput = JSON.stringify([
      {
        user: null,
        created_at: '2026-07-05T10:00:00Z',
        body: 'Ghost comment',
      },
    ]);
    mockExecFileSync.mockReturnValue(ghOutput);

    const comments = fetchComments('org/repo', 123);
    expect(comments[0].author).toBe('unknown');
  });

  it('returns empty array when gh command fails after retries', () => {
    mockExecFileSync.mockImplementation(((cmd: string) => {
      if (cmd === 'sleep') return '';
      throw new Error('Command failed');
    }) as typeof child_process.execFileSync);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(fetchComments('org/repo', 123)).toEqual([]);
    spy.mockRestore();
  });

  it('handles malformed JSON gracefully', () => {
    mockExecFileSync.mockReturnValue('not json at all');
    expect(fetchComments('org/repo', 123)).toEqual([]);
  });

  it('handles paginated output with multiple JSON arrays', () => {
    const page1 = JSON.stringify([
      { user: { login: 'a' }, created_at: '2026-07-01T00:00:00Z', body: 'first' },
    ]);
    const page2 = JSON.stringify([
      { user: { login: 'b' }, created_at: '2026-07-02T00:00:00Z', body: 'second' },
    ]);
    mockExecFileSync.mockReturnValue(`${page1}\n${page2}`);

    const comments = fetchComments('org/repo', 123);
    expect(comments).toHaveLength(2);
    expect(comments[0].author).toBe('a');
    expect(comments[1].author).toBe('b');
  });
});
