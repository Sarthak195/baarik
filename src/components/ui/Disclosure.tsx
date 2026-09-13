import type { JSX, ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { CaretIcon } from './Icons';

/**
 * The trust mechanism, as one component.
 *
 * `[why?]` and `[how is this computed?]` are the two places where the product stops
 * asserting and starts showing its working — the statute text with its rule id, and
 * the arithmetic behind the asymmetry meter. They are the difference between "an LLM
 * said so" and "a system determined so", so they are built to be reachable rather than
 * impressive: a native `<details>` element, which opens with no JavaScript at all, is
 * announced correctly by every screen reader, is keyboard-operable for free, and is
 * searchable by the browser's own find-in-page in current Chromium and Safari.
 *
 * The square brackets in the label are deliberate. They read as a control rather than
 * as a link in a paragraph of legal prose, at every font size and in both languages.
 */
export interface DisclosureProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string | undefined;
  /** Lets a card give its disclosure a stable anchor for "show in document" links. */
  readonly id?: string | undefined;
}

export function Disclosure({ label, children, className, id }: DisclosureProps): JSX.Element {
  return (
    <details id={id} className={cn('mt-2', className)}>
      <summary
        className={cn(
          // 44px of target on a phone, without adding 44px of box on a desktop.
          'inline-flex min-h-11 cursor-pointer items-center gap-1.5 py-2 text-sm',
          'text-accent underline decoration-dotted underline-offset-4',
          'hover:decoration-solid',
        )}
      >
        <CaretIcon className="caret h-3 w-3 shrink-0" />
        <span>[{label}]</span>
      </summary>
      <div className="border-rule mt-1 border-l-2 pl-4 text-sm leading-relaxed">{children}</div>
    </details>
  );
}
