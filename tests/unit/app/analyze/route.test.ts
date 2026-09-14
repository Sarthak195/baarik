import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as analyze } from '@/app/analyze/route';
import type * as EnvModule from '@/server/config/env';
import { LIMITS } from '@/server/config/limits';
import { clearRateLimits } from '@/server/ratelimit/token-bucket';
import { clearReports, getReport, reportCount } from '@/server/store/report-store';

import { installGateway, resetGateway, sentRequests } from '../../../fakes/genai-gateway';
import { replayGolden } from '../../../fakes/llm-gateway';

/**
 * The HTTP boundary of `/analyze`, which nothing used to cross.
 *
 * Every other test in this repository calls a function with an argument. This one
 * builds a `Request`, hands it to the exported `POST`, and reads the `Response` —
 * which is the only layer where the form and the handler meet, and therefore the only
 * layer where they can disagree.
 *
 * They did disagree, and it shipped. `PasteForm` posts the file under `documentFile`;
 * the handler read `form.get('document')`. Every upload was discarded in silence, the
 * handler fell through to the pasted-text path, and the reader was told they had not
 * attached anything. Nothing in a suite of unit tests could see it: both sides were
 * individually correct and individually tested, and the defect lived entirely in the
 * string that joined them. That is the gap this file exists to close.
 *
 * No model is called. `vi.mock` points the route's own gateway at
 * `tests/fakes/genai-gateway.ts`, which answers from `golden/llm/<id>.json` — the
 * recorded output of a real model — so the whole pipeline runs offline, exactly as
 * `tests/golden/reports.test.ts` runs it, and the free tier's twenty requests a day
 * are untouched.
 */

// Hoisted above the route import by Vitest, so the handler resolves the stand-in rather
// than the real ladder. The path is this module's, not the route's: a mock factory is
// evaluated where it is written.
vi.mock('@/server/genai/gateway', async () => await import('../../../fakes/genai-gateway'));

/**
 * The key pool is resolved inside the handler, one line before the model is called, and
 * throws when the environment holds no credential. CI holds none — that is the point of
 * the offline suite — so without this the happy path would redirect to the error page on
 * a machine with no key and to the report on a machine with one, which is not a test.
 */
vi.mock('@/server/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return { ...actual, getGeminiKeyPool: () => new actual.KeyPool(['replayed-never-sent']) };
});

/** A committed fixture with a recorded analysis. Its report is the expected outcome. */
const ANALYSED = 'offer-letter-meridian';

/** The supermarket receipt. Recorded as `not_a_document`, so it exercises the refusal. */
const REFUSED = 'grocery-bill';

/** A phrase from the fixture's third line, used to prove which input reached the model. */
const FROM_THE_FILE = 'MERIDIAN SYSTEMS';

/**
 * The address the container answers on behind Cloud Run.
 *
 * Used as the request URL throughout rather than `localhost`, so every assertion about
 * `Location` is a regression test for the incident that produced this rule: a redirect
 * built with `new URL(target, request.url)` sent every browser to `https://0.0.0.0:8080/`,
 * and looked perfect in local testing where the internal and external addresses agree.
 */
const CONTAINER = 'http://0.0.0.0:8080/analyze';

/** `randomUUID`, and nothing else, may appear in a report path. */
const REPORT_PATH = /^\/report\/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}(\?|$)/;

beforeEach(() => {
  clearRateLimits();
  clearReports();
  resetGateway();
});

function fixtureText(id: string): string {
  return readFileSync(join(process.cwd(), 'fixtures', `${id}.txt`), 'utf8');
}

/** The fixture as a browser would upload it: a real `File` with a real name. */
function fixtureFile(id: string): File {
  return new File([fixtureText(id)], `${id}.txt`, { type: 'text/plain' });
}

function formOf(fields: Readonly<Record<string, string | File>>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return form;
}

function post(body: BodyInit, headers: Readonly<Record<string, string>> = {}): Promise<Response> {
  return analyze(new Request(CONTAINER, { method: 'POST', body, headers }));
}

function location(response: Response): string {
  return response.headers.get('location') ?? '';
}

/** The report id out of a successful redirect, so the store can be checked for it. */
function reportIdIn(response: Response): string {
  return location(response).replace('/report/', '').split('?')[0] ?? '';
}

/** Everything the pipeline put in front of the model, as one string. */
function everythingSent(): string {
  return sentRequests()
    .map((request) => request.context)
    .join('\n');
}

