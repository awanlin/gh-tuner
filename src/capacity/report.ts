import type { CapacityConfig, RepoConfig } from '../config.js';
import { loadState, saveCapacityStats } from '../state.js';
import { BOT_QUERY, fetchRawFile, isoDaysAgo, searchCapacityPrs } from './data.js';
import { computeWeekly, inProgressLimit, intakeAllowed } from './math.js';
import { classifyPool, parseCodeowners, parseOwnersSection } from './owners.js';
import { classifyInProgress, isActive, type CapacityPr, type SlotStatus } from './stale.js';
import { computeRepoStats, configKey, isFresh } from './stats.js';

export interface ClassifiedPr {
  pr: CapacityPr;
  status: SlotStatus;
  reason: string;
}

export interface CapacityReport {
  repo: string;
  weekly: number;
  limit: number;
  activeCount: number;
  pickedUp7d: number;
  allowed: number;
  explain: string;
  inProgress: ClassifiedPr[];
  unassignedReviewed: CapacityPr[];
  candidates: CapacityPr[];
}

export function rankCandidates(prs: CapacityPr[], labels: string[]): CapacityPr[] {
  const hit = (p: CapacityPr) => (p.labels.some((l) => labels.includes(l)) ? 0 : 1);
  return [...prs].sort(
    (a, b) => hit(a) - hit(b) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function buildCapacityReport(args: {
  repo: RepoConfig & { capacity: CapacityConfig };
  user: string;
  now: Date;
  statePath: string;
  refresh: boolean;
  withCandidates: boolean;
}): CapacityReport | null {
  const { repo, user, now, statePath, refresh, withCandidates } = args;
  const cap = repo.capacity;
  const R = repo.name;

  const ownersMd = fetchRawFile('backstage/backstage', 'OWNERS.md');
  if (!ownersMd) return null;
  const maintainers = parseOwnersSection(ownersMd, cap.ownersSection);
  const mset = new Set(maintainers.map((m) => m.toLowerCase()));

  let codeowners: { ownerless: Set<string>; mine: Set<string> } | undefined;
  if (cap.model === 'gap') {
    const co = fetchRawFile(R, '.github/CODEOWNERS');
    if (!co) return null;
    codeowners = parseCodeowners(co, cap.codeownersTeam!, user);
  }

  const key = configKey(cap, maintainers);
  let stats = loadState(statePath).capacityStats?.[R];
  if (refresh || !isFresh(stats, key, now)) {
    const fresh = computeRepoStats({
      repo: R,
      cap,
      user,
      maintainers,
      codeowners,
      now,
    });
    if (!fresh) return null;
    saveCapacityStats(statePath, R, fresh);
    stats = fresh;
  }

  const { weekly, explain } = computeWeekly({
    model: cap.model,
    maintainerCount: maintainers.length,
    stretch: cap.stretch,
    paceMultiplier: cap.paceMultiplier,
    inflowPerWeek: stats!.inflowPerWeek,
    pacePerWeek: stats!.pacePerWeek,
    pool: stats!.pool,
  });
  const limit = inProgressLimit(weekly, cap.inProgressMultiplier);

  const owned = searchCapacityPrs(`repo:${R} is:pr is:open assignee:${user}`);
  if (!owned) return null;
  const inProgress = owned.map((pr) => ({
    pr,
    ...classifyInProgress(pr, user, now, cap.staleDays),
  }));
  const activeCount = inProgress.filter((c) => isActive(c.status)).length;

  const recent = searchCapacityPrs(
    `repo:${R} is:pr assignee:${user} updated:>=${isoDaysAgo(now, 7)}`,
  );
  if (!recent) return null;
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const me = user.toLowerCase();
  const pickedUp7d = recent.filter((p) => {
    const k = Object.keys(p.assignedAt).find((x) => x.toLowerCase() === me);
    return k !== undefined && new Date(p.assignedAt[k]).getTime() >= weekAgo;
  }).length;

  const unassignedReviewed = searchCapacityPrs(
    `repo:${R} is:pr is:open reviewed-by:${user} -assignee:${user} -author:${user}`,
  );
  if (!unassignedReviewed) return null;

  const allowed = intakeAllowed({ weekly, pickedUp7d, limit, activeCount });

  let candidates: CapacityPr[] = [];
  if (withCandidates) {
    const open = searchCapacityPrs(
      `repo:${R} is:pr is:open draft:false no:assignee -reviewed-by:${user} ${BOT_QUERY}`,
    );
    if (!open) return null;
    // Already-reviewed PRs belong only in "Reviewed but not assigned".
    const reviewed = new Set(unassignedReviewed.map((p) => p.number));
    const eligible = open.filter(
      (p) =>
        !reviewed.has(p.number) &&
        !p.authorIsBot &&
        !mset.has(p.author.toLowerCase()) &&
        p.author.toLowerCase() !== me &&
        (!codeowners || classifyPool(p.files, codeowners) !== null),
    );
    const ranked = rankCandidates(eligible, repo.labels ?? []);
    candidates = ranked.slice(0, allowed + 5);
  }

  return {
    repo: R,
    weekly,
    limit,
    activeCount,
    pickedUp7d,
    allowed,
    explain,
    inProgress,
    unassignedReviewed,
    candidates,
  };
}
