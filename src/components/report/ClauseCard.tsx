import type { JSX, ReactNode } from 'react';

import type { Dictionary } from '@/i18n';
import type { ClauseView } from '@/lib/clause-view';
import { signalFor } from '@/lib/severity';
import { PerAnswerNote } from '@/components/disclaimer/PerAnswerNote';
import { QuoteIcon } from '@/components/ui/Icons';
import { ClauseActions } from './ClauseActions';
import { ClauseEnforceability } from './ClauseEnforceability';
import { SeverityChip } from './SeverityChip';
import { TaraazuMeter } from './TaraazuMeter';

/**
 * The clause card. Seven rows, in this order, for every clause, every document type
 * and every language. Nothing is conditional about the structure — a clause with no
 * statute row still has an ENFORCEABILITY row, and that row says so.
 *
 * The fixed order is the product's consistency claim made mechanical. Once a reader
 * has read one card they know where the quote is, where the plain sentence is, and
 * where the two disclosures live; by the fourth card they are reading only the rows
 * they care about. A layout that rearranged itself per clause would spend that saving
 * on nothing.
 */
export interface ClauseCardProps {
  readonly clause: ClauseView;
  readonly dictionary: Dictionary;
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="border-rule grid gap-1 border-t py-4 sm:grid-cols-[9.5rem_1fr] sm:gap-6">
      <dt className="text-faint text-xs font-semibold tracking-[0.12em] uppercase sm:pt-0.5">
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export function ClauseCard({ clause, dictionary }: ClauseCardProps): JSX.Element {
  const { finding, driver, enforceability, favours } = clause;
  const { card } = dictionary;
  const signal = signalFor({
    severity: driver?.severity ?? null,
    verdict: enforceability?.verdict ?? null,
    benefits: finding.benefits,
  });

  const headingId = `clause-heading-${finding.id}`;

  return (
    <article
      id={`clause-${finding.id}`}
      aria-labelledby={headingId}
      className="border-rule bg-surface scroll-mt-4 border px-4 py-5 sm:px-6"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SeverityChip signal={signal} dictionary={dictionary} />
        <p className="text-muted font-mono text-xs">
          {finding.clauseLabel === null
            ? card.unnumbered
            : `${card.clauseLabel} ${finding.clauseLabel}`}
          {finding.pageNumber !== null && ` · ${card.pageLabel} ${String(finding.pageNumber)}`}
        </p>
      </div>

      <h3 id={headingId} className="mt-3 text-xl">
        {driver?.title ?? finding.plainSummary}
      </h3>

      <dl className="mt-4">
        <Row label={card.says}>
          <blockquote className="border-rule-strong border-l-2 pl-3 font-mono text-[0.8125rem] leading-relaxed">
            <QuoteIcon className="text-faint mr-1 -mb-0.5 inline h-3.5 w-3.5" />
            {finding.location.matchedText}
          </blockquote>
          <p className="mt-2">
            <a
              href={`#span-${finding.id}`}
              className="text-accent inline-flex min-h-11 items-center text-sm underline decoration-dotted underline-offset-4"
            >
              {card.showInDocument}
            </a>
          </p>
        </Row>

        <Row label={card.means}>
          <p>{finding.plainSummary}</p>
        </Row>

        <Row label={card.matters}>
          <p>{clause.whyItMatters}</p>
          {driver !== null && <p className="text-muted mt-2 text-sm">{driver.explain}</p>}
        </Row>

        <Row label={card.enforceability}>
          <ClauseEnforceability
            verdict={enforceability}
            dictionary={dictionary}
            ruleId={driver?.ruleId ?? null}
          />
        </Row>

        <Row label={card.favours}>
          <TaraazuMeter favours={favours} dictionary={dictionary} />
        </Row>

        <Row label={card.actions}>
          <ClauseActions
            actions={clause.actions}
            dictionary={dictionary}
            askYourLawyer={driver?.askYourLawyer ?? null}
          />
        </Row>

        <Row label={card.confidence}>
          <p>{dictionary.confidence[clause.confidence]}</p>
          <p className="text-faint mt-1 text-sm">
            {card.matchMethod[finding.location.method]}
            {finding.location.method === 'fuzzy' &&
              ` · ${String(Math.round(finding.location.similarity * 100))}%`}
          </p>
        </Row>
      </dl>

      <PerAnswerNote dictionary={dictionary} className="border-rule mt-4 border-t pt-3" />
    </article>
  );
}
