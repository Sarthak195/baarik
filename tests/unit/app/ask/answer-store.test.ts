import { beforeEach, describe, expect, it } from 'vitest';

import { clearAnswers, getAnswer, putAnswer } from '@/app/api/ask/answer-store';
import type { AnswerView } from '@/components/qa/types';

/**
 * The store exists so that an answer never has to travel in a URL. These tests are
 * about the two properties that makes it safe to rely on: a token is redeemable only
 * on the report it was issued for, and nothing is kept for long.
 */

const VIEW: AnswerView = {
  question: 'Can they stop me joining a competitor?',
  outcome: {
    kind: 'grounded',
    answer: 'Clause 7.2 restrains you for twenty-four months.',
    quote: 'The Employee shall not, for a period of twenty-four months',
    certainty: 'stated',
  },
};

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

beforeEach(() => {
  clearAnswers();
});

describe('the answer store', () => {
  it('returns what was stored, for the report it was stored against', () => {
    putAnswer('token-a', 'report-1', VIEW, NOW);
    expect(getAnswer('token-a', 'report-1', NOW)).toEqual(VIEW);
  });

  it('refuses a token redeemed against a different report', () => {
    // The sample reports have stable ids that many people open. Without this check, a
    // token pasted onto another report's URL would show one reader another's question.
    putAnswer('token-a', 'report-1', VIEW, NOW);
    expect(getAnswer('token-a', 'report-2', NOW)).toBeNull();
  });

  it('does not invent an answer for an unknown token', () => {
    expect(getAnswer('never-issued', 'report-1', NOW)).toBeNull();
  });

  it('survives a reload within the window', () => {
    putAnswer('token-a', 'report-1', VIEW, NOW);
    expect(getAnswer('token-a', 'report-1', NOW + 14 * MINUTE)).toEqual(VIEW);
  });

  it('forgets an answer once it is old', () => {
    putAnswer('token-a', 'report-1', VIEW, NOW);
    expect(getAnswer('token-a', 'report-1', NOW + 16 * MINUTE)).toBeNull();
  });

  it('drops an expired answer rather than leaving it in memory', () => {
    putAnswer('stale', 'report-1', VIEW, NOW);
    putAnswer('fresh', 'report-1', VIEW, NOW + 16 * MINUTE);

    // The eviction pass on write is what keeps a quote from lingering after its TTL
    // even if nobody ever asks for it again.
    expect(getAnswer('stale', 'report-1', NOW + 16 * MINUTE)).toBeNull();
    expect(getAnswer('fresh', 'report-1', NOW + 16 * MINUTE)).toEqual(VIEW);
  });

  it('stays bounded under a flood of questions', () => {
    for (let index = 0; index < 150; index += 1) {
      putAnswer(`token-${String(index)}`, 'report-1', VIEW, NOW);
    }

    // Oldest-first eviction: an endpoint a stranger can reach must not be able to grow
    // the heap by being called.
    expect(getAnswer('token-0', 'report-1', NOW)).toBeNull();
    expect(getAnswer('token-149', 'report-1', NOW)).toEqual(VIEW);
  });
});
