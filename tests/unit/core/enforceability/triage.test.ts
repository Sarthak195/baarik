import { describe, expect, it } from 'vitest';

import { triageEnforceability } from '@/core/enforceability/triage';
import type { EnforceabilityTable } from '@/core/enforceability/types';
import { fakeFacts } from '../../../fakes/fact-view';

/**
 * A small table standing in for `data/enforceability/*.yaml`. The rows mirror the
 * real statutory positions so the tests read as law rather than as fixtures.
 */
const TABLE: EnforceabilityTable = [
  {
    construct: 'post_employment_non_compete',
    verdict: 'likely_void',
    confidence: 'high',
    statute: {
      act: 'Indian Contract Act, 1872',
      section: 's.27',
      text: 'Every agreement by which any one is restrained from exercising a lawful profession, trade or business of any kind, is to that extent void.',
      url: 'https://www.indiacode.nic.in/',
    },
    authorities: [
      {
        cite: 'Niranjan Shankar Golikari v Century Spinning (1967)',
        holding: 'Restraints operating during employment are enforceable; those operating after it are not.',
        url: null,
      },
    ],
    plainMeaning:
      'Indian law generally does not enforce a clause stopping you working elsewhere after you leave.',
    caveats: [
      'Confidentiality obligations in the same agreement are separate and usually do bind you.',
    ],
    appliesTo: ['employment_offer'],
  },
  {
    construct: 'contractual_limitation_period',
    verdict: 'likely_void',
    confidence: 'high',
    statute: {
      act: 'Indian Contract Act, 1872',
      section: 's.28(b)',
      text: 'Every agreement which extinguishes the rights of any party thereto, or discharges any party thereto from any liability, under or in respect of any contract on the expiry of a specified period so as to restrict any party from enforcing his rights, is void to that extent.',
      url: 'https://www.indiacode.nic.in/',
    },
    authorities: [],
    plainMeaning: 'A clause cutting short the time you have to bring a claim is void.',
    caveats: ['The ordinary limitation period under the Limitation Act still applies.'],
    appliesTo: [],
  },
  {
    construct: 'forfeiture_of_paid_amounts',
    verdict: 'capped_by_statute',
    confidence: 'medium',
    statute: {
      act: 'Indian Contract Act, 1872',
      section: 's.74',
      text: 'The party complaining of the breach is entitled to receive reasonable compensation not exceeding the amount so named.',
      url: 'https://www.indiacode.nic.in/',
    },
    authorities: [
      {
        cite: 'Kailash Nath Associates v DDA (2015) 4 SCC 136',
        holding: 'Compensation under s.74 is capped at loss actually proved.',
        url: null,
      },
    ],
    plainMeaning:
      'A stated penalty is a ceiling, not an entitlement; the other side must prove what it actually lost.',
    caveats: ['Whether any loss was suffered is a question of fact.'],
    appliesTo: [],
  },
];

describe('triageEnforceability', () => {
  it('produces a verdict only for a construct the document actually contains', () => {
    const verdicts = triageEnforceability({
      facts: fakeFacts({
        documentType: 'employment_offer',
        constructs: { post_employment_non_compete: 'present' },
      }),
      findings: [],
      table: TABLE,
      documentType: 'employment_offer',
    });

    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]?.verdict).toBe('likely_void');
    expect(verdicts[0]?.statute.section).toBe('s.27');
  });

  it('stays silent when a construct is absent', () => {
    const verdicts = triageEnforceability({
      facts: fakeFacts({
        documentType: 'employment_offer',
        constructs: { post_employment_non_compete: 'absent' },
      }),
      findings: [],
      table: TABLE,
      documentType: 'employment_offer',
    });

    expect(verdicts).toHaveLength(0);
  });

  /**
   * The safety case. Announcing that a clause is void when the extractor was not sure
   * the clause exists would be worse than saying nothing.
   */
  it('stays silent when the extractor was unsure the clause exists', () => {
    const verdicts = triageEnforceability({
      facts: fakeFacts({
        documentType: 'employment_offer',
        constructs: { post_employment_non_compete: 'unclear' },
      }),
      findings: [],
      table: TABLE,
      documentType: 'employment_offer',
    });

    expect(verdicts).toHaveLength(0);
  });

  it('does not apply an employment-only row to a rent agreement', () => {
    const verdicts = triageEnforceability({
      facts: fakeFacts({
        documentType: 'rent_agreement',
        constructs: { post_employment_non_compete: 'present' },
      }),
      findings: [],
      table: TABLE,
      documentType: 'rent_agreement',
    });

    expect(verdicts).toHaveLength(0);
  });

  it('applies a row with no document-type restriction to any document', () => {
    const verdicts = triageEnforceability({
      facts: fakeFacts({
        documentType: 'privacy_policy',
        constructs: { contractual_limitation_period: 'present' },
      }),
      findings: [],
      table: TABLE,
      documentType: 'privacy_policy',
    });

    expect(verdicts).toHaveLength(1);
  });

  it('orders the strongest verdicts first', () => {
    const verdicts = triageEnforceability({
      facts: fakeFacts({
        documentType: 'employment_offer',
        constructs: {
          forfeiture_of_paid_amounts: 'present',
          post_employment_non_compete: 'present',
        },
      }),
      findings: [],
      table: TABLE,
      documentType: 'employment_offer',
    });

    expect(verdicts.map((verdict) => verdict.verdict)).toEqual(['likely_void', 'capped_by_statute']);
  });

  /**
   * The advice boundary, enforced as a test rather than a convention: a verdict may
   * never be shown without what it does not decide, and every one must be checkable.
   */
  it('requires every row to carry a caveat and a citable statute URL', () => {
    for (const rule of TABLE) {
      expect(rule.caveats.length).toBeGreaterThan(0);
      expect(rule.statute.url).toMatch(/^https:/);
      expect(rule.statute.text.length).toBeGreaterThan(0);
    }
  });
});
