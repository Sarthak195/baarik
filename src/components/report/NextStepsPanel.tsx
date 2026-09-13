import type { JSX, ReactNode } from 'react';

import type { NextStep } from '@/core/remedies/types';
import type { Dictionary } from '@/i18n';
import { formatDate, formatDays, formatRupees } from '@/lib/format';
import { ClockIcon, ExternalIcon } from '@/components/ui/Icons';

export interface NextStepsPanelProps {
  readonly steps: readonly NextStep[];
  readonly dictionary: Dictionary;
}

/**
 * Where a reader can actually take this, what it costs, and how long they have.
 *
 * A report that ends in "consider seeking legal advice" is decoration. India has a
 * dense and largely unknown set of statutory forums — a consumer complaint is free up
 * to Rs 5,00,000 and may be filed where the complainant lives, whatever the contract's
 * exclusive-jurisdiction clause says — and the deadline is shown beside the forum
 * because a remedy that has run is not a remedy.
 *
 * Every row states what the statute provides. None of them says the reader has a claim
 * or predicts what a forum would do, and each carries the caveats that say what it
 * does not decide.
 */
export function NextStepsPanel({ steps, dictionary }: NextStepsPanelProps): JSX.Element {
  const { report } = dictionary;

  return (
    <section aria-labelledby="next-steps-heading">
      <h2 id="next-steps-heading" className="text-2xl">
        {report.nextStepsHeading}
      </h2>

      <ol className="mt-4 space-y-6">
        {steps.map((step) => (
          <li key={step.forum.id} className="border-rule bg-surface border p-5">
            <h3 className="text-xl">{step.forum.name}</h3>
            <p className="text-muted mt-1 max-w-[68ch]">{step.forum.handles}</p>
            <p className="text-faint mt-1 text-sm">{step.forum.statute}</p>

            {step.clock !== null && (
              <p className="border-rule-strong mt-4 flex items-start gap-2 border-l-4 py-1 pl-3 text-sm">
                <ClockIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong className="font-semibold">{report.deadlineLabel}:</strong>{' '}
                  {formatDate(step.clock.deadline)} —{' '}
                  {step.clock.daysRemaining >= 0
                    ? formatDays(step.clock.daysRemaining)
                    : 'this period has run'}
                  {step.clock.condonationPossible &&
                    '. The forum may still admit a late filing on sufficient cause.'}
                </span>
              </p>
            )}

            <dl className="mt-4 space-y-2 text-sm">
              <Detail label={report.feeLabel}>
                {step.forum.fee.summary}
                {step.forum.fee.freeForClaimsUpToInr !== null &&
                  ` (free up to ${formatRupees(step.forum.fee.freeForClaimsUpToInr)})`}
              </Detail>
              {step.forum.filingPlace !== null && (
                <Detail label={report.filingPlaceLabel}>{step.forum.filingPlace}</Detail>
              )}
              {step.forum.prerequisites.length > 0 && (
                <Detail label={report.prerequisitesLabel}>
                  <ul className="list-disc space-y-1 pl-4">
                    {step.forum.prerequisites.map((prerequisite) => (
                      <li key={prerequisite.step}>
                        {prerequisite.step}
                        {prerequisite.waitDays !== null &&
                          ` (${formatDays(prerequisite.waitDays)} to wait)`}
                      </li>
                    ))}
                  </ul>
                </Detail>
              )}
              <Detail label={report.entitlementsLabel}>
                <ul className="list-disc space-y-1 pl-4">
                  {step.forum.entitlements.map((entitlement) => (
                    <li key={entitlement.slice(0, 32)}>{entitlement}</li>
                  ))}
                </ul>
              </Detail>
              {step.forum.helpline !== null && (
                <Detail label={report.helplineLabel}>{step.forum.helpline}</Detail>
              )}
            </dl>

            <p className="mt-4">
              <a
                href={step.forum.portal.url}
                rel="noreferrer noopener"
                target="_blank"
                className="border-rule-strong inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-medium"
              >
                {report.openPortal} — {step.forum.portal.name}
                <ExternalIcon className="h-3.5 w-3.5" />
              </a>
            </p>

            <ul className="text-muted mt-4 list-disc space-y-1 pl-4 text-sm">
              {step.forum.caveats.map((caveat) => (
                <li key={caveat.slice(0, 32)}>{caveat}</li>
              ))}
            </ul>

            <p className="text-faint mt-3 font-mono text-xs">
              {report.whyOffered}: {step.signals.map((signal) => signal.detail).join(' · ')}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Detail({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-faint text-xs font-semibold tracking-wider uppercase sm:pt-0.5">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
