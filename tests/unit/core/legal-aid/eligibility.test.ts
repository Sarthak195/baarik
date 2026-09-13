import { describe, expect, it } from 'vitest';

import { checkLegalAidEligibility } from '@/core/legal-aid/eligibility';
import type { LegalAidProfile, LegalAidTable } from '@/core/legal-aid/types';

const TABLE: LegalAidTable = {
  stateCeilingsInr: { Maharashtra: 300_000, Karnataka: 300_000, Lakshadweep: 9_000 },
  supremeCourtCeilingInr: 500_000,
  fallbackCeilingInr: 300_000,
};

function profile(overrides: Partial<LegalAidProfile> = {}): LegalAidProfile {
  return { state: 'Karnataka', forum: 'other', ...overrides };
}

describe('checkLegalAidEligibility', () => {
  /**
   * This test is the module's reading of the statute. Section 12(c) entitles every
   * woman and every child irrespective of means, so income must not be consulted
   * before the categorical grounds. Getting the ordering wrong would deny aid to the
   * largest eligible group in the Act.
   */
  it('finds a woman eligible even when her income is far above every ceiling', () => {
    const result = checkLegalAidEligibility(
      profile({ isWomanOrChild: true, annualIncomeInr: 5_000_000 }),
      TABLE,
    );

    expect(result.eligible).toBe(true);
    expect(result.grounds).toContain('woman_or_child');
    expect(result.qualifiesRegardlessOfIncome).toBe(true);
  });

  it('finds an industrial workman eligible irrespective of income', () => {
    const result = checkLegalAidEligibility(
      profile({ isIndustrialWorkman: true, annualIncomeInr: 1_200_000 }),
      TABLE,
    );

    expect(result.eligible).toBe(true);
    expect(result.qualifiesRegardlessOfIncome).toBe(true);
  });

  it('reports every ground that applies, not merely the first', () => {
    const result = checkLegalAidEligibility(
      profile({
        isWomanOrChild: true,
        isScheduledCasteOrTribe: true,
        annualIncomeInr: 100_000,
      }),
      TABLE,
    );

    expect(result.grounds).toEqual(
      expect.arrayContaining(['woman_or_child', 'scheduled_caste_or_tribe', 'income_below_ceiling']),
    );
  });

  it('applies the state ceiling to the income ground', () => {
    const eligible = checkLegalAidEligibility(
      profile({ state: 'Karnataka', annualIncomeInr: 250_000 }),
      TABLE,
    );
    const notEligible = checkLegalAidEligibility(
      profile({ state: 'Karnataka', annualIncomeInr: 400_000 }),
      TABLE,
    );

    expect(eligible.grounds).toContain('income_below_ceiling');
    expect(notEligible.eligible).toBe(false);
    expect(notEligible.appliedCeilingInr).toBe(300_000);
  });

  it('applies the higher Supreme Court ceiling irrespective of state', () => {
    const result = checkLegalAidEligibility(
      profile({ state: 'Lakshadweep', forum: 'supreme_court', annualIncomeInr: 450_000 }),
      TABLE,
    );

    expect(result.appliedCeilingInr).toBe(500_000);
    expect(result.grounds).toContain('income_below_ceiling');
  });

  it('falls back rather than throwing when the state is unknown or absent', () => {
    const unknownState = checkLegalAidEligibility(
      profile({ state: 'Atlantis', annualIncomeInr: 100_000 }),
      TABLE,
    );
    const noState = checkLegalAidEligibility(
      profile({ state: null, annualIncomeInr: 100_000 }),
      TABLE,
    );

    // A stale state list must never be the reason someone is told they do not qualify.
    expect(unknownState.appliedCeilingInr).toBe(300_000);
    expect(unknownState.eligible).toBe(true);
    expect(noState.eligible).toBe(true);
  });

  it('distinguishes "does not qualify" from "has not answered yet"', () => {
    const unanswered = checkLegalAidEligibility(profile(), TABLE);
    const answered = checkLegalAidEligibility(profile({ annualIncomeInr: 900_000 }), TABLE);

    expect(unanswered.eligible).toBe(false);
    expect(unanswered.indeterminate).toBe(true);

    expect(answered.eligible).toBe(false);
    expect(answered.indeterminate).toBe(false);
  });

  it('treats an income exactly at the ceiling as within it', () => {
    const result = checkLegalAidEligibility(
      profile({ state: 'Maharashtra', annualIncomeInr: 300_000 }),
      TABLE,
    );
    expect(result.grounds).toContain('income_below_ceiling');
  });
});