describe('POST /analyze — the uploaded file', () => {
  it('reads the file from the field name the form actually posts', async () => {
    installGateway(replayGolden(ANALYSED));

    // Only the file, exactly as a reader who ignored the textarea would send it. If the
    // handler reads any other name, `extract` finds nothing, falls through to the empty
    // paste path, and this is a redirect back to the form instead of to a report.
    const response = await post(formOf({ documentFile: fixtureFile(ANALYSED), lang: 'en' }));

    expect(response.status).toBe(303);
    expect(location(response)).toMatch(REPORT_PATH);
    expect(getReport(reportIdIn(response), Date.now())).not.toBeNull();
  });

  it('sends the uploaded file to the model, not the textarea beside it', async () => {
    installGateway(replayGolden(ANALYSED));
    const decoy = 'A stale textarea from an earlier attempt that must never reach the model.';

    const response = await post(
      formOf({ documentText: decoy, documentFile: fixtureFile(ANALYSED), lang: 'en' }),
    );

    // The response alone cannot tell these apart — both inputs produce a 303 to a report,
    // because the replayed gateway answers whatever it is asked. What distinguishes them
    // is the bytes the pipeline put in front of the model, so that is what is asserted.
    // This is the assertion the original defect would have failed: reading the wrong
    // field name substitutes the textarea for the file and nothing else changes.
    expect(everythingSent()).toContain(FROM_THE_FILE);
    expect(everythingSent()).not.toContain(decoy);
    expect(response.status).toBe(303);
  });

  it('ignores the empty file part a browser posts when nothing was chosen', async () => {
    installGateway(replayGolden(ANALYSED));

    // A `<input type="file">` left untouched still submits — as a part with an empty
    // filename and zero bytes. Treating that as an upload would refuse every paste made
    // by someone who never opened the file picker, which is most of them.
    const response = await post(
      formOf({ documentText: fixtureText(ANALYSED), documentFile: new File([], ''), lang: 'en' }),
    );

    expect(response.status).toBe(303);
    expect(location(response)).toMatch(REPORT_PATH);
    expect(everythingSent()).toContain(FROM_THE_FILE);
  });
});

describe('POST /analyze — the pasted document', () => {
  it('answers a pasted document with a 303 to its report', async () => {
    installGateway(replayGolden(ANALYSED));

    const response = await post(formOf({ documentText: fixtureText(ANALYSED), lang: 'en' }));

    // 303 rather than 302, so the browser follows with a GET: the report URL stays
    // shareable and a refresh cannot re-post the document and spend quota again.
    expect(response.status).toBe(303);
    expect(location(response)).toMatch(REPORT_PATH);
  });

  it('leaves a report at the id it redirected to', async () => {
    installGateway(replayGolden(ANALYSED));

    const response = await post(formOf({ documentText: fixtureText(ANALYSED), lang: 'en' }));
    const view = getReport(reportIdIn(response), Date.now());

    // A redirect to a report that was never stored is a 303 into a "no longer available"
    // page, which is indistinguishable from success at the status-code level. The store
    // is therefore checked rather than inferred.
    expect(view).not.toBeNull();
    expect(view?.documentText).toContain(FROM_THE_FILE);
    expect(view?.clauses.length ?? 0).toBeGreaterThan(0);
  });
});

describe('POST /analyze — refusals and failures', () => {
  it('sends an empty submission back to the form with a reason', async () => {
    const response = await post(formOf({ documentText: '', lang: 'en' }));

    expect(response.status).toBe(303);
    expect(location(response)).toContain('error=');
    expect(decodeURIComponent(location(response))).toContain('No document was uploaded');
  });

  it('never reaches the model for a submission with nothing in it', async () => {
    await post(formOf({ documentText: '', lang: 'en' }));

    // Ingest refuses before the pipeline starts. A handler that classified an empty
    // string first would spend a request of a twenty-a-day allowance on it.
    expect(sentRequests()).toHaveLength(0);
  });

  it('keeps the disclaimer acknowledgement on the way back to the form', async () => {
    const response = await post(formOf({ documentText: '', lang: 'en' }));

    // Dropping `understood=1` bounces the reader onto the disclaimer gate — a second
    // punishment for a failed upload, and a bug this project has already had once.
    expect(location(response)).toContain('understood=1');
    expect(location(response).startsWith('/?understood=1')).toBe(true);
  });

  it('reports a refused document as a refusal rather than as an error', async () => {
    installGateway(replayGolden(REFUSED));

    const response = await post(formOf({ documentText: fixtureText(REFUSED), lang: 'en' }));

    // A supermarket receipt is not a failure of the system, and the landing page says
    // something different for `refused` than for `error`. Collapsing the two would tell
    // someone who uploaded a bill that the site is broken.
    expect(response.status).toBe(303);
    expect(location(response)).toContain('refused=');
    expect(location(response)).not.toContain('error=');
    expect(location(response)).toContain('understood=1');
  });

  it('stores no report for a document it refused', async () => {
    installGateway(replayGolden(REFUSED));

    await post(formOf({ documentText: fixtureText(REFUSED), lang: 'en' }));

    expect(reportCount()).toBe(0);
  });
});

