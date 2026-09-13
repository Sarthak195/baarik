import type { EnforceabilityVerdict } from '../enforceability/types';
import type { FactView, RiskDriver } from '../risk/types';
import { computeLimitation, type LimitationClock, type LimitationRule } from './limitation';
import type {
  ForumRoute,
  ForumTable,
  LimitationTable,
  NextStep,
  RemedyLimitationRule,
  RemedySituation,
  RouteSignal,
  SituationFlag,
} from './types';

/**
 * Turn findings into the next thing a person can actually do.
 *
 * The function is deliberately dull, for the same reason `triageEnforceability` is: all
 * the legal content lives in `data/remedies/*.yaml`, so a reader can audit every forum,
 * fee and deadline against the Act without reading a line of TypeScript.
 *
 * `today` is a parameter. Lint forbids reading the ambient clock anywhere in `src/core`,
 * which is what makes a countdown testable on a date that has not happened yet.
 */
export function routeNextSteps(input: {
  readonly facts: FactView;
  readonly drivers: readonly RiskDriver[];
  readonly verdicts: readonly EnforceabilityVerdict[];
  readonly forums: ForumTable;
  readonly limitation: LimitationTable;
  readonly today: Date;
  readonly situation?: RemedySituation;
}): readonly NextStep[] {
  const situation = input.situation ?? NOTHING_STATED;
  const steps: NextStep[] = [];

  for (const forum of input.forums) {
    const signals = signalsFor(forum, input, situation);
    if (signals.length === 0) continue;

    const rule = ruleFor(input.limitation, forum.limitationRuleId);
    const start = situation.causeOfActionDate;
    const clock = rule === null || start === null ? null : clockFor(rule, start, input.today);

    steps.push({ forum, limitationRule: rule, clock, signals, priority: priorityOf(signals, clock) });
  }

  return [...steps].sort(
    (left, right) => right.priority - left.priority || left.forum.id.localeCompare(right.forum.id),
  );
}

/** Everything unstated. A reader who answers no questions still sees the free routes. */
const NOTHING_STATED: RemedySituation = {
  problem: null,
  causeOfActionDate: null,
  cannotAffordLawyer: false,
  prefersSettlement: false,
};

/**
 * Collect every reason this row was offered.
 *
 * A stated problem is read first and on its own: the reader's account of what went wrong
 * outranks a document classifier, so someone who says their salary is unpaid reaches the
 * labour route whether or not they uploaded their offer letter. Document-derived signals
 * are read only within the document types the row applies to, because a construct means
 * something different in a rent agreement than in a loan.
 *
 * A document type is never a signal by itself. Owning a loan agreement is not a reason to
 * be sent to a forum; something has to have gone wrong.
 */
function signalsFor(
  forum: ForumRoute,
  input: {
    readonly facts: FactView;
    readonly drivers: readonly RiskDriver[];
    readonly verdicts: readonly EnforceabilityVerdict[];
  },
  situation: RemedySituation,
): readonly RouteSignal[] {
  const triggers = forum.triggers;
  const signals: RouteSignal[] = [];

  const problem = situation.problem;
  if (problem !== null && triggers.problems.includes(problem)) {
    signals.push({ kind: 'problem', detail: problem });
  }

  if (appliesToDocument(forum, input.facts)) {
    for (const construct of triggers.constructs) {
      if (input.facts.construct(construct) === 'present') {
        signals.push({ kind: 'construct', detail: construct });
      }
    }
    for (const verdict of triggers.verdicts) {
      if (input.verdicts.some((found) => found.verdict === verdict)) {
        signals.push({ kind: 'verdict', detail: verdict });
      }
    }
    for (const severity of triggers.driverSeverities) {
      if (input.drivers.some((driver) => driver.severity === severity)) {
        signals.push({ kind: 'risk_driver', detail: severity });
      }
    }
  }

  const stated = statedFlags(situation);
  for (const flag of triggers.situations) {
    if (stated.includes(flag)) signals.push({ kind: 'situation', detail: flag });
  }

  if (triggers.universal) signals.push({ kind: 'universal', detail: forum.id });

  return signals;
}

function appliesToDocument(forum: ForumRoute, facts: FactView): boolean {
  const types = forum.triggers.documentTypes;
  return types.length === 0 || types.includes(facts.documentType);
}

function statedFlags(situation: RemedySituation): readonly SituationFlag[] {
  const flags: SituationFlag[] = [];
  if (situation.cannotAffordLawyer) flags.push('cannot_afford_lawyer');
  if (situation.prefersSettlement) flags.push('prefers_settlement');
  return flags;
}

function ruleFor(table: LimitationTable, ruleId: string | null): RemedyLimitationRule | null {
  if (ruleId === null) return null;
  return table.find((rule) => rule.id === ruleId) ?? null;
}

/**
 * Compute the countdown for a day-counted window as well as a month-counted one.
 *
 * The thirty days to appeal to a Grievance Appellate Committee are thirty days, not a
 * month; approximating one as the other hands the reader a date a forum would not
 * recognise, in the wrong direction for half the year. A day-counted rule therefore moves
 * the start forward by its days and asks for a zero-month period, so both kinds of
 * deadline come out of the one arithmetic that `limitation.ts` already tests.
 */
function clockFor(row: RemedyLimitationRule, causeOfActionDate: Date, today: Date): LimitationClock {
  const inMonths = row.period.unit === 'months';
  const rule: LimitationRule = {
    id: row.id,
    causeOfAction: row.causeOfAction,
    periodMonths: inMonths ? row.period.count : 0,
    statute: row.statute,
    statuteUrl: row.statuteUrl,
    condonationPossible: row.condonationPossible,
  };
  const start = inMonths ? causeOfActionDate : addDays(causeOfActionDate, row.period.count);

  return computeLimitation(rule, start, today);
}

const MS_PER_DAY = 86_400_000;

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

/**
 * Ordering weight, not legal significance.
 *
 * A row open to everybody is never about this dispute, so free legal aid and the Lok
 * Adalat sit below every forum that matched the facts even when the reader has asked for
 * them — they are ranked among themselves by whether they were asked for. Above them, a
 * route that matched more of the facts comes first, and then a deadline about to run: an
 * expired period is still reported, but it does not displace a route still open, because
 * condonation is a hope and an unexpired period is a right.
 */
function priorityOf(signals: readonly RouteSignal[], clock: LimitationClock | null): number {
  const matchedOnTheFacts = signals.filter((signal) => signal.kind !== 'universal').length;
  const openToEverybody = signals.some((signal) => signal.kind === 'universal');

  return openToEverybody ? matchedOnTheFacts : matchedOnTheFacts * 10 + urgencyWeight(clock);
}

function urgencyWeight(clock: LimitationClock | null): number {
  if (clock === null) return 0;
  switch (clock.urgency) {
    case 'urgent':
      return 3;
    case 'act_soon':
      return 2;
    case 'ample':
      return 1;
    case 'expired':
      return 0;
  }
}
