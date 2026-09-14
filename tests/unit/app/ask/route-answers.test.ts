import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

import { clearAnswers, getAnswer } from '@/app/api/ask/answer-store';
import { POST as ask } from '@/app/api/ask/route';
import type { QaAnswer } from '@/schemas/qa-answer';
import type * as EnvModule from '@/server/config/env';
import type { StructuredRequest } from '@/server/genai/interactions';
import type { LlmGateway } from '@/server/pipeline/stages';
import { ANSWER_QUESTION_SYSTEM } from '@/server/prompts/answer-question';
import { sampleReportView } from '@/server/samples/view';
import { clearRateLimits } from '@/server/ratelimit/token-bucket';
import { clearReports } from '@/server/store/report-store';

import { installGateway, resetGateway, sentRequests } from '../../../fakes/genai-gateway';

/**
 * `/api/ask` with a model that answers, which nothing had ever tested.
 *
 * `route.test.ts` beside this file covers every way the endpoint says no — a bad id, an
 * empty question, an over-long one, a report that has expired, an exhausted bucket —
 * and it can do so because none of those paths reaches a model. The path that does was
 * therefore the one path of the endpoint never exercised, and it is the one carrying the
 * product's central promise: that a sentence presented to a reader as something their
 * document says is something their document actually says.
 *
 * So the gateway the route builds for itself is replaced here (`tests/fakes/genai-gateway.ts`)
 * and the model's reply is dictated by the test. No key, no network, no quota: the free
 * tier allows twenty requests per model per key per day, and a suite that spent one per
 * run would be a suite nobody could afford to run.
 *
 * Dictating the reply is the point rather than a compromise. The interesting assertions
 * are about what happens to an answer *after* the model has spoken — a fabricated quote
 * must not become a citation, and a real one must reach the page as the document's own
 * characters — and neither can be provoked reliably from a live model.
 */

vi.mock('@/server/genai/gateway', async () => await import('../../../fakes/genai-gateway'));

/** Resolved one line before the model call, and absent on any machine running offline. */
vi.mock('@/server/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return { ...actual, getGeminiKeyPool: () => new actual.KeyPool(['replayed-never-sent']) };
});

/** A committed sample. Questions may be asked of one, so this id always resolves. */
const SAMPLE = 'offer-letter-meridian';

/** UUID-shaped and deliberately absent: a live report whose instance has since restarted. */
const VANISHED = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

/** The container's internal address behind Cloud Run. See the `Location` test below. */
const CONTAINER = 'http://0.0.0.0:8080/api/ask';

const documentText = sampleReportView(SAMPLE)?.documentText ?? '';

/**
 * A real passage of the sample, chosen from the document itself rather than pasted here.
 *
 * A literal would go stale the moment the fixture was re-worded, and it would go stale
 * silently: the quote would stop matching, the outcome would become `unverified`, and
 * the test would still be asserting something — just no longer the thing it was written
 * to assert. Taking the passage from the document keeps the two in step. The length
 * floor clears `LOCATE_DEFAULTS.minQuoteLength`, below which nothing is locatable.
 */
const PASSAGE = documentText
  .split('\n')
  .map((line) => line.trim())
  .find((line) => line.length > 80 && line.length < 300);

/**
 * The model's reply, as a well-formed `QaAnswer`.
 *
 * Built through the schema's own shape so a field added to `QaAnswerSchema` is a compile
 * error here rather than a runtime parse failure inside the fake.
 */
function answer(fields: Partial<QaAnswer>): QaAnswer {
  return {
    foundInDocument: true,
    answer: 'Two months, served in writing by either side.',
    exactQuote: PASSAGE ?? '',
    certainty: 'stated',
    ...fields,
  };
}

/**
 * A gateway that answers the Q&A stage and refuses everything else.
 *
 * The system instruction is compared by identity against the stage's own constant, the
 * same rule `tests/fakes/llm-gateway.ts` follows: answering a request this fake does not
 * recognise would be a plausible lie, and a plausible lie is what makes a green test
 * meaningless. The reply is validated through the caller's schema exactly as the real
 * gateway validates a live response, so a dictated answer that no longer satisfies
 * `QaAnswerSchema` fails here rather than three layers downstream.
 */
class AnsweringGateway implements LlmGateway {
  readonly #reply: QaAnswer;

  constructor(reply: QaAnswer) {
    this.#reply = reply;
  }