describe('POST /analyze — the Location header', () => {
  /**
   * Behind Cloud Run the container is addressed internally, so `request.url` reads
   * `http://0.0.0.0:8080/analyze`. A `Location` rebuilt from it points the browser at a
   * host it cannot reach — which is what happened in production, on every successful
   * analysis, having worked perfectly in local testing where the two addresses agree.
   *
   * A relative target is explicitly permitted (RFC 7231 §7.1.2) and resolves against
   * whatever the reader typed, so it needs no proxy header to be trusted or parsed.
   * Asserted on every redirecting path, because one absolute `Location` anywhere in the
   * handler is one broken journey.
   */
  it('is relative on every redirect, whatever the container is addressed as', async () => {
    installGateway(replayGolden(ANALYSED));
    const success = await post(formOf({ documentText: fixtureText(ANALYSED), lang: 'en' }));

    const failure = await post(formOf({ documentText: '', lang: 'en' }));

    resetGateway();
    installGateway(replayGolden(REFUSED));
    const refusal = await post(formOf({ documentText: fixtureText(REFUSED), lang: 'en' }));

    for (const response of [success, failure, refusal]) {
      const target = location(response);
      expect(target.startsWith('/')).toBe(true);
      expect(target).not.toContain('0.0.0.0');
      expect(target).not.toContain('://');
    }
  });
});

describe('POST /analyze — the rate limiter', () => {
  /** One address, so every request in a test lands in the same bucket. */
  const CALLER = { 'x-forwarded-for': '198.51.100.7' };

  async function exhaust(): Promise<Response> {
    let last = await post(formOf({ documentText: '' }), CALLER);
    for (let attempt = 0; attempt < LIMITS.rateLimit.capacity + 1; attempt += 1) {
      last = await post(formOf({ documentText: '' }), CALLER);
    }
    return last;
  }

  it('refuses with 429 and a usable wait once the bucket is empty', async () => {
    const response = await exhaust();

    expect(response.status).toBe(429);
    // A `Retry-After: 0` invites an immediate retry, which is the behaviour the header
    // exists to prevent.
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(response.headers.get('content-type')).toMatch(/text\/plain/);
  });

  it('points at the samples, which cost no quota, rather than apologising', async () => {
    const response = await exhaust();

    // The message is the only thing a refused reader gets, and there is a way through:
    // the committed analyses are complete and work while this endpoint will not.
    expect(await response.text()).toContain('sample documents');
  });

  it('decides before the body is read', async () => {
    await exhaust();

    // A body that `formData()` cannot parse. If the limiter ran after the parse, this
    // would reject out of the handler; a 429 proves nothing touched the body. That
    // ordering is the whole value of the limiter — parsing a 10 MB upload and then
    // refusing it spends the resource the limit exists to protect.
    const response = await post('this is not a form', {
      ...CALLER,
      'content-type': 'application/octet-stream',
    });

    expect(response.status).toBe(429);
  });

  it('spends no model request on anything it refused', async () => {
    await exhaust();

    // Quota, not CPU, is what the bucket protects. Every request in this test was
    // either refused by ingest or refused by the limiter, so the model saw none of them.
    expect(sentRequests()).toHaveLength(0);
  });
});

describe('POST /analyze — language', () => {
  it('carries the requested language through to the report', async () => {
    installGateway(replayGolden(ANALYSED));

    const response = await post(formOf({ documentText: fixtureText(ANALYSED), lang: 'hi' }));

    // The reader chose Hindi on the form; landing on an English report would make the
    // choice look like it had not registered.
    expect(location(response)).toMatch(REPORT_PATH);
    expect(location(response)).toContain('lang=hi');
  });

  it('carries it back to the form when the upload fails', async () => {
    const response = await post(formOf({ documentText: '', lang: 'hi' }));

    expect(location(response)).toContain('lang=hi');
    expect(location(response)).toContain('understood=1');
  });

  it('falls back to English rather than failing on a language it does not know', async () => {
    installGateway(replayGolden(ANALYSED));

    const response = await post(formOf({ documentText: fixtureText(ANALYSED), lang: 'kl' }));

    // A mistyped query parameter must not be able to turn a legal document into an
    // error page.
    expect(response.status).toBe(303);
    expect(location(response)).not.toContain('lang=');
  });
});

