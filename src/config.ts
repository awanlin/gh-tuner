import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export type ScopeValue = 'all' | 'filtered';

export interface RepoConfig {
  name: string;
  scope: ScopeValue | { issues: ScopeValue; prs: ScopeValue };
  cadence?: 'weekly' | 'biweekly' | 'monthly';
  labels?: string[];
}

export function getScope(repo: RepoConfig, mode: 'issues' | 'prs'): ScopeValue {
  if (typeof repo.scope === 'string') return repo.scope;
  return repo.scope[mode];
}

export interface ScheduleEntry {
  mode: 'issues' | 'prs';
  since: string;
}

export interface FilterConfig {
  humanEngagementOnly: boolean;
  excludeAwaitingOthers: boolean;
  excludeAuthor: boolean;
  excludeDrafts: boolean;
  excludeChangesRequestedByOthers: boolean;
  excludeAssigned: boolean;
}

export interface TunerConfig {
  user: string;
  startDate: string;
  repos: RepoConfig[];
  schedule: Record<string, ScheduleEntry>;
  securityKeywords: string[];
  filters: FilterConfig;
}

function validateScope(
  scope: unknown,
  repoName: string,
): ScopeValue | { issues: ScopeValue; prs: ScopeValue } {
  const validValues = ['all', 'filtered'];
  if (typeof scope === 'string') {
    if (!validValues.includes(scope)) {
      throw new Error(`Invalid scope "${scope}" for repo ${repoName}. Must be "all" or "filtered"`);
    }
    return scope as ScopeValue;
  }
  if (typeof scope === 'object' && scope !== null) {
    const obj = scope as Record<string, unknown>;
    if (!('issues' in obj) || !('prs' in obj)) {
      throw new Error(`Object scope for repo ${repoName} must have both "issues" and "prs" keys`);
    }
    if (!validValues.includes(obj.issues as string) || !validValues.includes(obj.prs as string)) {
      throw new Error(
        `Invalid scope values for repo ${repoName}. Each must be "all" or "filtered"`,
      );
    }
    return { issues: obj.issues as ScopeValue, prs: obj.prs as ScopeValue };
  }
  throw new Error(
    `Invalid scope for repo ${repoName}. Must be a string or object with issues/prs keys`,
  );
}

export function loadConfig(configPath: string): TunerConfig {
  const raw = readFileSync(configPath, 'utf-8');
  const parsed = parse(raw);

  if (!parsed.user) {
    throw new Error('Config missing required field: user');
  }
  if (!parsed.startDate) {
    throw new Error('Config missing required field: startDate');
  }
  if (!Array.isArray(parsed.repos)) {
    throw new Error('Config missing required field: repos');
  }
  if (!parsed.schedule || typeof parsed.schedule !== 'object') {
    throw new Error('Config missing required field: schedule');
  }
  if (!parsed.filters || typeof parsed.filters !== 'object') {
    throw new Error('Config missing required field: filters');
  }

  return {
    user: parsed.user,
    startDate: parsed.startDate,
    repos: parsed.repos.map((r: Partial<RepoConfig> & { name: string; scope: unknown }) => {
      const repo: RepoConfig = { name: r.name, scope: validateScope(r.scope, r.name) };
      if (r.cadence) repo.cadence = r.cadence;
      if (r.labels) repo.labels = r.labels;
      return repo;
    }),
    schedule: parsed.schedule,
    securityKeywords: parsed.securityKeywords ?? [],
    filters: {
      humanEngagementOnly: parsed.filters.humanEngagementOnly ?? true,
      excludeAwaitingOthers: parsed.filters.excludeAwaitingOthers ?? true,
      excludeAuthor: parsed.filters.excludeAuthor ?? true,
      excludeDrafts: parsed.filters.excludeDrafts ?? true,
      excludeChangesRequestedByOthers: parsed.filters.excludeChangesRequestedByOthers ?? true,
      excludeAssigned: parsed.filters.excludeAssigned ?? false,
    },
  };
}
