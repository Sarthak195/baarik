import { describe, expect, it } from 'vitest';

import { addMonths, computeLimitation, type LimitationRule } from '@/core/remedies/limitation';

/** Consumer Protection Act, 2019, s.69 — two years from the cause of action. */
const CPA_RULE: LimitationRule = {
  id: 'cpa-2019-s69',
  causeOfAction: 'The date the deficiency in service or unfair trade practice occurred',
  periodMonths: 24,
  statute: 'Consumer Protection Act, 2019, s.69',
  statuteUrl: 'https://www.indiacode.nic.in/',
  condonationPossible: true,
};

const utc = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe('addMonths', () => {
  it('adds whole months', () => {
    expect(addMonths(utc('2026-01-15'), 24).toISOString()).toBe('2028-01-15T00:00:00.000Z');
  });

  it('clamps to the end of a shorter target month instead of rolling over', () => {
    // Naive arithmetic gives 3 March and hands the user two extra days of limitation.
    expect(addMonths(utc('2026-01-31'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });

  it('clamps to 29 February in a leap year', () => {
    expect(addMonths(utc('2028-01-31'), 1).toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  it('crosses a year boundary correctly', () => {
    expect(addMonths(utc('2026-11-30'), 3).toISOString()).toBe('2027-02-28T00:00:00.000Z');
  });
});

describe('computeLimitation', () => {
  it('reports ample time when most of the period remains', () => {
    const clock = computeLimitation(CPA_RULE, utc('2026-01-01'), utc('2026-03-01'));

    expect(clock.urgency).toBe('ample');
    expect(clock.deadline.toISOString()).toBe('2028-01-01T00:00:00.000Z');
    expect(clock.daysRemaining).toBeGreaterThan(180);
  });

  it('escalates to act_soon inside six months', () => {
    const clock = computeLimitation(CPA_RULE, utc('2026-01-01'), utc('2027-09-01'));
    expect(clock.urgency).toBe('act_soon');
  });

  it('escalates to urgent inside a month', () => {
    const clock = computeLimitation(CPA_RULE, utc('2026-01-01'), utc('2027-12-15'));

    expect(clock.urgency).toBe('urgent');
    expect(clock.daysRemaining).toBeLessThan(30);
    expect(clock.daysRemaining).toBeGreaterThanOrEqual(0);
  });

  it('reports expiry with negative days once the period has run', () => {
    const clock = computeLimitation(CPA_RULE, utc('2026-01-01'), utc('2028-06-01'));

    expect(clock.urgency).toBe('expired');
    expect(clock.daysRemaining).toBeLessThan(0);
    // An expired clock is rarely the end of the road, and the result must say so.
    expect(clock.condonationPossible).toBe(true);
  });

  it('treats the deadline day itself as still open', () => {
    const clock = computeLimitation(CPA_RULE, utc('2026-01-01'), utc('2028-01-01'));

    expect(clock.daysRemaining).toBe(0);
    expect(clock.urgency).toBe('urgent');
  });

  it('ignores time of day, so a clock does not jump a day at midnight', () => {
    const lateEvening = new Date('2027-12-15T23:50:00.000Z');
    const earlyMorning = new Date('2027-12-15T00:10:00.000Z');

    expect(computeLimitation(CPA_RULE, utc('2026-01-01'), lateEvening).daysRemaining).toBe(
      computeLimitation(CPA_RULE, utc('2026-01-01'), earlyMorning).daysRemaining,
    );
  });

  it('carries the statute through so a deadline can be checked rather than trusted', () => {
    const clock = computeLimitation(CPA_RULE, utc('2026-01-01'), utc('2026-06-01'));
    expect(clock.statute).toBe('Consumer Protection Act, 2019, s.69');
    expect(clock.statuteUrl).toMatch(/^https:/);
  });
});
