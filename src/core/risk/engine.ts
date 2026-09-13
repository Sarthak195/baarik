import type { KnowledgeBase, RiskBand, RubricRule } from '../rubric/types';
import { evaluatePredicate, predicateInputs } from './predicates';
import { formatIndianNumber, renderExplanation } from './template';
import type { FactView, RiskDriver, RiskReport, Tier, UnknownFact } from './types';

/**
 * Turning extracted facts into a risk report.
 *
 * Every rule that applies to this document type is evaluated. A rule that answers
 * `true` becomes a driver; one that answers `unknown` becomes a question for the
 * reader's lawyer; one that answers `false` contributes nothing.
 *
 * That third outcome is the important one. Because the predicate layer refuses to
 * turn missing data into `false`, a document the extractor read badly produces a
 * short list of questions rather than a confidently low score — which is the honest
 * failure mode for a tool people may act on.
 */
export function scoreDocument(input: {
  readonly facts: FactView;
  readonly knowledge: KnowledgeBase;
  readonly language?: 'en' | 'hi';
}): RiskReport {
  const language = input.language ?? 'en';
  const fired: RiskDriver[] = [];
  const unknowns: UnknownFact[] = [];

  for (const rule of input.knowledge.rules) {
    if (rule.appliesTo.length > 0 && !rule.appliesTo.includes(input.facts.documentType)) continue;

    switch (evaluatePredicate(rule.when, input.facts)) {
      case 'true':
        fired.push(toDriver(rule, input.facts, language));
        break;
      case 'unknown':
        unknowns.push(toUnknown(rule, input.facts));
        break;
      case 'false':
        break;
    }
  }

  const tierTotals = capByTier(fired, input.knowledge.config.tierCaps);
  const raw = Object.values(tierTotals).reduce((sum, value) => sum + value, 0);

  // Saturating rather than linear, so a contract with twelve bad clauses cannot
  // overflow the scale and the top three drivers still dominate the number the reader
  // sees. Monotone in `raw` and bounded in [0, 100).
  const score = Math.round(100 * (1 - Math.exp(-raw / input.knowledge.config.saturation)));

  // Ties break on rule id so the output is byte-stable, which is what allows the
  // committed golden reports to be asserted exactly.
  const drivers = [...fired].sort(
    (left, right) => right.points - left.points || left.ruleId.localeCompare(right.ruleId),
  );

  return {
    score,
    band: bandFor(score, input.knowledge.config.bands),
    drivers,
    topDrivers: drivers.slice(0, 3),
    unknowns,
    tierTotals,
    rubricVersion: input.knowledge.version,
  };
}

function toDriver(rule: RubricRule, facts: FactView, language: 'en' | 'hi'): RiskDriver {
  return {
    ruleId: rule.id,
    tier: rule.tier,
    severity: rule.severity,
    title: rule.title,
    explain: renderExplanation(rule.explain[language], rule.id, facts, formatIndianNumber),
    points: rule.weight,
    evidence: rule.evidenceFrom === null ? null : (facts.evidenceFor(rule.evidenceFrom) ?? null),
    askYourLawyer: rule.askYourLawyer,
  };
}

/**
 * Turn an unevaluable rule into something the reader can use.
 *
 * A rule that could not be decided is not a dead end: it names exactly what the
 * document failed to say, which is a question worth putting to an advocate. Where the
 * rule author supplied `askYourLawyer`, that wording is used; otherwise the question
 * is built from the rule's own title.
 */
function toUnknown(rule: RubricRule, facts: FactView): UnknownFact {
  const missing = predicateInputs(rule.when).filter((name) => !isKnown(name, facts));

  return {
    ruleId: rule.id,
    missing,
    question: rule.askYourLawyer ?? `The document did not make this clear: ${rule.title}.`,
  };
}

function isKnown(name: string, facts: FactView): boolean {
  // A construct name will not resolve as a number; treating that as "known" keeps the
  // missing list to the fields genuinely absent rather than listing every input.
  const asNumber = facts.number(name as Parameters<FactView['number']>[0]);
  if (asNumber !== null) return true;
  return facts.construct(name as Parameters<FactView['construct']>[0]) !== 'unclear';
}

/**
 * Sum each tier's weights, capped.
 *
 * Without a cap, a document that trips eight absence rules would swamp a document
 * with one genuinely dangerous clause. The caps keep the tiers commensurable: no
 * single category can carry the score on its own.
 */
function capByTier(
  drivers: readonly RiskDriver[],
  caps: Readonly<Record<Tier, number>>,
): Readonly<Record<Tier, number>> {
  const totals: Record<Tier, number> = { asymmetry: 0, threshold: 0, construct: 0, absence: 0 };

  for (const driver of drivers) totals[driver.tier] += driver.points;
  for (const tier of Object.keys(totals) as Tier[]) {
    totals[tier] = Math.min(totals[tier], caps[tier]);
  }

  return totals;
}

function bandFor(
  score: number,
  bands: readonly { readonly upTo: number; readonly band: RiskBand }[],
): RiskBand {
  for (const entry of bands) {
    if (score <= entry.upTo) return entry.band;
  }
  return bands[bands.length - 1]?.band ?? 'severe';
}
