import type {
  LegalAidGround,
  LegalAidProfile,
  LegalAidResult,
  LegalAidTable,
} from './types';

/**
 * Grounds under section 12 that do not depend on income.
 *
 * Kept as an explicit list rather than "everything except the income ground" so that
 * adding a ground later forces a decision about which side of this line it falls on.
 */
const INCOME_INDEPENDENT: readonly LegalAidGround[] = [
  'scheduled_caste_or_tribe',
  'trafficking_or_begar_victim',
  'woman_or_child',
  'mental_illness_or_disability',
  'undeserved_want',
  'industrial_workman',
  'in_custody',
];

/**
 * Decide whether a person is entitled to free legal services under s.12 of the
 * Legal Services Authorities Act, 1987.
 *
 * The categorical grounds are evaluated first and independently of means. A woman
 * earning above every ceiling in the country is still entitled under s.12(c), and
 * getting that ordering wrong would silently deny aid to the largest eligible group
 * in the statute — which is why there is a test named for exactly that case.
 */
export function checkLegalAidEligibility(
  profile: LegalAidProfile,
  table: LegalAidTable,
): LegalAidResult {
  const grounds: LegalAidGround[] = [];

  if (profile.isScheduledCasteOrTribe === true) grounds.push('scheduled_caste_or_tribe');
  if (profile.isTraffickingOrBegarVictim === true) grounds.push('trafficking_or_begar_victim');
  if (profile.isWomanOrChild === true) grounds.push('woman_or_child');
  if (profile.hasDisabilityOrMentalIllness === true) grounds.push('mental_illness_or_disability');
  if (profile.isUnderUndeservedWant === true) grounds.push('undeserved_want');
  if (profile.isIndustrialWorkman === true) grounds.push('industrial_workman');
  if (profile.isInCustody === true) grounds.push('in_custody');

  const appliedCeilingInr = ceilingFor(profile, table);

  const income = profile.annualIncomeInr;
  const incomeStated = income !== undefined && income !== null;
  if (incomeStated && income <= appliedCeilingInr) grounds.push('income_below_ceiling');

  const qualifiesRegardlessOfIncome = grounds.some((ground) => INCOME_INDEPENDENT.includes(ground));

  return {
    eligible: grounds.length > 0,
    grounds,
    qualifiesRegardlessOfIncome,
    appliedCeilingInr,
    // Saying "you do not qualify" to someone who simply has not answered yet would be
    // both wrong and discouraging, so an unanswered questionnaire is reported as such.
    indeterminate: grounds.length === 0 && !incomeStated,
  };
}

/**
 * The income ceiling that applies.
 *
 * Supreme Court matters carry their own, higher ceiling irrespective of state. An
 * unrecognised state falls back rather than throwing, because a stale state list must
 * never be the reason someone is told they do not qualify.
 */
function ceilingFor(profile: LegalAidProfile, table: LegalAidTable): number {
  if (profile.forum === 'supreme_court') return table.supremeCourtCeilingInr;
  if (profile.state === null) return table.fallbackCeilingInr;
  return table.stateCeilingsInr[profile.state] ?? table.fallbackCeilingInr;
}
