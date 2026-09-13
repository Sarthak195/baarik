'use client';

import { useEffect, useRef, useState, type JSX } from 'react';

import { cn } from '@/lib/cn';
import { CheckIcon } from '@/components/ui/Icons';

export interface AnalysisProgressProps {
  readonly heading: string;
  readonly stages: readonly string[];
  readonly completeLabel: string;
  /** The heading focus moves to once the run finishes. Must carry `tabIndex={-1}`. */
  readonly resultsHeadingId: string;
  readonly stageMs: number;
}

/**
 * The streaming analysis region.
 *
 * Three accessibility requirements meet here, and the order they are satisfied in
 * matters more than the animation does.
 *
 * `aria-live="polite"` announces each stage as it completes, without interrupting
 * whatever the reader is already listening to. `aria-busy` tells assistive technology
 * that the region is still settling. And when the run finishes, focus moves to the
 * results heading, so a keyboard or screen-reader user lands on the report rather than
 * being left at the top of a page whose content has silently arrived below them.
 *
 * Two deliberate restraints on that focus move. It happens only if the reader has not
 * already started interacting — stealing focus from someone mid-Tab is worse than not
 * moving it — and it does not happen at all when the stages were skipped for reduced
 * motion, because moving focus to announce a transition that never occurred is a jump
 * with no cause.
 *
 * The server renders the finished state. With JavaScript unavailable the region reads
 * "Analysis complete" and the report below it is already there, which is the honest
 * answer: nothing was streaming, so nothing is pretending to.
 */
export function AnalysisProgress({
  heading,
  stages,
  completeLabel,
  resultsHeadingId,
  stageMs,
}: AnalysisProgressProps): JSX.Element {
  const [reached, setReached] = useState(stages.length);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    setReached(0);
    const timers = stages.map((_, index) =>
      window.setTimeout(
        () => {
          setReached(index + 1);
        },
        (index + 1) * stageMs,
      ),
    );

    timers.push(
      window.setTimeout(
        () => {
          const target = document.getElementById(resultsHeadingId);
          if (target !== null && document.activeElement === document.body) target.focus();
        },
        stages.length * stageMs + 80,
      ),
    );

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [stages, stageMs, resultsHeadingId]);

  const complete = reached >= stages.length;

  return (
    <section aria-labelledby="analysis-heading" data-print="hide">
      <h2
        id="analysis-heading"
        className="text-faint text-xs font-semibold tracking-[0.14em] uppercase"
      >
        {heading}
      </h2>

      <div aria-live="polite" aria-busy={!complete} className="mt-3">
        <ol className="space-y-1.5">
          {stages.map((stage, index) => (
            <li
              key={stage}
              className={cn(
                'flex items-start gap-2 text-sm',
                index < reached ? 'text-muted' : 'text-faint',
              )}
            >
              {index < reached ? (
                <CheckIcon className="text-favour mt-1 h-3.5 w-3.5 shrink-0" />
              ) : (
                <span className="border-rule-strong mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border" />
              )}
              <span>{stage}</span>
            </li>
          ))}
        </ol>
        {complete && <p className="mt-2 text-sm font-medium">{completeLabel}</p>}
      </div>
    </section>
  );
}
