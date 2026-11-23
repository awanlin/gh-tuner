export interface WeeklyInput {
  model: 'fair-share' | 'gap';
  maintainerCount: number;
  stretch: number;
  paceMultiplier: number;
  inflowPerWeek: number;
  pacePerWeek: number;
  pool?: {
    sharedPerWeek: number;
    ownPerWeek: number;
    totalPerWeek: number;
    othersRatePerWeek: number;
  };
}

const f1 = (n: number) => n.toFixed(1);

export function computeWeekly(input: WeeklyInput): {
  weekly: number;
  explain: string;
} {
  for (const k of ['maintainerCount', 'inflowPerWeek', 'pacePerWeek'] as const) {
    if (!Number.isFinite(input[k])) {
      throw new Error(`Capacity: ${k} must be a finite number`);
    }
  }
  if (input.maintainerCount <= 0) {
    throw new Error('Capacity: maintainer count must be > 0 (check ownersSection)');
  }
  const ceiling = input.pacePerWeek * input.paceMultiplier;

  if (input.model === 'fair-share') {
    const fair = (input.inflowPerWeek / input.maintainerCount) * input.stretch;
    const weekly = Math.max(1, Math.round(Math.min(fair, ceiling)));
    return {
      weekly,
      explain:
        `fair share ${f1(input.inflowPerWeek)}/${input.maintainerCount}×${input.stretch} = ${f1(fair)}, ` +
        `pace cap ${f1(input.pacePerWeek)}×${input.paceMultiplier} = ${f1(ceiling)} → ${weekly}/wk`,
    };
  }

  if (!input.pool) throw new Error('Capacity: gap model requires pool stats');
  const p = input.pool;
  const floor = Math.round(
    (p.sharedPerWeek / input.maintainerCount + p.ownPerWeek) * input.stretch,
  );
  const gap = Math.ceil(p.totalPerWeek - p.othersRatePerWeek);
  const weekly = Math.max(1, Math.min(Math.max(gap, floor), Math.floor(ceiling)));
  return {
    weekly,
    explain:
      `pool ${f1(p.totalPerWeek)}/wk − others ${p.othersRatePerWeek.toFixed(2)}/wk = gap ${gap}, ` +
      `floor ${floor}, ceiling ${f1(ceiling)} → ${weekly}/wk`,
  };
}

export function inProgressLimit(weekly: number, multiplier: number): number {
  return Math.ceil(weekly * multiplier);
}

export function intakeAllowed(args: {
  weekly: number;
  pickedUp7d: number;
  limit: number;
  activeCount: number;
}): number {
  return Math.max(0, Math.min(args.weekly - args.pickedUp7d, args.limit - args.activeCount));
}
