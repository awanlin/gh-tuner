import type { CapacityConfig } from '../config.js';
import { BOT_QUERY, isoDaysAgo, searchCapacityPrs, searchCount } from './data.js';
import { classifyPool } from './owners.js';

export interface RepoStats {
  computedAt: string;
  configKey: string;
  inflowPerWeek: number;
  pacePerWeek: number;
  pool?: {
    sharedPerWeek: number;
    ownPerWeek: number;
    totalPerWeek: number;
    othersRatePerWeek: number;
  };
}

const WEEK_MS = 7 * 86_400_000;

export function configKey(cap: CapacityConfig, maintainers: string[]): string {
  return JSON.stringify({ cap, maintainers: [...maintainers].sort() });
}

export function isFresh(stats: RepoStats | undefined, key: string, now: Date): boolean {
  if (!stats || stats.configKey !== key) return false;
  const age = now.getTime() - new Date(stats.computedAt).getTime();
  return age >= 0 && age < WEEK_MS;
}

export function computeRepoStats(args: {
  repo: string;
  cap: CapacityConfig;
  user: string;
  maintainers: string[];
  codeowners?: { ownerless: Set<string>; mine: Set<string> };
  now: Date;
}): RepoStats | null {
  const { repo, cap, user, maintainers, codeowners, now } = args;
  const inflowSince = isoDaysAgo(now, cap.inflowWeeks * 7);
  const inflow = searchCount(`repo:${repo} is:pr created:>=${inflowSince} ${BOT_QUERY}`);
  if (inflow === null) return null;
  const pace = searchCount(
    `repo:${repo} is:pr reviewed-by:${user} -author:${user} created:>=${isoDaysAgo(now, cap.paceWeeks * 7)} ${BOT_QUERY}`,
  );
  if (pace === null) return null;

  const stats: RepoStats = {
    computedAt: now.toISOString(),
    configKey: configKey(cap, maintainers),
    inflowPerWeek: inflow / cap.inflowWeeks,
    pacePerWeek: pace / cap.paceWeeks,
  };

  if (cap.model === 'gap') {
    if (!codeowners) throw new Error(`Capacity: gap model for ${repo} needs CODEOWNERS`);
    const prs = searchCapacityPrs(`repo:${repo} is:pr created:>=${inflowSince} ${BOT_QUERY}`, {
      maxPages: 40,
    });
    if (prs === null) return null;
    const m = new Set(maintainers.map((x) => x.toLowerCase()));
    let shared = 0,
      own = 0,
      others = 0;
    for (const pr of prs) {
      if (pr.authorIsBot || m.has(pr.author.toLowerCase())) continue;
      const kind = classifyPool(pr.files, codeowners);
      if (!kind) continue;
      if (kind === 'mine') own++;
      else shared++;
      const reviewers = new Set(pr.reviews.map((r) => r.author.toLowerCase()));
      for (const r of reviewers) if (m.has(r) && r !== user.toLowerCase()) others++;
    }
    const w = cap.inflowWeeks;
    stats.pool = {
      sharedPerWeek: shared / w,
      ownPerWeek: own / w,
      totalPerWeek: (shared + own) / w,
      othersRatePerWeek: others / w,
    };
  }
  return stats;
}
