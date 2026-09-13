import type { JSX } from 'react';

import type { GroundingStats } from '@/core/grounding/verify';
import type { RiskReport, Tier } from '@/core/risk/types';
import type { Dictionary } from '@/i18n';
import { formatNumber } from '@/lib/format';
import { GroundingBadge } from './GroundingBadge';

export interface ReportSummaryProps {
  readonly risk: RiskReport;
  readonly grounding: GroundingStats;
  readonly dictionary: Dictionary;
}

const TIERS: readonly Tier[] = ['asymmetry', 'threshold', 'construct', 'absence'];

/**
 * The score, and immediately underneath it, what the score is made of.
 *
 * A number on its own is the thing this product is trying not to be. The band is
 * stated in words because "78" means nothing to a first-time reader, the tier
 * breakdown shows which kind of problem the document has, and the three heaviest rules
 * are named — so the summary is a table of contents for the report rather than a
 * verdict on it.
 *
 * The tier bars are drawn from the same texture vocabulary as the Taraazu meter and
 * carry their numbers in text beside them, so nothing here depends on seeing colour.
 */
export function ReportSummary({ risk, grounding, dictionary }: ReportSummaryProps): JSX.Element {
  const maxTier = Math.max(...TIERS.map((tier) => risk.tierTotals[tier]), 1);

  return (
    <section aria-labelledby="summary-heading" className="border-rule bg-surface border p-5 sm:p-6">
      <h2 id="summary-heading" className="sr-only">
        {dictionary.report.riskHeading}
      </h2>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="font-serif text-5xl leading-none">{formatNumber(risk.score)}</p>
        <p className="text-muted text-sm">
          {dictionary.report.scoreLabel} · {dictionary.report.outOf}
        </p>
      </div>
      <p className="mt-3 max-w-[52ch] text-lg">{dictionary.bands[risk.band]}</p>

      <ul className="mt-6 space-y-2">
        {TIERS.map((tier) => (
          <li key={tier} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-3 text-sm">
            <span className="text-muted">{dictionary.report.tiers[tier]}</span>
            <span className="border-rule block h-3 border" aria-hidden="true">
              <span
                className="text-standard hatched block h-full"
                style={{ width: `${String(Math.round((risk.tierTotals[tier] / maxTier) * 100))}%` }}
              />
            </span>
            <span className="text-right font-mono">{formatNumber(risk.tierTotals[tier])}</span>
          </li>
        ))}
      </ul>

      <h3 className="text-faint mt-6 text-xs font-semibold tracking-[0.12em] uppercase">
        {dictionary.report.topDriversHeading}
      </h3>
      <ol className="mt-2 space-y-2">
        {risk.topDrivers.map((driver) => (
          <li key={driver.ruleId} className="text-sm">
            <span className="font-medium">{driver.title}</span>
            <span className="text-faint ml-2 font-mono text-xs">{driver.ruleId}</span>
          </li>
        ))}
      </ol>

      <div className="mt-6">
        <GroundingBadge stats={grounding} dictionary={dictionary} />
      </div>

      <p className="text-faint mt-3 font-mono text-xs">
        {dictionary.report.rubricLabel} {risk.rubricVersion}
      </p>
    </section>
  );
}
