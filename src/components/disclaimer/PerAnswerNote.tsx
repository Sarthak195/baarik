import type { JSX } from 'react';

import type { Dictionary } from '@/i18n';
import { cn } from '@/lib/cn';

export interface PerAnswerNoteProps {
  readonly dictionary: Dictionary;
  readonly className?: string | undefined;
}

/**
 * Tier two of three: the compact per-answer note (ADR 0005).
 *
 * One line, on every card that says something about the law, so that no screenshot of
 * a single clause can circulate without it. A footer disclaimer three screens below is
 * not attached to the sentence it qualifies; this is.
 *
 * It is styled quietly on purpose. A warning repeated twenty times in red stops being
 * read after the second one, and the whole point of repeating it is that it is read.
 */
export function PerAnswerNote({ dictionary, className }: PerAnswerNoteProps): JSX.Element {
  return <p className={cn('text-faint text-xs', className)}>{dictionary.disclaimer.perAnswer}</p>;
}
