import type { JSX } from 'react';

import type { Dictionary } from '@/i18n';
import type { OutputLanguage } from '@/schemas/document-type';
import { askErrorMessage } from './messages';
import type { AskError } from './types';

export interface AskFormProps {
  readonly dictionary: Dictionary;
  readonly language: OutputLanguage;
  readonly reportId: string;
  /** The server's own ceiling, so the field advertises exactly what the route enforces. */
  readonly maxQuestionChars: number;
  /** Set when the previous attempt was refused. */
  readonly error?: AskError | undefined;
}

const HINT_ID = 'ask-hint';
const ERROR_ID = 'ask-error';

/**
 * The question box.
 *
 * A plain `<form method="post">` for the same reason `PasteForm` is one: there is no
 * `onSubmit`, no fetch and no hydration on this path, so it works on a handset whose
 * browser never received the bundle. Question answering is the feature most likely to
 * be reached for by someone who has just been told something alarming about their own
 * contract, and that is not the moment to require JavaScript.
 *
 * `required` and `maxLength` are the browser's own validation, which also needs no
 * script: they produce a message in the reader's locale, announced by their screen
 * reader, before a request is made. The server repeats both checks, because a form is
 * a suggestion and a route handler is a boundary.
 */
export function AskForm({
  dictionary,
  language,
  reportId,
  maxQuestionChars,
  error,
}: AskFormProps): JSX.Element {
  const { report } = dictionary;

  return (
    <form
      action="/api/ask"
      method="post"
      className="border-rule bg-surface space-y-4 border p-5 sm:p-6"
    >
      {/* Which report to answer from, and in which language. Hidden rather than
          inferred from a header or a cookie: a form that carries its own context is a
          form that still works when it is the only thing the browser can do. */}
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="lang" value={language} />

      <div>
        <label htmlFor="question" className="block text-base font-medium">
          {report.askLabel}
        </label>
        <p id={HINT_ID} className="text-muted mt-1 max-w-[68ch] text-sm">
          {report.askLede}
        </p>
        <input
          type="text"
          id="question"
          name="question"
          required
          maxLength={maxQuestionChars}
          placeholder={report.askPlaceholder}
          // The hint is part of the field's description, not decoration around it: it
          // is where the reader is told the answer comes only from their document.
          aria-describedby={error === undefined ? HINT_ID : `${HINT_ID} ${ERROR_ID}`}
          aria-invalid={error !== undefined}
          className="border-rule-strong bg-paper mt-2 block min-h-12 w-full border px-3 text-base"
        />
      </div>

      {error !== undefined && (
        // Carried by a four-pixel left rule as well as by colour, so the refusal is
        // still a refusal in greyscale, in print, and to anyone who does not see the
        // difference between amber and parchment.
        <p
          id={ERROR_ID}
          role="alert"
          className="border-l-risky bg-risky-bg text-ink border-l-4 px-4 py-3 text-sm"
        >
          {askErrorMessage(error, language)}
        </p>
      )}

      <button
        type="submit"
        className="bg-accent text-accent-ink inline-flex min-h-12 w-full items-center justify-center px-6 text-base font-medium sm:w-auto"
      >
        {report.askSubmit}
      </button>
    </form>
  );
}
