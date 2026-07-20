import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export interface RepoConfig {
  name: string;
  scope: 'all' | 'filtered';
  cadence?: 'weekly' | 'biweekly' | 'monthly';
  labels?: string[];
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
    repos: parsed.repos.map((r: Partial<RepoConfig>) => {
      const repo: RepoConfig = { name: r.name!, scope: r.scope! };
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
