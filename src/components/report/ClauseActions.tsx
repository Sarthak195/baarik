import type { JSX } from 'react';

import type { Dictionary } from '@/i18n';
import type { ClauseAction } from '@/lib/clause-view';

export interface ClauseActionsProps {
  readonly actions: readonly ClauseAction[];
  readonly dictionary: Dictionary;
  /** The question this clause raises for an advocate, from the rubric rule that fired. */
  readonly askYourLawyer: string | null;
}

/**
 * WHAT YOU CAN DO — ask, accept, or walk away, with the words to do it in.
 *
 * Replacement wording is supplied as selectable text rather than behind a copy button.
 * A copy button needs JavaScript to work at all, and a button that silently does
 * nothing is worse than no button; long-press to select is how text moves on the
 * phones this is built for anyway.
 *
 * Note what these are not. "Ask for the notice period to be mutual" is a negotiating
 * position, not a legal step, and nothing here tells the reader what will happen if
 * they take it. ADR 0005 forbids predicting the outcome, and the honest version is
 * more useful: here is the sentence, decide for yourself whether to send it.
 */
export function ClauseActions({
  actions,
  dictionary,
  askYourLawyer,
}: ClauseActionsProps): JSX.Element {
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {actions.map((action) => (
          <li key={action.kind + action.label.slice(0, 16)}>
            <p>
              <span className="border-rule-strong text-muted mr-2 border px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wider uppercase">
                {dictionary.actionKinds[action.kind]}
              </span>
              {action.label}
            </p>
            {action.replacementText !== null && (
              <figure className="mt-2">
                <figcaption className="text-faint text-xs tracking-wide uppercase">
                  {dictionary.card.copyWording}
                </figcaption>
                <p className="border-rule bg-sunken mt-1 border p-3 font-mono text-[0.8125rem] leading-relaxed">
                  {action.replacementText}
                </p>
              </figure>
            )}
          </li>
        ))}
      </ul>

      {askYourLawyer !== null && (
        <p className="text-muted text-sm">
          <span className="text-faint">{dictionary.card.askAdvocate} </span>
          {askYourLawyer}
        </p>
      )}
    </div>
  );
}