/**
 * The document-type `<select>`, which used to do nothing at all.
 *
 * It offers every type Baarik understands, defaulting to "let Baarik work it out", and
 * for most of this project's life `/analyze` never read it: the reader chose a type, the
 * pipeline classified the document anyway, and the choice was discarded in silence. That
 * is the same defect as the upload bug — a control whose two ends never met — and
 * `form-contract.test.ts` held it as a named, asserted gap until it was closed.
 *
 * The type is not cosmetic. It selects which rubric rules apply, which baseline the
 * numbers are compared against, and which absences are worth checking, so a lease read as
 * an offer letter is scored against the wrong questions entirely.
 */
describe('the document type the reader chose', () => {
  it('overrides what the model would have classified the document as', async () => {
    installGateway(replayGolden(ANALYSED));

    const response = await post(
      formOf({ documentText: fixtureText(ANALYSED), documentType: 'rent_agreement' }),
    );

    // The recording classifies this fixture as an employment offer. Asserting against
    // the recording rather than against a literal is what makes this a test of the
    // override: if the field were ignored again, the answer would be `employment_offer`.
    const report = getReport(reportIdIn(response), Date.now());
    expect(report?.documentType).toBe('rent_agreement');
  });

  it('falls back to classification when the reader expresses no preference', async () => {
    installGateway(replayGolden(ANALYSED));

    // The empty string is what the default option posts, and it must mean "no
    // preference" rather than an invalid type that rejects the whole submission.
    const response = await post(formOf({ documentText: fixtureText(ANALYSED), documentType: '' }));

    expect(location(response)).toMatch(REPORT_PATH);
    expect(getReport(reportIdIn(response), Date.now())?.documentType).toBe('employment_offer');
  });

  it('does not let a declared type talk the system out of refusing a receipt', async () => {
    installGateway(replayGolden(REFUSED));

    const response = await post(
      formOf({ documentText: fixtureText(REFUSED), documentType: 'rent_agreement' }),
    );

    // "Is this an agreement at all" and "which kind of agreement is it" are different
    // questions. Someone who picks a type and then attaches the wrong file is precisely
    // who needs to be told they uploaded a supermarket receipt, so the refusal gate sits
    // above the override and cannot be argued with.
    expect(location(response)).toContain('refused=');
    expect(reportCount()).toBe(0);
  });

  it('ignores a hand-crafted type rather than rejecting the submission', async () => {
    installGateway(replayGolden(ANALYSED));

    // The field comes from a `<select>`, so anything unrecognised is a forged request.
    // Falling back to classification is a better answer than a 400 for a preference.
    const response = await post(
      formOf({ documentText: fixtureText(ANALYSED), documentType: 'not_a_real_type' }),
    );

    expect(location(response)).toMatch(REPORT_PATH);
    expect(getReport(reportIdIn(response), Date.now())?.documentType).toBe('employment_offer');
  });
});

/**
 * A body that is not a form at all.
 *
 * `formData()` throws on a content type it cannot parse, and that throw used to escape
 * the handler: the reply was a 500, which tells the caller the server broke when in fact
 * their request did. Only reachable by hand — a browser always sends the right type — but
 * a 500 is an invitation to keep trying, and the rate limiter has to run before the parse
 * for that retry to cost nothing.
 */
describe('a body that is not a form', () => {
  it('is a 400 rather than a 500, and spends no quota', async () => {
    installGateway(replayGolden(ANALYSED));

    const response = await post('this is not multipart at all', {
      'content-type': 'application/octet-stream',
    });

    expect(response.status).toBe(400);
    expect(sentRequests()).toHaveLength(0);
    expect(reportCount()).toBe(0);
  });

  it('is still refused after the rate limiter, so a retry loop costs nothing', async () => {
    // The limiter runs first, so a client hammering a malformed body is throttled by the
    // same bucket as one hammering a real upload.
    for (let i = 0; i < LIMITS.rateLimit.capacity; i += 1) {
      await post('not a form', { 'content-type': 'application/octet-stream' });
    }
    const response = await post('not a form', { 'content-type': 'application/octet-stream' });

    expect(response.status).toBe(429);
  });
});
