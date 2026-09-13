import type { JSX } from 'react';

import type { GroundingStats } from '@/core/grounding/verify';
import type { Dictionary } from '@/i18n';
import { formatNumber } from '@/lib/format';

export interface GroundingBadgeProps {
  readonly stats: GroundingStats;
  readonly dictionary: Dictionary;
}

/**
 * The rejection rate, in public.
 *
 * "17 of 18 findings matched to text in your document; 1 discarded because we could
 * not find it" is the most load-bearing sentence on the page. Every other product in
 * this category quietly drops what it cannot substantiate, which makes a hallucination
 * indistinguishable from a citation and makes the failure rate unknowable.
 *
 * Publishing it costs a little confidence and buys the only thing that matters here:
 * a reader who can tell the difference between a system that checked and one that did
 * not. It also makes suppression by a hostile document detectable — a count that drops
 * is visible in a way that a missing finding is not.
 */
export function GroundingBadge({ stats, dictionary }: GroundingBadgeProps): JSX.Element {
  const methods: readonly (readonly [string, number])[] = [
    [dictionary.card.matchMethod.exact, stats.exact],
    [dictionary.card.matchMethod.normalised, stats.normalised],
    [dictionary.card.matchMethod.fuzzy, stats.fuzzy],
  ];

  return (
    <div className="border-rule bg-sunken border px-4 py-3">
      <p className="text-sm font-medium">{dictionary.grounding(stats)}</p>
      <p className="text-muted mt-1 text-xs">
        {methods
          .filter(([, count]) => count > 0)
          .map(([label, count]) => `${label}: ${formatNumber(count)}`)
          .join(' · ')}
      </p>
    </div>
  );
}
