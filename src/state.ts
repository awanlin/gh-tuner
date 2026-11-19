import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type StateMode = 'issues' | 'prs';

export interface TunerState {
  lastRun?: Partial<Record<StateMode, string>>;
}

export const STATE_FILE_NAME = '.gh-tuner-state.json';

/** The state file lives next to the config so each config keeps its own state. */
export function statePathFor(configPath: string): string {
  return join(dirname(configPath), STATE_FILE_NAME);
}

export function loadState(path: string): TunerState {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function modesFor(mode: StateMode | 'all'): StateMode[] {
  return mode === 'all' ? ['issues', 'prs'] : [mode];
}

/**
 * Returns the saved timestamp of the last successful run for a mode, or null.
 * For `all`, both modes need a saved run, and the earlier one is used so
 * nothing is skipped.
 */
export function resolveSavedSince(state: TunerState, mode: StateMode | 'all'): Date | null {
  const dates: Date[] = [];
  for (const m of modesFor(mode)) {
    const value = state.lastRun?.[m];
    if (!value) return null;
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    dates.push(date);
  }
  return new Date(Math.min(...dates.map((d) => d.getTime())));
}

export function saveState(path: string, mode: StateMode | 'all', runAt: Date): void {
  const state = loadState(path);
  const lastRun = { ...state.lastRun };
  for (const m of modesFor(mode)) {
    lastRun[m] = runAt.toISOString();
  }
  writeFileSync(path, JSON.stringify({ ...state, lastRun }, null, 2) + '\n');
}

export type SinceSource = 'flag' | 'state' | 'schedule';

/**
 * Picks the delta start: an explicit --since wins, then the saved state, then
 * the schedule fallback (`last-<day>`). The fallback is only called when needed.
 */
export function selectSince(
  flag: string | undefined,
  saved: Date | null,
  fallback: () => Date,
): { since: Date; source: SinceSource } {
  if (flag) return { since: new Date(flag), source: 'flag' };
  if (saved) return { since: saved, source: 'state' };
  return { since: fallback(), source: 'schedule' };
}
