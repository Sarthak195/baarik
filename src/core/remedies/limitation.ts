/**
 * The limitation clock.
 *
 * A remedy a user cannot reach any more is not a remedy. Consumer complaints under
 * s.69 of the Consumer Protection Act, 2019 must be filed within two years of the
 * cause of action; RERA, labour and cheque-dishonour routes each carry their own
 * periods. Telling someone which forum to approach without telling them how long they
 * have left is the most common way a "next steps" feature becomes useless.
 *
 * `today` is always a parameter. The lint configuration forbids reading the ambient
 * clock anywhere in `src/core`, which is what makes every case below testable.
 */

export interface LimitationRule {
  readonly id: string;
  /** Human-readable description of what starts the clock. */
  readonly causeOfAction: string;
  readonly periodMonths: number;
  readonly statute: string;
  readonly statuteUrl: string;
  /**
   * Whether the forum can excuse a late filing. Most Indian consumer and service
   * forums can, on sufficient cause, so an expired clock is rarely the end of the
   * road — and saying otherwise would be both wrong and discouraging.
   */
  readonly condonationPossible: boolean;
}

export type LimitationUrgency =
  /** More than six months remain. */
  | 'ample'
  /** Between one and six months remain; start gathering documents. */
  | 'act_soon'
  /** Under a month remains. */
  | 'urgent'
  /** The period has run. Condonation may still be available. */
  | 'expired';

export interface LimitationClock {
  readonly ruleId: string;
  readonly deadline: Date;
  readonly daysRemaining: number;
  readonly urgency: LimitationUrgency;
  readonly condonationPossible: boolean;
  readonly statute: string;
  readonly statuteUrl: string;
}

const MS_PER_DAY = 86_400_000;

/**
 * Compute how long is left to bring a claim.
 *
 * Both dates are reduced to UTC midnight before subtracting, so a clock computed at
 * 23:50 and one computed at 00:10 the next morning do not differ by a whole day for
 * the wrong reason.
 *
 * @param causeOfActionDate When the clock started — typically the breach, not the
 *   date the agreement was signed.
 * @param today Injected, never read from the environment.
 */
export function computeLimitation(
  rule: LimitationRule,
  causeOfActionDate: Date,
  today: Date,
): LimitationClock {
  const deadline = addMonths(causeOfActionDate, rule.periodMonths);
  const daysRemaining = Math.floor((utcMidnight(deadline) - utcMidnight(today)) / MS_PER_DAY);

  return {
    ruleId: rule.id,
    deadline,
    daysRemaining,
    urgency: urgencyFor(daysRemaining),
    condonationPossible: rule.condonationPossible,
    statute: rule.statute,
    statuteUrl: rule.statuteUrl,
  };
}

function urgencyFor(daysRemaining: number): LimitationUrgency {
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining < 30) return 'urgent';
  if (daysRemaining < 180) return 'act_soon';
  return 'ample';
}

/**
 * Add calendar months, clamping to the end of a shorter target month.
 *
 * 31 January plus one month is 28 February (29 in a leap year), not 3 March. Naive
 * date arithmetic rolls over and would quietly hand the user two extra days of
 * limitation that a court would not.
 */
export function addMonths(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const day = from.getUTCDate();

  const targetMonthStart = new Date(Date.UTC(year, month + months, 1));
  const daysInTargetMonth = new Date(
    Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      targetMonthStart.getUTCFullYear(),
      targetMonthStart.getUTCMonth(),
      Math.min(day, daysInTargetMonth),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

function utcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
