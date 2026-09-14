import type { QaAnswer } from '@/schemas/qa-answer';

/**
 * What the report page renders after a question, once the answer has been checked.
 *
 * Deliberately not `QaAnswer`. That type is what a model asserted; this one is what
 * survived verification, and keeping them apart is what stops an unchecked quote
 * reaching a component by accident. By the time an outcome exists, `locateQuote` has
 * already had its say and the model's own copy of the passage has been replaced by the
 * document's characters.
 *
 * A discriminated union rather than a bag of nullable fields, because the three states
 * are genuinely different things to say to a reader — "here is the line", "your
 * document does not deal with this", and "nothing here could be traced to your
 * document" — and a component that has to reconstruct which one it is from four nulls
 * will eventually get it wrong in the direction that invents a citation.
 */
export type AnswerOutcome =
  | {
      readonly kind: 'grounded';
      readonly answer: string;
      /**
       * Verbatim from the document, taken from the located span rather than from the
       * model's reply. A quote is only a quote if it is the reader's own text.
       */
      readonly quote: string;
      readonly certainty: QaAnswer['certainty'];
    }
  /** The document is silent on the point. A real answer, and often the useful one. */
  | { readonly kind: 'not_in_document'; readonly answer: string }
  /**
   * The model claimed the document answers the question but the passage it offered is
   * not in the document. Carries no prose on purpose: an unlocatable citation means
   * the surrounding sentences cannot be trusted either, and a legal claim nobody can
   * point at is exactly what this product exists to refuse.
   */
  | { readonly kind: 'unverified' };

export interface AnswerView {
  /** Echoed back so the answer is legible on its own, e.g. when printed. */
  readonly question: string;
  readonly outcome: AnswerOutcome;
}

/**
 * Why a question produced no answer at all.
 *
 * A closed set, because it travels in the URL after the redirect. Anything richer
 * would mean putting the reader's question, or a passage of their contract, into a
 * query string — and query strings reach browser history, `Referer` headers and every
 * proxy log between here and them.
 */
export type AskError = 'empty' | 'too_long' | 'unavailable';

const ASK_ERRORS: readonly AskError[] = ['empty', 'too_long', 'unavailable'];

/** Anything else in the query string is nothing at all, never an error page. */
export function parseAskError(value: string | string[] | undefined): AskError | null {
  const candidate = typeof value === 'string' ? value : value?.[0];
  return ASK_ERRORS.find((error) => error === candidate) ?? null;
}
