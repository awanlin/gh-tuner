import { execSync } from 'node:child_process';

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
  return execSync(`gh ${args.join(' ')}`, {
    encoding: 'utf-8',
    timeout: 30_000,
  }).trim();
}

const ISSUE_FIELDS = 'number,title,url,createdAt,updatedAt,labels,author,state';
const PR_FIELDS = 'number,title,url,createdAt,updatedAt,labels,author,state,reviewDecision,statusCheckRollup';

export function fetchIssues(repo: string, since: string): GitHubItem[] {
  const sinceDate = since.slice(0, 10);
  const raw = ghExec([
    'issue', 'list',
    '--repo', repo,
    '--state', 'open',
    '--limit', '200',
    '--json', ISSUE_FIELDS,
    '--search', `updated:>=${sinceDate}`,
  ]);

  if (!raw) return [];
  const items = JSON.parse(raw) as any[];

  return items.map(item => ({
    number: item.number,
    title: item.title,
    url: item.url,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    labels: (item.labels ?? []).map((l: any) => l.name),
    author: item.author?.login ?? 'unknown',
    state: item.state,
    isPr: false,
    comments: [],
  }));
}

export function fetchPrs(repo: string, since: string): GitHubItem[] {
  const sinceDate = since.slice(0, 10);
  const raw = ghExec([
    'pr', 'list',
    '--repo', repo,
    '--state', 'open',
    '--limit', '200',
    '--json', PR_FIELDS,
    '--search', `updated:>=${sinceDate}`,
  ]);

  if (!raw) return [];
  const items = JSON.parse(raw) as any[];

  return items.map(item => ({
    number: item.number,
    title: item.title,
    url: item.url,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    labels: (item.labels ?? []).map((l: any) => l.name),
    author: item.author?.login ?? 'unknown',
    state: item.state,
    isPr: true,
    comments: [],
  }));
}

export function fetchComments(repo: string, number: number): GitHubComment[] {
  const raw = ghExec([
    'api',
    `repos/${repo}/issues/${number}/comments`,
    '--paginate',
    '--jq', '.[].login = .user.login',
  ]);

  if (!raw) return [];

  try {
    const items = JSON.parse(`[${raw.split('\n').filter(Boolean).join(',')}]`).flat();
    return items.map((c: any) => ({
      author: c.user?.login ?? 'unknown',
      createdAt: c.created_at,
      body: c.body ?? '',
    }));
  } catch {
    return [];
  }
}
