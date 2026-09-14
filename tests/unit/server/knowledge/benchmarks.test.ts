import { describe, expect, it } from 'vitest';

import { loadKnowledge } from '@/server/knowledge/repository';

/**
 * The shipped benchmarks, checked against the real `data/rubric/*.yaml`.
 *
 * `npm run validate` proves a benchmark is well-typed. These tests prove it is worth
 * showing: that the source names a real instrument with a year, that the text is a
 * quotation rather than a gesture at one, and that the link is one a reader can open.
 *
 * The count floor is the point of the file. A benchmark is the only place the product
 * makes its comparison claim visible — "your deposit is ten months' rent; the Model
 * Tenancy Act uses two" — and rules carrying one could be deleted in a YAML edit
 * without a single other test noticing.
 */

const rules = loadKnowledge().rubric.rules;
const benchmarked = rules.filter((rule) => rule.benchmark !== null);

/** A citation without a year is not a citation anyone can look up. */
const YEAR = /\b(1[89]|20)\d{2}\b/;

describe('the rubric benchmarks', () => {
  it('are carried by enough rules that the comparison claim is actually visible', () => {
    expect(benchmarked.length).toBeGreaterThanOrEqual(8);
    // Not vacuous in the other direction either: if every rule had one, the field
    // would have stopped meaning "there is a published figure for this".
    expect(benchmarked.length).toBeLessThan(rules.length);
  });

  for (const rule of benchmarked) {
    describe(rule.id, () => {
      const benchmark = rule.benchmark;

      it('names an instrument and the year it carries', () => {
        expect(benchmark?.source).toMatch(YEAR);
      });

      it('quotes the source at length rather than paraphrasing it', () => {
        expect(benchmark?.text.length).toBeGreaterThan(60);
      });

      it('links somewhere a reader can open over https', () => {
        const url = new URL(benchmark?.url ?? '');
        expect(url.protocol).toBe('https:');
        expect(url.hostname).not.toBe('');
      });
    });
  }
});

/**
 * Two rules that quote the same instrument must quote it identically.
 *
 * The deposit pair and the bond pair each cite one section from two bands of the same
 * signal. Letting the wording drift between them would show a reader two different
 * versions of the same statute depending on how bad their contract happened to be.
 */
describe('benchmarks that share a source', () => {
  it('quote it in the same words and link it to the same place', () => {
    const byText = new Map<string, Set<string>>();
    for (const rule of benchmarked) {
      if (rule.benchmark === null) continue;
      const seen = byText.get(rule.benchmark.text) ?? new Set<string>();
      seen.add(`${rule.benchmark.source}|${rule.benchmark.url}`);
      byText.set(rule.benchmark.text, seen);
    }

    for (const [text, sources] of byText) {
      expect({ text: text.slice(0, 48), sources: sources.size }).toEqual({
        text: text.slice(0, 48),
        sources: 1,
      });
    }
  });
});
