import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  statePathFor,
  loadState,
  saveState,
  resolveSavedSince,
  selectSince,
  STATE_FILE_NAME,
} from '../src/state.js';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gh-tuner-state-'));
  path = join(dir, STATE_FILE_NAME);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('statePathFor', () => {
  it('puts the state file next to the config', () => {
    expect(statePathFor('/a/b/gh-tuner.yaml')).toBe(`/a/b/${STATE_FILE_NAME}`);
  });
});

describe('loadState', () => {
  it('returns empty state when the file is missing', () => {
    expect(loadState(path)).toEqual({});
  });

  it('returns empty state when the file is invalid JSON', () => {
    writeFileSync(path, 'not json');
    expect(loadState(path)).toEqual({});
  });
});

describe('saveState / resolveSavedSince', () => {
  it('saves the exact timestamp per mode', () => {
    const runAt = new Date('2026-11-17T19:45:12.000Z');
    saveState(path, 'issues', runAt);
    const state = loadState(path);
    expect(state.lastRun?.issues).toBe('2026-11-17T19:45:12.000Z');
    expect(state.lastRun?.prs).toBeUndefined();
    expect(resolveSavedSince(state, 'issues')?.toISOString()).toBe(runAt.toISOString());
    expect(resolveSavedSince(state, 'prs')).toBeNull();
  });

  it('keeps other modes when saving one', () => {
    saveState(path, 'prs', new Date('2026-11-10T10:00:00Z'));
    saveState(path, 'issues', new Date('2026-11-17T10:00:00Z'));
    const saved = JSON.parse(readFileSync(path, 'utf-8'));
    expect(saved.lastRun).toEqual({
      prs: '2026-11-10T10:00:00.000Z',
      issues: '2026-11-17T10:00:00.000Z',
    });
  });

  it('all mode saves both and resolves to the earlier one', () => {
    saveState(path, 'prs', new Date('2026-11-10T10:00:00Z'));
    saveState(path, 'issues', new Date('2026-11-17T10:00:00Z'));
    expect(resolveSavedSince(loadState(path), 'all')?.toISOString()).toBe(
      '2026-11-10T10:00:00.000Z',
    );
    saveState(path, 'all', new Date('2026-11-19T08:00:00Z'));
    expect(loadState(path).lastRun).toEqual({
      issues: '2026-11-19T08:00:00.000Z',
      prs: '2026-11-19T08:00:00.000Z',
    });
  });

  it('all mode returns null if either mode is missing', () => {
    saveState(path, 'issues', new Date('2026-11-17T10:00:00Z'));
    expect(resolveSavedSince(loadState(path), 'all')).toBeNull();
  });

  it('ignores invalid timestamps', () => {
    expect(resolveSavedSince({ lastRun: { issues: 'garbage' } }, 'issues')).toBeNull();
  });
});

describe('selectSince', () => {
  const fallbackDate = new Date('2026-11-17T00:00:00Z');
  const saved = new Date('2026-11-17T19:45:00Z');

  it('uses saved state when present', () => {
    let called = false;
    const result = selectSince(undefined, saved, () => {
      called = true;
      return fallbackDate;
    });
    expect(result).toEqual({ since: saved, source: 'state' });
    expect(called).toBe(false);
  });

  it('falls back to the schedule when state is missing', () => {
    expect(selectSince(undefined, null, () => fallbackDate)).toEqual({
      since: fallbackDate,
      source: 'schedule',
    });
  });

  it('--since overrides saved state', () => {
    const result = selectSince('2026-11-01', saved, () => fallbackDate);
    expect(result.source).toBe('flag');
    expect(result.since.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
});
