import type { JSX } from 'react';

import { PerAnswerNote } from '@/components/disclaimer/PerAnswerNote';
import type { Dictionary } from '@/i18n';
import type { AnswerOutcome, AnswerView } from './types';

export interface AnswerPanelProps {
  readonly view: AnswerView;
  readonly dictionary: Dictionary;
}

/**
 * One answer, with the refusal treated as the important case.
 *
 * A reader who asks about provident fund and is handed a plausible invented figure has
 * been actively misled, and will act on it. A reader told the document is silent has
 * learned something true. So the two states are given equal visual weight, and the
 * silent one is never dressed up to look like an answer: no quote, no certainty, no
 * borrowed authority from the citation styling.
 */
export function AnswerPanel({ view, dictionary }: AnswerPanelProps): JSX.Element {
  return (
    <article className="border-rule bg-surface border p-5 sm:p-6">
      {/* The question is the heading. It reads naturally, it survives being printed or
          screenshotted on its own, and it gives the answer below something to be an
          answer to. */}
      <h3 className="text-lg leading-snug">{view.question}</h3>
      {body(view.outcome, dictionary)}
      <PerAnswerNote dictionary={dictionary} className="mt-4" />
    </article>
  );
}

function body(outcome: AnswerOutcome, dictionary: Dictionary): JSX.Element {
  const { report } = dictionary;

  switch (outcome.kind) {
    case 'grounded':
      return (
        <>
          <p className="mt-3 max-w-[68ch] leading-relaxed">{outcome.answer}</p>

          <figure className="mt-4">
            <figcaption className="text-faint text-xs font-semibold tracking-[0.14em] uppercase">
              {report.askCitedFrom}
            </figcaption>
            {/* The document's own characters, monospaced like every other quote in the
                report, so a reader can match it against the source below by eye. */}
            <blockquote className="border-rule-strong text-muted mt-1 border-l-2 pl-3 font-mono text-[0.8125rem] leading-relaxed">
              {outcome.quote}
            </blockquote>
          </figure>

          <p className="border-rule text-muted mt-3 inline-block border px-2.5 py-1 text-xs">
            {report.askCertainty[outcome.certainty]}
          </p>
        </>
      );

    case 'not_in_document':
      return (
        <>
          {refusal(report.askNotFound)}
          {/* The model's own words about which part of the question the document does
              not address. Safe to show precisely because it claims nothing about the
              document's contents. */}
          <p className="text-muted mt-3 max-w-[68ch] leading-relaxed">{outcome.answer}</p>
        </>
      );

    case 'unverified':
      // Nothing but the refusal. The quote offered was not in the document, which
      // means the prose around it cannot be checked either — and an unverifiable
      // sentence about someone's contract is worse than no sentence at all.
      return refusal(report.askNotFound);
  }
}

/**
 * The refusal, stated in words.
 *
 * The sentence carries the meaning; the rule and the sunken background only reinforce
 * it. Nothing here depends on the reader distinguishing two colours.
 */
function refusal(label: string): JSX.Element {
  return (
    <p className="border-l-rule-strong bg-sunken text-ink mt-3 border-l-4 px-4 py-3 font-medium">
      {label}
    </p>
  );
}
