// test/capacity-math.test.ts
import { describe, it, expect } from 'vitest';
import { computeWeekly, inProgressLimit, intakeAllowed } from '../src/capacity/math.js';

describe('computeWeekly — fair-share', () => {
  it('reproduces backstage 2026-11-22: min(64.3/6×1.25, 7.1×1.2) → 9', () => {
    const r = computeWeekly({
      model: 'fair-share',
      maintainerCount: 6,
      stretch: 1.25,
      paceMultiplier: 1.2,
      inflowPerWeek: 64.3,
      pacePerWeek: 7.1,
    });
    expect(r.weekly).toBe(9);
  });
  it('uses fair share when it is below the pace cap', () => {
    const r = computeWeekly({
      model: 'fair-share',
      maintainerCount: 6,
      stretch: 1.25,
      paceMultiplier: 1.2,
      inflowPerWeek: 24,
      pacePerWeek: 10,
    });
    expect(r.weekly).toBe(5); // 24/6×1.25 = 5
  });
  it('never returns less than 1 (zero pace)', () => {
    const r = computeWeekly({
      model: 'fair-share',
      maintainerCount: 6,
      stretch: 1.25,
      paceMultiplier: 1.2,
      inflowPerWeek: 60,
      pacePerWeek: 0,
    });
    expect(r.weekly).toBe(1);
  });
  it('throws on zero maintainers', () => {
    expect(() =>
      computeWeekly({
        model: 'fair-share',
        maintainerCount: 0,
        stretch: 1.25,
        paceMultiplier: 1.2,
        inflowPerWeek: 60,
        pacePerWeek: 5,
      }),
    ).toThrow(/maintainer/);
  });
});

describe('computeWeekly — gap', () => {
  const base = {
    model: 'gap' as const,
    maintainerCount: 6,
    stretch: 1.25,
    paceMultiplier: 1.2,
    inflowPerWeek: 20.2,
    pacePerWeek: 3.9,
  };
  it('reproduces community-plugins 2026-11-22: ceil(5.8−2.46)=4 within [2, 4.68] → 4', () => {
    const r = computeWeekly({
      ...base,
      pool: {
        sharedPerWeek: 5.23,
        ownPerWeek: 0.54,
        totalPerWeek: 5.8,
        othersRatePerWeek: 2.46,
      },
    });
    expect(r.weekly).toBe(4);
  });
  it('raises to the fair-share floor when others cover the pool', () => {
    const r = computeWeekly({
      ...base,
      pool: {
        sharedPerWeek: 5.23,
        ownPerWeek: 0.54,
        totalPerWeek: 5.8,
        othersRatePerWeek: 5.8,
      },
    });
    expect(r.weekly).toBe(2); // round((5.23/6 + 0.54) × 1.25) = 2
  });
  it('clamps to the pace ceiling', () => {
    const r = computeWeekly({
      ...base,
      pacePerWeek: 2.3,
      pool: {
        sharedPerWeek: 5.23,
        ownPerWeek: 0.54,
        totalPerWeek: 5.8,
        othersRatePerWeek: 0,
      },
    });
    expect(r.weekly).toBe(2); // floor(2.3×1.2)=2
  });
  it('throws without pool stats', () => {
    expect(() => computeWeekly(base)).toThrow(/pool/);
  });
});

describe('inProgressLimit', () => {
  it('backstage 9×2 = 18', () => expect(inProgressLimit(9, 2)).toBe(18));
  it('community-plugins ceil(4×1.5) = 6', () => expect(inProgressLimit(4, 1.5)).toBe(6));
});

describe('intakeAllowed', () => {
  it('is limited by remaining weekly budget', () =>
    expect(intakeAllowed({ weekly: 9, pickedUp7d: 7, limit: 18, activeCount: 5 })).toBe(2));
  it('is limited by open slots', () =>
    expect(intakeAllowed({ weekly: 9, pickedUp7d: 0, limit: 18, activeCount: 16 })).toBe(2));
  it('never goes negative', () =>
    expect(intakeAllowed({ weekly: 4, pickedUp7d: 6, limit: 6, activeCount: 8 })).toBe(0));
});

describe('computeWeekly — non-finite input', () => {
  const ok = {
    model: 'fair-share' as const,
    maintainerCount: 6,
    stretch: 1.25,
    paceMultiplier: 1.2,
    inflowPerWeek: 60,
    pacePerWeek: 5,
  };
  for (const k of ['maintainerCount', 'inflowPerWeek', 'pacePerWeek'] as const)
    it(`throws on NaN ${k}`, () =>
      expect(() => computeWeekly({ ...ok, [k]: NaN })).toThrow(/finite/));
});
