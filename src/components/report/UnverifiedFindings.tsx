import type { JSX } from 'react';

import type { RejectedFinding } from '@/core/grounding/verify';
import type { Dictionary } from '@/i18n';

export interface UnverifiedFindingsProps {
  readonly rejected: readonly RejectedFinding[];
  readonly dictionary: Dictionary;
}

/**
 * What failed verification, shown rather than deleted.
 *
 * A finding whose quote cannot be located in the document is not a finding, and it
 * scores nothing — but it is also evidence about the system, and the reader is
 * entitled to it. Rendering it here, visibly marked, under its own heading, with the
 * reason, is the difference between a tool that says "I checked" and one that can be
 * taken at its word.
 */
export function UnverifiedFindings({
  rejected,
  dictionary,
}: UnverifiedFindingsProps): JSX.Element | null {
  if (rejected.length === 0) return null;

  return (
    <section aria-labelledby="unverified-heading">
      <h2 id="unverified-heading" className="text-xl">
        {dictionary.report.unverifiedHeading}
      </h2>
      <p className="text-muted mt-2 max-w-[68ch] text-sm">{dictionary.report.unverifiedLede}</p>

      <ul className="border-rule mt-4 space-y-4 border border-dashed p-4">
        {rejected.map((entry) => (
          <li key={entry.finding.id}>
            <p className="text-faint font-mono text-xs uppercase">{entry.reason}</p>
            <blockquote className="border-rule-strong text-muted mt-1 border-l-2 pl-3 font-mono text-[0.8125rem] leading-relaxed line-through">
              {entry.finding.exactQuote}
            </blockquote>
            <p className="text-muted mt-1 text-sm">{entry.finding.plainSummary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
