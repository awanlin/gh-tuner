import { execFileSync } from 'node:child_process';
import chalk from 'chalk';

export interface GitHubComment {
  author: string;
  createdAt: string;
  body: string;
}

export interface GitHubItem {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  labels: string[];
  author: string;
  state: string;
  isPr: boolean;
  comments: GitHubComment[];
}

export function ghExec(args: string[]): string {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf-8',
      timeout: 30_000,
    }).trim();
  } catch (err: unknown) {
    const stderr =
      err instanceof Error && 'stderr' in err ? String((err as { stderr: unknown }).stderr) : '';
    const message = stderr.trim() || (err instanceof Error ? err.message : 'unknown error');
    console.error(chalk.yellow(`  ⚠ gh ${args.slice(0, 3).join(' ')}... failed: ${message}`));
    return '';
  }
}

const ISSUE_FIELDS = 'number,title,url,createdAt,updatedAt,labels,author,state';
const PR_FIELDS =
  'number,title,url,createdAt,updatedAt,labels,author,state,reviewDecision,statusCheckRollup';

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
  state: string;
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
    state: item.state,
    isPr,
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
