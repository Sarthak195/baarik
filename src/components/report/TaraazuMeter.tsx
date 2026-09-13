import type { JSX } from 'react';

import type { Dictionary } from '@/i18n';
import type { FavoursArithmetic } from '@/lib/clause-view';
import { Disclosure } from '@/components/ui/Disclosure';
import { ScalesIcon } from '@/components/ui/Icons';

export interface TaraazuMeterProps {
  readonly favours: FavoursArithmetic;
  readonly dictionary: Dictionary;
}

/**
 * तराज़ू — the weighing scales, as an asymmetry meter.
 *
 * Two design constraints, both of which shaped the markup rather than the styling.
 *
 * The bar must survive having its colour removed, so the two sides differ by texture:
 * your share is a solid fill, theirs is a 45-degree hatch. Print it in greyscale,
 * photocopy it, or view it with either common form of colour blindness and the two
 * halves stay two halves. The sentence underneath repeats the same split in words, so
 * the bar is never the only carrier of the fact.
 *
 * And the meter must be auditable. `[how is this computed?]` opens the arithmetic that
 * produced it — 90 days against 30, a ratio of 3 : 1, two of nine paired rights — which
 * is the entire difference between a number a reader can check and a number they have
 * to believe.
 */
export function TaraazuMeter({ favours, dictionary }: TaraazuMeterProps): JSX.Element {
  const total = Math.max(favours.pairedRights, 1);
  const yourPercent = Math.round((favours.yourShare / total) * 100);
  const summary = dictionary.favoursSummary(favours.yourShare, favours.pairedRights, favours.side);

  return (
    <div>
      <div
        className="border-rule-strong flex h-5 w-full max-w-sm overflow-hidden border"
        aria-hidden="true"
      >
        <div className="bg-favour/45" style={{ width: `${String(yourPercent)}%` }} />
        <div className="text-standard hatched" style={{ width: `${String(100 - yourPercent)}%` }} />
      </div>

      <p className="mt-2 flex items-start gap-2 text-sm">
        <ScalesIcon className="text-muted mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {summary}{' '}
          <span className="text-muted">
            ({dictionary.parties[favours.side]} — {String(favours.yourShare)}/
            {String(favours.pairedRights)})
          </span>
        </span>
      </p>

      <Disclosure label={dictionary.card.howComputed}>
        <ol className="list-decimal space-y-1.5 pl-4">
          {favours.steps.map((step) => (
            <li key={step.slice(0, 32)}>{step}</li>
          ))}
        </ol>
      </Disclosure>
    </div>
  );
}
