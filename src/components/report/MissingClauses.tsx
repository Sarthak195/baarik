import type { JSX } from 'react';

import type { RiskDriver, UnknownFact } from '@/core/risk/types';
import type { Dictionary } from '@/i18n';

export interface MissingClausesProps {
  readonly drivers: readonly RiskDriver[];
  readonly unknowns: readonly UnknownFact[];
  readonly dictionary: Dictionary;
}

/**
 * What the document does not say, and what could not be determined.
 *
 * These are two different failures and the page keeps them apart. An absence driver is
 * a protection the document is missing and the rubric expected — a deposit with no
 * refund date, a termination clause with no stated grounds. An unknown is a fact the
 * extractor could not settle, which becomes a numbered question rather than a silent
 * zero (ADR 0004): "the model did not find it" and "it is not there" must never
 * collapse into the same sentence, because only one of them is an accusation.
 */
export function MissingClauses({
  drivers,
  unknowns,
  dictionary,
}: MissingClausesProps): JSX.Element | null {
  const absences = drivers.filter((driver) => driver.tier === 'absence');
  if (absences.length === 0 && unknowns.length === 0) return null;

  return (
    <>
      {absences.length > 0 && (
        <section aria-labelledby="missing-heading">
          <h2 id="missing-heading" className="text-2xl">
            {dictionary.report.missingHeading}
          </h2>
          <ul className="mt-4 space-y-4">
            {absences.map((driver) => (
              <li key={driver.ruleId} className="border-rule-strong border-l-4 pl-4">
                <h3 className="text-lg">{driver.title}</h3>
                <p className="text-muted mt-1 max-w-[68ch]">{driver.explain}</p>
                {driver.askYourLawyer !== null && (
                  <p className="mt-2 text-sm">
                    <span className="text-faint">{dictionary.card.askAdvocate} </span>
                    {driver.askYourLawyer}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {unknowns.length > 0 && (
        <section aria-labelledby="questions-heading">
          <h2 id="questions-heading" className="text-2xl">
            {dictionary.report.questionsHeading}
          </h2>
          <ol className="marker:text-faint mt-4 list-decimal space-y-3 pl-5 marker:font-mono">
            {unknowns.map((unknown) => (
              <li key={unknown.ruleId} className="max-w-[68ch] pl-1">
                {unknown.question}
                <span className="text-faint ml-2 font-mono text-xs">
                  {unknown.missing.join(', ')}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
