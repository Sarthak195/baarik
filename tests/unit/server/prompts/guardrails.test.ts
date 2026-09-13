import { describe, expect, it } from 'vitest';

import { ANSWER_QUESTION_SYSTEM } from '@/server/prompts/answer-question';
import { CLASSIFY_DOCUMENT_SYSTEM } from '@/server/prompts/classify-document';
import { EXTRACT_FACTS_SYSTEM } from '@/server/prompts/extract-facts';
import { FIND_CLAUSES_SYSTEM } from '@/server/prompts/find-clauses';
import { SIMPLIFY_CLAUSE_SYSTEM } from '@/server/prompts/simplify-clause';
import { GUARDRAILS, UNTRUSTED_INPUT_NOTICE, buildSystemInstruction } from '@/server/prompts/shared/guardrails';

/**
 * The advice firewall, asserted rather than assumed.
 *
 * The failure this guards against is quiet: someone adds a sixth prompt, writes the
 * system instruction inline because it is one string, and the new call site is the
 * only one in the application permitted to volunteer a legal conclusion. Nothing
 * breaks, no test goes red, and the boundary in ADR 0005 is gone.
 *
 * Listing every prompt here means adding one without its guardrails fails the build.
 */
const EVERY_SYSTEM_PROMPT: readonly (readonly [string, string])[] = [
  ['classify-document', CLASSIFY_DOCUMENT_SYSTEM],
  ['extract-facts', EXTRACT_FACTS_SYSTEM],
  ['find-clauses', FIND_CLAUSES_SYSTEM],
  ['answer-question', ANSWER_QUESTION_SYSTEM],
  ['simplify-clause', SIMPLIFY_CLAUSE_SYSTEM],
];

describe('every system prompt carries the guardrails', () => {
  for (const [name, prompt] of EVERY_SYSTEM_PROMPT) {
    it(`${name} includes the advice firewall verbatim`, () => {
      expect(prompt).toContain(GUARDRAILS);
    });

    it(`${name} tells the model the document is untrusted data`, () => {
      expect(prompt).toContain(UNTRUSTED_INPUT_NOTICE);
    });

    it(`${name} puts the guardrails before the task instruction`, () => {
      // Order matters: a task instruction read before the constraints is a task
      // instruction the constraints have to argue with.
      expect(prompt.indexOf(GUARDRAILS)).toBeLessThan(prompt.indexOf(UNTRUSTED_INPUT_NOTICE));
    });
  }
});

describe('the guardrails themselves', () => {
  it('forbids the model from ruling on enforceability', () => {
    // The load-bearing rule. Enforceability comes from data/enforceability/*.yaml, and
    // a model volunteering its own verdict would sit next to a contradictory one.
    expect(GUARDRAILS).toMatch(/never state that anything is legal, illegal, valid, void or enforceable/i);
  });

  it('forbids recommending a course of action', () => {
    expect(GUARDRAILS).toMatch(/never recommend a course of action/i);
  });

  it('requires an exact quote for every claim', () => {
    expect(GUARDRAILS).toMatch(/copied\s+EXACTLY/i);
  });

  it('makes "unclear" an acceptable answer', () => {
    // Without this the model fills gaps with what such documents usually say, which is
    // precisely what turns an unread scan into a confident risk score.
    expect(GUARDRAILS).toMatch(/"unclear" is a correct answer/i);
  });

  it('states that the tool is not a lawyer and gives no legal advice', () => {
    expect(GUARDRAILS).toMatch(/you are not a lawyer and you\s+do not give legal advice/i);
  });
});

describe('buildSystemInstruction', () => {
  it('composes guardrails, the untrusted-input notice, and the task', () => {
    const composed = buildSystemInstruction('Do the specific thing.');

    expect(composed).toContain(GUARDRAILS);
    expect(composed).toContain(UNTRUSTED_INPUT_NOTICE);
    expect(composed.endsWith('Do the specific thing.')).toBe(true);
  });

  it('trims the task instruction so composition does not add stray whitespace', () => {
    expect(buildSystemInstruction('\n\n  Task.  \n\n').endsWith('Task.')).toBe(true);
  });
});
