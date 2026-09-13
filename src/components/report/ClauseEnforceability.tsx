import type { JSX } from 'react';

import type { EnforceabilityVerdict } from '@/core/enforceability/types';
import type { Dictionary } from '@/i18n';
import { Disclosure } from '@/components/ui/Disclosure';
import { ExternalIcon } from '@/components/ui/Icons';

export interface ClauseEnforceabilityProps {
  readonly verdict: EnforceabilityVerdict | null;
  readonly dictionary: Dictionary;
  /** The rubric rule that fired on the same clause, shown inside the disclosure. */
  readonly ruleId: string | null;
}

/**
 * The ENFORCEABILITY row, and the `[why?]` behind it.
 *
 * The row says what a statute provides. It never says the reader's clause is void:
 * "Indian law generally does not enforce a clause like this" is both the legally
 * defensible sentence under Advocates Act 1961 ss.29 and 33, and — because it comes
 * with a section number a reader can check in ten seconds — the more persuasive one.
 *
 * Where no statute row applies, the card says so in as many words. Silence would be
 * read as approval, and approval is exactly what this product must not imply.
 */
export function ClauseEnforceability({
  verdict,
  dictionary,
  ruleId,
}: ClauseEnforceabilityProps): JSX.Element {
  const { card } = dictionary;

  if (verdict === null) {
    return <p className="text-muted">{card.noEnforceabilityRow}</p>;
  }

  return (
    <div>
      <p className="font-medium">{dictionary.verdicts[verdict.verdict]}</p>
      <p className="text-muted mt-1 text-sm">
        {verdict.statute.act} — {verdict.statute.section}
      </p>

      <Disclosure label={card.why}>
        <p className="mb-3">{verdict.plainMeaning}</p>

        <h4 className="text-faint text-xs font-semibold tracking-wider uppercase">
          {card.statuteHeading}
        </h4>
        <blockquote className="border-rule-strong text-muted my-2 border-l-2 pl-3 font-mono text-[0.8125rem] leading-relaxed">
          {verdict.statute.text}
        </blockquote>
        <p>
          <a
            href={verdict.statute.url}
            rel="noreferrer noopener"
            target="_blank"
            className="text-accent inline-flex min-h-11 items-center gap-1.5 underline underline-offset-4"
          >
            {card.readStatute}
            <ExternalIcon className="h-3.5 w-3.5" />
          </a>
        </p>

        {verdict.authorities.length > 0 && (
          <>
            <h4 className="text-faint mt-3 text-xs font-semibold tracking-wider uppercase">
              {card.authoritiesHeading}
            </h4>
            <ul className="mt-2 space-y-2">
              {verdict.authorities.map((authority) => (
                <li key={authority.cite}>
                  <cite className="font-medium not-italic">{authority.cite}</cite>
                  <p className="text-muted">{authority.holding}</p>
                  {authority.url !== null && (
                    <a
                      href={authority.url}
                      rel="noreferrer noopener"
                      target="_blank"
                      className="text-accent inline-flex min-h-11 items-center gap-1.5 underline underline-offset-4"
                    >
                      {authority.url.replace(/^https:\/\//, '')}
                      <ExternalIcon className="h-3.5 w-3.5" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        <h4 className="text-faint mt-3 text-xs font-semibold tracking-wider uppercase">
          {card.caveatsHeading}
        </h4>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {verdict.caveats.map((caveat) => (
            <li key={caveat.slice(0, 32)}>{caveat}</li>
          ))}
        </ul>

        <p className="text-faint mt-3 font-mono text-xs">
          {card.ruleIdLabel}: {verdict.construct}
          {ruleId !== null && ` · ${ruleId}`}
        </p>
      </Disclosure>
    </div>
  );
}
