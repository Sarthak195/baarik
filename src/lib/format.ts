/**
 * Presentation formatting.
 *
 * Every formatter here pins its locale and, where a date is involved, its time zone.
 * That is not pedantry: this application server-renders and then hydrates, and a
 * number or date formatted with the *ambient* locale produces one string in Node and a
 * different one in the browser, which React reports as a hydration error and the
 * reader experiences as the page flickering.
 *
 * Indian digit grouping is the reason `en-IN` appears rather than a plain `toString`.
 * A deposit of three lakh rupees reads as 3,00,000 to the person holding the agreement
 * and as 300,000 to nobody in the room.
 */

const RUPEES = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const PLAIN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/**
 * Dates are fixed to UTC because the limitation clock in `src/core/remedies` computes
 * in UTC midnight. Rendering the same instant in the viewer's zone would move a
 * deadline by a day for anyone west of Greenwich, and a filing deadline that is a day
 * out is worse than no deadline at all.
 */
const DATE = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatRupees(amount: number): string {
  return RUPEES.format(amount);
}

export function formatNumber(value: number): string {
  return PLAIN.format(value);
}

export function formatDate(date: Date): string {
  return DATE.format(date);
}

/** "90 days" / "1 day". Pluralisation only; no judgement about whether that is long. */
export function formatDays(days: number): string {
  return `${formatNumber(days)} ${days === 1 ? 'day' : 'days'}`;
}

export function formatMonths(months: number): string {
  return `${formatNumber(months)} ${months === 1 ? 'month' : 'months'}`;
}

/**
 * A ratio rendered the way the asymmetry disclosure states it: "3 : 1".
 * Returns null when either side is zero, because "90 : 0" is not a ratio and printing
 * one would be a claim the arithmetic does not support.
 */
export function formatRatio(numerator: number, denominator: number): string | null {
  if (numerator <= 0 || denominator <= 0) return null;
  return `${formatNumber(Math.round((numerator / denominator) * 10) / 10)} : 1`;
}
