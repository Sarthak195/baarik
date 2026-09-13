import type { JSX, ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * A bordered aside.
 *
 * Tone is carried by a left rule of four pixels as well as by colour, so that the
 * three tones remain three tones in a greyscale print — the same rule that governs
 * every risk signal in this application.
 */
export type CalloutTone = 'neutral' | 'warning' | 'critical';

export interface CalloutProps {
  readonly tone?: CalloutTone | undefined;
  readonly heading?: string | undefined;
  readonly children: ReactNode;
  readonly className?: string | undefined;
  /** Renders as a `<section>` with a label when a heading is given a landmark role. */
  readonly asSection?: boolean | undefined;
}

const TONES: Readonly<Record<CalloutTone, string>> = {
  neutral: 'border-l-rule-strong bg-sunken text-ink',
  warning: 'border-l-risky bg-risky-bg text-ink',
  critical: 'border-l-challenged bg-challenged-bg text-ink',
};

export function Callout({
  tone = 'neutral',
  heading,
  children,
  className,
  asSection = false,
}: CalloutProps): JSX.Element {
  const Tag = asSection ? 'section' : 'aside';
  return (
    <Tag className={cn('border-l-4 px-4 py-3 text-sm leading-relaxed', TONES[tone], className)}>
      {heading !== undefined && (
        <h2 className="font-sans text-[0.8125rem] font-semibold tracking-wide uppercase">
          {heading}
        </h2>
      )}
      <div className={cn(heading !== undefined && 'mt-2')}>{children}</div>
    </Tag>
  );
}
