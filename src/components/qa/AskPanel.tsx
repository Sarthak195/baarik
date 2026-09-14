import type { JSX } from 'react';

import type { Dictionary } from '@/i18n';
import type { OutputLanguage } from '@/schemas/document-type';
import { AnswerPanel } from './AnswerPanel';
import { AskForm } from './AskForm';
import type { AnswerView, AskError } from './types';

export interface AskPanelProps {
  readonly dictionary: Dictionary;
  readonly language: OutputLanguage;
  readonly reportId: string;
  readonly maxQuestionChars: number;
  /** The answer to the question just asked, when there is one. */
  readonly answer?: AnswerView | undefined;
  readonly error?: AskError | undefined;
}

/** The redirect from `/api/ask` lands on this, so the reader sees the answer, not the top. */
export const ASK_SECTION_ID = 'ask';

/**
 * Capability 4 of the brief, on the page.
 *
 * The answer is rendered above the form rather than below it. After a submission the
 * browser arrives at this section from the top, and the first thing it should show is
 * what was asked and what came back — not an empty box that looks as though nothing
 * happened.
 */
export function AskPanel({
  dictionary,
  language,
  reportId,
  maxQuestionChars,
  answer,
  error,
}: AskPanelProps): JSX.Element {
  const headingId = `${ASK_SECTION_ID}-heading`;

  return (
    <section
      id={ASK_SECTION_ID}
      aria-labelledby={headingId}
      className="scroll-mt-4 space-y-5"
      // Reachable by keyboard so the fragment link lands somewhere focusable, and
      // ignored by the tab order so it does not add a stop for everyone else.
      tabIndex={-1}
    >
      <h2 id={headingId} className="text-2xl">
        {dictionary.report.askHeading}
      </h2>

      {answer !== undefined && <AnswerPanel view={answer} dictionary={dictionary} />}

      <AskForm
        dictionary={dictionary}
        language={language}
        reportId={reportId}
        maxQuestionChars={maxQuestionChars}
        error={error}
      />
    </section>
  );
}
