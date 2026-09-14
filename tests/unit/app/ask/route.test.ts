import { beforeEach, describe, expect, it } from 'vitest';

import { POST as ask } from '@/app/api/ask/route';
import { clearAnswers } from '@/app/api/ask/answer-store';
import { LIMITS } from '@/server/config/limits';
import { clearRateLimits } from '@/server/ratelimit/token-bucket';
import { clearReports } from '@/server/store/report-store';

/**
 * The endpoint that makes capability 4 real.
 *
 * Every test here runs with no API key and no network — `tests/setup.ts` makes `fetch`
 * throw — so the model call is never reached. That is deliberate: what needs asserting
 * is the control flow around the model, which is where a public endpoint that spends
 * metered quota either protects itself or does not.
 *
 * The grounding rule the answers themselves obey is asserted separately, in
 * `verify-answer.test.ts`, against the function that enforces it.
 */

/** A committed fixture. Questions may be asked of a sample, so this id always resolves. */
const SAMPLE = 'offer-letter-meridian';

/** UUID-shaped, and deliberately not in the store: a live report that is gone. */
const VANISHED = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

beforeEach(() => {
  clearRateLimits();
  clearReports();
  clearAnswers();
});

function post(fields: Record<string, string>, headers: Record<string, string> = {}): Promise<Response> {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return ask(new Request('http://localhost/api/ask', { method: 'POST', body: form, headers }));
}

function location(response: Response): string {
  return response.headers.get('location') ?? '';
}

describe('POST /api/ask', () => {
  it('answers a plain form post with a redirect, so the flow needs no JavaScript', async () => {
    const response = await post({ reportId: SAMPLE, question: 'What is the notice period?' });

    // 303 rather than 302: the browser follows it with a GET, so a refresh cannot
    // re-post the question and spend a second request of a twenty-a-day allowance.
    expect(response.status).toBe(303);
    expect(location(response)).toMatch(/^\/report\//);
  });

  it('sends the reader back to the section they asked from', async () => {
    const response = await post({ reportId: SAMPLE, question: 'What is the notice period?' });
    expect(location(response)).toMatch(/#ask$/);
  });

  it('never builds an absolute redirect from the request URL', async () => {
    // Behind Cloud Run `request.url` is the container's internal address, and every
    // redirect built from it pointed the browser at a host it could not reach.
    const response = await post({ reportId: SAMPLE, question: 'What is the notice period?' });

    expect(location(response).startsWith('/')).toBe(true);
    expect(location(response)).not.toContain('localhost');
  });

  it('carries the language through the redirect', async () => {
    const response = await post({ reportId: SAMPLE, question: 'क्या नोटिस अवधि है?', lang: 'hi' });
    expect(location(response)).toContain('lang=hi');
  });

  it('rate limits before it reads the body', async () => {
    const shared = { 'x-forwarded-for': '203.0.113.9' };
    const attempts = LIMITS.rateLimit.capacity + 2;

    const statuses: number[] = [];
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      statuses.push((await post({ reportId: SAMPLE, question: 'Anything?' }, shared)).status);
    }

    // The quota this endpoint spends is the scarce resource; a limiter that ran after
    // the model call would protect nothing.
    expect(statuses.at(-1)).toBe(429);
    const refused = statuses.filter((status) => status === 429).length;
    expect(refused).toBeGreaterThanOrEqual(2);
  });

  it('names the wait when it refuses', async () => {
    const shared = { 'x-forwarded-for': '203.0.113.10' };
    let response = await post({ reportId: SAMPLE, question: 'Anything?' }, shared);
    for (let attempt = 0; attempt < LIMITS.rateLimit.capacity + 1; attempt += 1) {
      response = await post({ reportId: SAMPLE, question: 'Anything?' }, shared);
    }

    expect(response.status).toBe(429);
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('sends a question about a report that is gone to the page that explains why', async () => {
    const response = await post({ reportId: VANISHED, question: 'What is the notice period?' });

    // Not a 500 and not a bare 404. The report page owns the "held in memory, never
    // written anywhere, so it is gone" wording and the offer of a sample.
    expect(response.status).toBe(303);
    expect(location(response)).toBe(`/report/${VANISHED}`);
  });

  it('refuses a report id it would have to put in a header unchecked', async () => {
    const response = await post({ reportId: 'not a valid id\r\nX-Injected: 1', question: 'Hm?' });

    expect(response.status).toBe(400);
    expect(response.headers.get('location')).toBeNull();
  });

  it('refuses a post with no report id at all', async () => {
    const response = await post({ question: 'What is the notice period?' });
    expect(response.status).toBe(400);
  });

  it('refuses an empty question without spending anything', async () => {
    const response = await post({ reportId: SAMPLE, question: '   ' });

    expect(response.status).toBe(303);
    expect(location(response)).toContain('askError=empty');
  });

  it('refuses an over-long question rather than truncating it', async () => {
    // A silently shortened question is answered on terms the reader did not set, and
    // the length ceiling exists to stop a second document being smuggled past the
    // document boundary.
    const response = await post({
      reportId: SAMPLE,
      question: 'x'.repeat(LIMITS.maxQuestionChars + 1),
    });

    expect(response.status).toBe(303);
    expect(location(response)).toContain('askError=too_long');
  });

  it('turns an unreachable model into a message rather than a stack trace', async () => {
    // No key is configured in CI and the network is stubbed to throw, so this is the
    // path a reader takes when the day's quota has run out.
    const response = await post({ reportId: SAMPLE, question: 'What is the notice period?' });

    expect(response.status).toBe(303);
    expect(location(response)).toContain('askError=unavailable');
  });

  it('never puts the question or a quote in the redirect', async () => {
    const question = 'What is my provident fund contribution under this offer?';
    const response = await post({ reportId: SAMPLE, question });

    // URLs reach browser history, Referer headers and every proxy log in between.
    // Only an opaque code or token may travel there.
    expect(location(response)).not.toContain('provident');
    expect(decodeURIComponent(location(response))).not.toContain(question);
  });
});
