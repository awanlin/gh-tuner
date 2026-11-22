/* eslint-disable @typescript-eslint/no-explicit-any */
import { ghExec, lastExecFailed } from '../github.js';
import { isBot } from '../filters.js';
import type { CapacityPr } from './stale.js';

export const BOT_QUERY = [
  '-author:app/renovate',
  '-author:app/dependabot',
  '-author:app/backstage-goalie',
  '-author:backstage-goalie',
  '-author:app/github-actions',
  '-author:backstage-service',
].join(' ');

const BOT_LOGINS = new Set([
  'renovate',
  'dependabot',
  'backstage-goalie',
  'backstage-service',
  'github-actions',
]);

export function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

function graphql(query: string, vars: Record<string, string>): any | null {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [k, v] of Object.entries(vars)) args.push('-f', `${k}=${v}`);
  const raw = ghExec(args);
  if (!raw || lastExecFailed()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.errors ? null : parsed.data;
  } catch {
    return null;
  }
}

export function searchCount(query: string): number | null {
  const data = graphql('query($q:String!){search(query:$q,type:ISSUE,first:1){issueCount}}', {
    q: query,
  });
  return data ? data.search.issueCount : null;
}

const PR_QUERY = `query($q:String!,$cursor:String){search(query:$q,type:ISSUE,first:25,after:$cursor){
pageInfo{hasNextPage endCursor}
nodes{... on PullRequest{number title url createdAt state isDraft
author{login __typename}
labels(first:20){nodes{name}}
assignees(first:10){nodes{login}}
files(first:50){nodes{path}}
reviews(last:50){nodes{author{login} state submittedAt}}
comments(last:50){nodes{author{login} createdAt}}
commits(last:1){nodes{commit{committedDate}}}
timelineItems(itemTypes:[ASSIGNED_EVENT],last:20){nodes{... on AssignedEvent{createdAt assignee{... on User{login}}}}}
}}}}`;

function mapNode(n: any): CapacityPr {
  const login: string = n.author?.login ?? 'ghost';
  const assignedAt: Record<string, string> = {};
  for (const e of n.timelineItems?.nodes ?? []) {
    const who = e?.assignee?.login;
    if (who && (!assignedAt[who] || e.createdAt > assignedAt[who])) assignedAt[who] = e.createdAt;
  }
  return {
    number: n.number,
    title: n.title,
    url: n.url,
    createdAt: n.createdAt,
    state: n.state,
    isDraft: n.isDraft ?? false,
    author: login,
    authorIsBot:
      n.author?.__typename === 'Bot' ||
      isBot(login.toLowerCase()) ||
      BOT_LOGINS.has(login.toLowerCase()),
    labels: (n.labels?.nodes ?? []).map((l: any) => l.name),
    assignees: (n.assignees?.nodes ?? []).map((a: any) => a.login),
    files: (n.files?.nodes ?? []).map((f: any) => f.path),
    reviews: (n.reviews?.nodes ?? []).map((r: any) => ({
      author: r.author?.login ?? 'ghost',
      state: r.state,
      submittedAt: r.submittedAt ?? '',
    })),
    comments: (n.comments?.nodes ?? []).map((c: any) => ({
      author: c.author?.login ?? 'ghost',
      createdAt: c.createdAt,
    })),
    lastCommitAt: n.commits?.nodes?.[0]?.commit?.committedDate ?? null,
    assignedAt,
  };
}

export function searchCapacityPrs(
  query: string,
  opts: { maxPages?: number } = {},
): CapacityPr[] | null {
  const out: CapacityPr[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < (opts.maxPages ?? 20); page++) {
    const data = graphql(PR_QUERY, cursor ? { q: query, cursor } : { q: query });
    if (!data) return null;
    out.push(...data.search.nodes.filter((n: any) => n && n.number).map(mapNode));
    if (!data.search.pageInfo.hasNextPage) return out;
    cursor = data.search.pageInfo.endCursor;
  }
  // Hit maxPages with more results remaining: never return a partial list.
  return null;
}

export function fetchRawFile(repo: string, path: string): string | null {
  const raw = ghExec([
    'api',
    `repos/${repo}/contents/${path}`,
    '-H',
    'Accept: application/vnd.github.raw',
  ]);
  return raw && !lastExecFailed() ? raw : null;
}
