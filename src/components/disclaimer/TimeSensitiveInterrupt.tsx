import Link from 'next/link';
import type { JSX } from 'react';

import type { LimitationClock } from '@/core/remedies/limitation';
import type { Dictionary } from '@/i18n';
import { withLanguage } from '@/i18n';
import { formatDate, formatDays } from '@/lib/format';
import type { OutputLanguage } from '@/schemas/document-type';
import { ClockIcon } from '@/components/ui/Icons';

export interface TimeSensitiveInterruptProps {
  readonly dictionary: Dictionary;
  readonly language: OutputLanguage;
  /** The clock that made this urgent. Rendered as a date, never as a countdown alone. */
  readonly clock: LimitationClock | null;
  /** Where "continue to the report" leads. */
  readonly continueHref: string;
}

/**
 * Tier three of three: the hard interrupt (ADR 0005).
 *
 * It fires when a limitation period is close or has run — an eviction, a notice
 * period, a two-year consumer window with three weeks left. At that point the most
 * useful thing this product can do is stop being a document reader and point at a free
 * advocate, because a report read next month is a report read after the deadline.
 *
 * The rule that governs it: **two actions, always.** Finding the District Legal
 * Services Authority, and continuing to the report. A one-action interrupt is a dark
 * pattern wearing a safety notice, and a reader who is stopped with no way forward
 * learns to distrust the next warning too. Both actions are links, so both work with
 * scripting unavailable, and neither traps focus because there is no focus trap.
 */
export function TimeSensitiveInterrupt({
  dictionary,
  language,
  clock,
  continueHref,
}: TimeSensitiveInterruptProps): JSX.Element {
  const { disclaimer } = dictionary;

  return (
    <section
      aria-labelledby="interrupt-heading"
      className="border-challenged/40 bg-challenged-bg max-w-[62ch] border-l-4 px-5 py-6 sm:px-7 sm:py-8"
    >
      <h1 id="interrupt-heading" className="text-challenged text-2xl sm:text-3xl">
        {disclaimer.interruptHeading}
      </h1>

      <p className="mt-4 text-[1.0625rem] leading-relaxed">{disclaimer.interruptBody}</p>

      {clock !== null && (
        <p className="border-challenged/30 mt-5 flex items-start gap-2 border-t pt-4 text-sm">
          <ClockIcon className="text-challenged mt-1 h-4 w-4 shrink-0" />
          <span>
            <strong className="font-semibold">{dictionary.report.deadlineLabel}:</strong>{' '}
            {formatDate(clock.deadline)}
            {clock.daysRemaining >= 0
              ? ` — ${formatDays(clock.daysRemaining)} left`
              : ' — this period has run'}
            . <span className="text-muted">{clock.statute}</span>
          </span>
        </p>
      )}

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href={withLanguage('/legal-aid', language)}
          className="bg-accent text-accent-ink inline-flex min-h-11 items-center justify-center px-5 text-center text-base font-medium"
        >
          {disclaimer.interruptFindDlsa}
        </Link>
        <Link
          href={continueHref}
          className="border-rule-strong text-ink inline-flex min-h-11 items-center justify-center border px-5 text-center text-base"
        >
          {disclaimer.interruptContinue}
        </Link>
      </div>

      <p className="text-muted mt-5 text-sm">{disclaimer.interruptHelpline}</p>
    </section>
  );
}
