import { execFileSync } from 'node:child_process';
import chalk from 'chalk';

export interface GitHubComment {
  author: string;
  createdAt: string;
  body: string;
}

export interface GitHubReview {
  author: string;
  state: string;
}

export interface GitHubItem {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  labels: string[];
  author: string;
  assignees: string[];
  state: string;
  isPr: boolean;
  isDraft: boolean;
  reviews: GitHubReview[];
  comments: GitHubComment[];
}

let _lastExecFailed = false;

export function lastExecFailed(): boolean {
  return _lastExecFailed;
}

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

function sleepSync(ms: number): void {
  execFileSync('sleep', [String(ms / 1000)]);
}

function extractErrorMessage(err: unknown): string {
  const stderr =
    err instanceof Error && 'stderr' in err ? String((err as { stderr: unknown }).stderr) : '';
  return stderr.trim() || (err instanceof Error ? err.message : 'unknown error');
}

export function ghExec(args: string[]): string {
  const label = `gh ${args.slice(0, 3).join(' ')}...`;

  _lastExecFailed = false;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = execFileSync('gh', args, {
        encoding: 'utf-8',
        timeout: 30_000,
      }).trim();
      return result;
    } catch (err: unknown) {
      const message = extractErrorMessage(err);

      if (attempt < MAX_RETRIES) {
        const delay = BACKOFF_BASE_MS * Math.pow(3, attempt - 1);
        console.error(
          chalk.yellow(`  ⚠ ${label} failed (attempt ${attempt}/${MAX_RETRIES}): ${message}`),
        );
        console.error(chalk.yellow(`    Retrying in ${delay / 1000}s...`));
        sleepSync(delay);
      } else {
        console.error(
          chalk.yellow(`  ⚠ ${label} failed after ${MAX_RETRIES} attempts: ${message}`),
        );
      }
    }
  }

  _lastExecFailed = true;
  return '';
}

const ISSUE_FIELDS = 'number,title,url,createdAt,updatedAt,labels,author,assignees,state';
// TODO: Consider adding statusCheckRollup back to show CI pass/fail status
// per PR. Dropped because it causes 504 timeouts on large repos (the field
// triggers expensive cross-service lookups in GitHub's GraphQL API) and the
// data wasn't being surfaced in the output. When revisiting, fetch only the
// rolled-up state (not individual contexts) — adds ~1s vs ~4.7s with contexts.
const PR_FIELDS =
  'number,title,url,createdAt,updatedAt,labels,author,assignees,state,isDraft,reviews,reviewDecision';

interface GhLabel {
  name: string;
}

interface GhItem {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  labels: GhLabel[];
  author: { login: string } | null;
  assignees?: { login: string }[];
  state: string;
  isDraft?: boolean;
  reviews?: { author: { login: string } | null; state: string }[];
}

interface GhComment {
  user: { login: string } | null;
  created_at: string;
  body: string;
}

function mapItem(item: GhItem, isPr: boolean): GitHubItem {
  return {
    number: item.number,
    title: item.title,
    url: item.url,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    labels: (item.labels ?? []).map((l) => l.name),
    author: item.author?.login ?? 'unknown',
    assignees: (item.assignees ?? []).map((a) => a.login),
    state: item.state,
    isPr,
    isDraft: item.isDraft ?? false,
    reviews: (item.reviews ?? []).map((r) => ({
      author: r.author?.login ?? 'unknown',
      state: r.state,
    })),
    comments: [],
  };
}

export function fetchIssues(repo: string, since: string): GitHubItem[] {
  const sinceDate = since.slice(0, 10);
  const raw = ghExec([
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    'open',
    '--limit',
    '200',
    '--json',
    ISSUE_FIELDS,
    '--search',
    `updated:>=${sinceDate}`,
  ]);

  if (!raw) return [];
  return (JSON.parse(raw) as GhItem[]).map((item) => mapItem(item, false));
}

export function fetchPrs(repo: string, since: string): GitHubItem[] {
  const sinceDate = since.slice(0, 10);
  const raw = ghExec([
    'pr',
    'list',
    '--repo',
    repo,
    '--state',
    'open',
    '--limit',
    '200',
    '--json',
    PR_FIELDS,
    '--search',
    `updated:>=${sinceDate}`,
  ]);

  if (!raw) return [];
  return (JSON.parse(raw) as GhItem[]).map((item) => mapItem(item, true));
}

export function fetchMentionedIssues(repo: string, since: string, user: string): GitHubItem[] {
  const sinceDate = since.slice(0, 10);
  const raw = ghExec([
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    'open',
    '--limit',
    '200',
    '--json',
    ISSUE_FIELDS,
    '--search',
    `updated:>=${sinceDate} mentions:${user}`,
  ]);

  if (!raw) return [];
  return (JSON.parse(raw) as GhItem[]).map((item) => mapItem(item, false));
}

export function fetchMentionedPrs(repo: string, since: string, user: string): GitHubItem[] {
  const sinceDate = since.slice(0, 10);
  const raw = ghExec([
    'pr',
    'list',
    '--repo',
    repo,
    '--state',
    'open',
    '--limit',
    '200',
    '--json',
    PR_FIELDS,
    '--search',
    `updated:>=${sinceDate} mentions:${user}`,
  ]);

  if (!raw) return [];
  return (JSON.parse(raw) as GhItem[]).map((item) => mapItem(item, true));
}

export function fetchComments(repo: string, number: number): GitHubComment[] {
  const raw = ghExec(['api', `repos/${repo}/issues/${number}/comments`, '--paginate']);

  if (!raw) return [];

  try {
    const items: GhComment[] = JSON.parse(`[${raw.split('\n').filter(Boolean).join(',')}]`).flat();
    return items.map((c) => ({
      author: c.user?.login ?? 'unknown',
      createdAt: c.created_at,
      body: c.body ?? '',
    }));
  } catch {
    return [];
  }
}
