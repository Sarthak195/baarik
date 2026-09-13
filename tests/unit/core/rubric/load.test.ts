import { describe, expect, it } from 'vitest';

import { parseKnowledgeBase } from '@/core/rubric/load';

const WEIGHTS = {
  version: '1.0.0',
  saturation: 45,
  tierCaps: { asymmetry: 40, threshold: 45, construct: 45, absence: 40 },
  bands: [
    { upTo: 24, band: 'low' },
    { upTo: 49, band: 'moderate' },
    { upTo: 74, band: 'high' },
    { upTo: 100, band: 'severe' },
  ],
};

function rubricFile(rules: readonly unknown[], tier = 'threshold'): unknown {
  return { version: '1.0.0', tier, rules };
}

const VALID_RULE = {
  id: 'long_lock_in',
  title: 'The lock-in period is unusually long',
  appliesTo: ['rent_agreement'],
  when: { op: 'gt', field: 'lockInMonths', value: 6 },
  severity: 'high',
  weight: 15,
  explain: { en: 'You are locked in for {lockInMonths} months.', hi: 'आप {lockInMonths} महीने बंधे हैं।' },
  askYourLawyer: 'Can the lock-in be shortened?',
};

describe('parseKnowledgeBase', () => {
  it('parses a valid knowledge base and stamps each rule with its file’s tier', () => {
    const knowledge = parseKnowledgeBase({
      rubricFiles: { 'tier2-thresholds.yaml': rubricFile([VALID_RULE]) },
      weights: WEIGHTS,
    });

    expect(knowledge.rules).toHaveLength(1);
    expect(knowledge.rules[0]?.tier).toBe('threshold');
    expect(knowledge.rules[0]?.id).toBe('long_lock_in');
    expect(knowledge.config.saturation).toBe(45);
  });

  it('defaults the optional fields rather than leaving them undefined', () => {
    const knowledge = parseKnowledgeBase({
      rubricFiles: {
        'f.yaml': rubricFile([{ ...VALID_RULE, askYourLawyer: undefined, appliesTo: undefined }]),
      },
      weights: WEIGHTS,
    });

    expect(knowledge.rules[0]?.benchmark).toBeNull();
    expect(knowledge.rules[0]?.evidenceFrom).toBeNull();
    expect(knowledge.rules[0]?.appliesTo).toEqual([]);
  });

  /**
   * Rule ids appear in the UI beside every finding and are the handle a maintainer
   * greps for, so a collision would make one of the two rules unfindable.
   */
  it('rejects a duplicate rule id and names both files', () => {
    expect(() =>
      parseKnowledgeBase({
        rubricFiles: {
          'a.yaml': rubricFile([VALID_RULE]),
          'b.yaml': rubricFile([VALID_RULE]),
        },
        weights: WEIGHTS,
      }),
    ).toThrow(/Duplicate rule id "long_lock_in".*b\.yaml.*a\.yaml/s);
  });

  it('rejects a rule naming a fact field that does not exist', () => {
    expect(() =>
      parseKnowledgeBase({
        rubricFiles: {
          'a.yaml': rubricFile([
            { ...VALID_RULE, when: { op: 'gt', field: 'noSuchField', value: 1 } },
          ]),
        },
        weights: WEIGHTS,
      }),
    ).toThrow(/not a valid rubric file/);
  });

  it('rejects a rule missing its Hindi explanation', () => {
    expect(() =>
      parseKnowledgeBase({
        rubricFiles: {
          'a.yaml': rubricFile([{ ...VALID_RULE, explain: { en: 'Only English.' } }]),
        },
        weights: WEIGHTS,
      }),
    ).toThrow(/not a valid rubric file/);
  });

  it('rejects an id that is not lower_snake_case, so ids stay greppable', () => {
    expect(() =>
      parseKnowledgeBase({
        rubricFiles: { 'a.yaml': rubricFile([{ ...VALID_RULE, id: 'Long-LockIn' }]) },
        weights: WEIGHTS,
      }),
    ).toThrow(/not a valid rubric file/);
  });

  it('rejects an empty knowledge base rather than scoring every document as safe', () => {
    expect(() => parseKnowledgeBase({ rubricFiles: {}, weights: WEIGHTS })).toThrow(
      /contains no rules/,
    );
  });

  it('accepts a nested compound predicate', () => {
    const knowledge = parseKnowledgeBase({
      rubricFiles: {
        'a.yaml': rubricFile(
          [
            {
              ...VALID_RULE,
              when: {
                op: 'all_of',
                of: [
                  { op: 'construct_absent', construct: 'exit_or_termination_route' },
                  { op: 'construct_absent', construct: 'notice_period_for_you' },
                ],
              },
            },
          ],
          'absence',
        ),
      },
      weights: WEIGHTS,
    });

    expect(knowledge.rules[0]?.when.op).toBe('all_of');
    expect(knowledge.rules[0]?.tier).toBe('absence');
  });
});
