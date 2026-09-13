import type { JSX } from 'react';

import type { Dictionary } from '@/i18n';
import { cn } from '@/lib/cn';
import { paletteFor, type RiskSignal } from '@/lib/severity';
import {
  DiscIcon,
  OctagonIcon,
  RingIcon,
  TriangleIcon,
  type IconProps,
} from '@/components/ui/Icons';

const ICONS: Readonly<Record<RiskSignal, (props: IconProps) => JSX.Element>> = {
  challenged: OctagonIcon,
  risky: TriangleIcon,
  standard: DiscIcon,
  favourable: RingIcon,
};

export interface SeverityChipProps {
  readonly signal: RiskSignal;
  readonly dictionary: Dictionary;
  readonly className?: string | undefined;
}

/**
 * Risk on four channels at once: shape, icon, word, colour.
 *
 * Remove the colour and this still reads. That is the requirement — a greyscale print
 * of the report has to carry the same four categories, and so does the screen of
 * someone with deuteranopia or protanopia, who between them are about one man in
 * twelve. Colour is the redundant channel here, not the primary one, which is why the
 * word is never abbreviated to fit and the icon is never shown on its own.
 */
export function SeverityChip({ signal, dictionary, className }: SeverityChipProps): JSX.Element {
  const palette = paletteFor(signal);
  const Icon = ICONS[signal];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border px-2 py-1 text-xs font-semibold tracking-wide uppercase',
        palette.text,
        palette.surface,
        palette.border,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {dictionary.signals[signal]}
    </span>
  );
}

/**
 * The key, printed once above the clause list.
 *
 * A legend is not padding on a page where four glyphs carry the argument: it is the
 * only place a reader learns that an open ring is good news before meeting one.
 */
export function SeverityLegend({ dictionary }: { readonly dictionary: Dictionary }): JSX.Element {
  const order: readonly RiskSignal[] = ['challenged', 'risky', 'standard', 'favourable'];
  return (
    <ul className="flex flex-wrap gap-2">
      {order.map((signal) => (
        <li key={signal}>
          <SeverityChip signal={signal} dictionary={dictionary} />
        </li>
      ))}
    </ul>
  );
}