  structured<TSchema extends z.ZodType>(
    request: StructuredRequest<TSchema>,
  ): Promise<{ value: z.infer<TSchema>; model: string; cachedTokens: number | null }> {
    if (request.system !== ANSWER_QUESTION_SYSTEM) {
      throw new Error(
        'A question reached a stage other than answerQuestion. This fake has one recording ' +
          'and answering with it regardless would hide whichever stage was actually called.',
      );
    }

    const parsed = request.schema.safeParse(this.#reply);
    if (!parsed.success) {
      throw new Error(
        `The dictated answer does not satisfy the stage's schema: ${parsed.error.message}`,
      );
    }

    return Promise.resolve({ value: parsed.data, model: 'gemini-3.8-flash', cachedTokens: null });
  }
}

beforeEach(() => {
  clearRateLimits();
  clearReports();
  clearAnswers();
  resetGateway();
});

function post(fields: Readonly<Record<string, string>>): Promise<Response> {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return ask(new Request(CONTAINER, { method: 'POST', body: form }));
}

function location(response: Response): string {
  return response.headers.get('location') ?? '';
}

/** The opaque token out of `?answered=<token>#ask`, which is how the page finds the answer. */
function tokenIn(response: Response): string {
  return /answered=([^&#]+)/.exec(location(response))?.[1] ?? '';
}

describe('POST /api/ask — a question that is answered', () => {
  it('has a passage of the sample to work with', () => {
    // Everything below depends on this. An empty `PASSAGE` would make a grounded outcome
    // impossible and turn three tests into assertions about a quote of nothing.
    expect(PASSAGE ?? '').not.toBe('');
    expect(documentText).toContain(PASSAGE ?? 'no passage found');
  });

  it('redirects to the report with an opaque token rather than the answer', async () => {
    installGateway(new AnsweringGateway(answer({})));

    const response = await post({ reportId: SAMPLE, question: 'What is the notice period?' });

    expect(response.status).toBe(303);
    expect(location(response)).toMatch(
      /^\/report\/offer-letter-meridian\?answered=[0-9a-f-]+#ask$/,
    );
  });

  it('leaves the answer where the report page will look for it', async () => {
    installGateway(new AnsweringGateway(answer({})));

    const response = await post({ reportId: SAMPLE, question: 'What is the notice period?' });
    const view = getAnswer(tokenIn(response), SAMPLE, Date.now());

    // A redirect carrying a token nothing can redeem renders as a report with no answer
    // on it, which is indistinguishable from success at the status-code level.
    expect(view?.outcome.kind).toBe('grounded');
    expect(view?.question).toBe('What is the notice period?');
  });

  it('shows the document’s own characters, not the model’s copy of them', async () => {
    // The model is made to shout the passage. `locateQuote` folds case, so it still
    // resolves — and what reaches the reader must be the span it resolved to, because a
    // quote is only a quote if it is the reader's own text.
    installGateway(new AnsweringGateway(answer({ exactQuote: (PASSAGE ?? '').toUpperCase() })));

    const response = await post({ reportId: SAMPLE, question: 'What does clause 1 say?' });
    const outcome = getAnswer(tokenIn(response), SAMPLE, Date.now())?.outcome;

    expect(outcome?.kind).toBe('grounded');
    const quote = outcome?.kind === 'grounded' ? outcome.quote : '';
    expect(documentText).toContain(quote);
    expect(quote).not.toBe((PASSAGE ?? '').toUpperCase());
  });

  it('shows no citation at all when the passage is not in the document', async () => {
    installGateway(
      new AnsweringGateway(
        answer({ exactQuote: 'The Employee shall be entitled to a signing bonus of Rs 5,00,000.' }),
      ),
    );

    const response = await post({ reportId: SAMPLE, question: 'Is there a signing bonus?' });
    const outcome = getAnswer(tokenIn(response), SAMPLE, Date.now())?.outcome;

    // `unverified` carries no prose on purpose: an unlocatable citation means the
    // sentences around it cannot be trusted either. The reader gets nothing rather than
    // a confident paragraph about a clause their contract does not contain.
    expect(outcome?.kind).toBe('unverified');
    expect(response.status).toBe(303);
  });

  it('carries the language through to the page that renders the answer', async () => {
    installGateway(new AnsweringGateway(answer({})));

    const response = await post({ reportId: SAMPLE, question: 'नोटिस अवधि क्या है?', lang: 'hi' });

    // The fragment must stay last: a query parameter appended after `#` becomes part of
    // the fragment and never reaches the server.
    expect(location(response)).toContain('lang=hi');
    expect(location(response).endsWith('#ask')).toBe(true);
  });
});

describe('POST /api/ask — what it refuses to spend', () => {
  it('spends no model request on a report that is gone', async () => {
    const response = await post({ reportId: VANISHED, question: 'What is the notice period?' });

    // Not a 500 and not a bare 404: the report page owns the "held in memory, never
    // written anywhere" wording and the offer of a sample. What matters as much is that
    // discovering the report had expired cost nothing — no gateway was installed, so a
    // model call here would have thrown rather than passed quietly.
    expect(response.status).toBe(303);
    expect(location(response)).toBe(`/report/${VANISHED}`);
    expect(sentRequests()).toHaveLength(0);
  });

  it('spends no model request on a question it will not answer', async () => {
    await post({ reportId: SAMPLE, question: '   ' });

    expect(sentRequests()).toHaveLength(0);
  });
});

describe('POST /api/ask — the Location header', () => {
  it('stays relative when the request URL is the container address', async () => {
    installGateway(new AnsweringGateway(answer({})));

    // `new URL(target, request.url)` behind Cloud Run resolves against
    // `http://0.0.0.0:8080`, and the browser is sent to a host it cannot reach. It looks
    // right in local testing, where the internal and external addresses agree — which is
    // exactly why it reached production.
    const answered = await post({ reportId: SAMPLE, question: 'What is the notice period?' });
    const gone = await post({ reportId: VANISHED, question: 'What is the notice period?' });

    for (const response of [answered, gone]) {
      expect(location(response).startsWith('/')).toBe(true);
      expect(location(response)).not.toContain('0.0.0.0');
      expect(location(response)).not.toContain('://');
    }
  });
});
