import type { RepoConfig, ScheduleEntry } from './config.js';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const DAY_INDICES: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

export function resolveSince(sinceRef: string, today: Date = new Date()): Date {
  const match = sinceRef.match(/^last-(\w+)$/);
  if (!match) {
    throw new Error(`Invalid since reference: ${sinceRef}. Expected format: last-<dayname>`);
  }

  const targetDay = DAY_INDICES[match[1]];
  if (targetDay === undefined) {
    throw new Error(`Unknown day name in since reference: ${match[1]}`);
  }

  const currentDay = today.getUTCDay();
  let daysBack = currentDay - targetDay;
  if (daysBack <= 0) {
    daysBack += 7;
  }

  const result = new Date(today);
  result.setUTCDate(result.getUTCDate() - daysBack);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

export function getScheduleForDay(
  schedule: Record<string, ScheduleEntry>,
  today: Date = new Date(),
): ScheduleEntry | null {
  const dayName = DAYS[today.getUTCDay()];
  return schedule[dayName] ?? null;
}

export function isRepoIncluded(
  repo: RepoConfig,
  startDate: string,
  today: Date = new Date(),
): boolean {
  if (repo.scope === 'filtered') return true;

  const cadence = repo.cadence ?? 'weekly';
  if (cadence === 'weekly') return true;

  const start = new Date(startDate);
  start.setUTCHours(0, 0, 0, 0);
  const current = new Date(today);
  current.setUTCHours(0, 0, 0, 0);

  if (cadence === 'biweekly') {
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeksDiff = Math.floor((current.getTime() - start.getTime()) / msPerWeek);
    return weeksDiff % 2 === 0;
  }

  if (cadence === 'monthly') {
    const startMonth = start.getUTCFullYear() * 12 + start.getUTCMonth();
    const currentMonth = current.getUTCFullYear() * 12 + current.getUTCMonth();
    const monthsDiff = currentMonth - startMonth;

    if (monthsDiff === 0) {
      const startWeek = getWeekOfMonth(start);
      const currentWeek = getWeekOfMonth(current);
      return currentWeek === startWeek;
    }

    return getWeekOfMonth(current) === getWeekOfMonth(start);
  }

  return true;
}

function getWeekOfMonth(date: Date): number {
  return Math.floor((date.getUTCDate() - 1) / 7);
}
