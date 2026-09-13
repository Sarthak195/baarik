import { beforeEach, describe, expect, it } from 'vitest';

import { GET as health } from '@/app/api/health/route';
import { GET as sample } from '@/app/api/sample/route';
import { resetSamples } from '@/server/samples/repository';

/**
 * The two endpoints an evaluator touches without reading any code: the sample link on
 * the landing page, and a curl of /api/health when something looks wrong.
 *
 * Neither may call a model. `tests/setup.ts` stubs `fetch` to throw, so a route that
 * reached the network would fail here rather than silently spending free-tier quota on
 * every uptime probe.
 */

beforeEach(() => {
  resetSamples();
});

const get = (url: string): Response | Promise<Response> => sample(new Request(url));

describe('GET /api/sample', () => {
  it('serves a committed analysis', async () => {
    const response = await get('http://localhost/api/sample?id=offer-letter-meridian');

    expect(response.status).toBe(200);
    const body = (await response.json()) as { kind: string; report: { documentType: string } };
    expect(body.kind).toBe('report');
    expect(body.report.documentType).toBe('employment_offer');
  });

  it('serves the refusal sample as a refusal, not an error', async () => {
    const response = await get('http://localhost/api/sample?id=grocery-bill');

    // The receipt is a first-class sample: a 200 carrying `not_a_document`, because
    // that is exactly what the live pipeline returns for the same input.
    expect(response.status).toBe(200);
    const body = (await response.json()) as { kind: string };
    expect(body.kind).toBe('not_a_document');
  });

  it('answers 404 with a plain message for an unknown id', async () => {
    const response = await get('http://localhost/api/sample?id=no-such-sample');

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toMatch(/text\/plain/);
    const text = await response.text();
    expect(text).toContain('No sample named "no-such-sample"');
    expect(text).toContain('offer-letter-meridian');
  });

  it('answers 400 when no id is given', async () => {
    const response = await get('http://localhost/api/sample');

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Pass a sample id');
  });

  it('does not reflect an arbitrary query string into the body', async () => {
    const response = await get(
      'http://localhost/api/sample?id=' + encodeURIComponent('<script>alert(1)</script>'),
    );

    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).not.toContain('<script>');
    expect(text).toContain('scriptalert1script');
  });
});

describe('GET /api/health', () => {
  it('reports the knowledge base and sample counts', async () => {
    const response = await health();
    const body = (await response.json()) as Record<string, unknown>;

    // The numbers that make a deploy missing data/ or golden/ visible in one curl.
    expect(body.rubricRules).toBe(43);
    expect(body.enforceabilityRows).toBe(11);
    expect(body.forums).toBe(9);
    expect(body.limitationRules).toBe(7);
    expect(body.samples).toBeGreaterThan(0);
    expect(body.model).toBe('gemini-3.8-flash');
    expect(typeof body.geminiKeys).toBe('number');
  });

  it('never returns key material, only a count', async () => {
    const response = await health();
    const text = await response.text();

    // A truncated secret is still a secret: a prefix says which key, a suffix narrows a
    // brute force, and a health endpoint is public.
    expect(text).not.toMatch(/AIza/);
    for (const key of collectKeys()) {
      expect(text).not.toContain(key);
      if (key.length > 8) expect(text).not.toContain(key.slice(-8));
    }
  });

  it('reports a missing key as a problem rather than failing to answer', async () => {
    const response = await health();
    const body = (await response.json()) as { ok: boolean; problems?: readonly string[] };

    // CI runs with no key at all. The endpoint must still answer with the counts it
    // does know, because "no key" is precisely the deployment fault it exists to show.
    expect([200, 503]).toContain(response.status);
    expect(body.ok).toBe(response.status === 200);
    if (!body.ok) expect(body.problems?.length).toBeGreaterThan(0);
  });
});

/** Whatever keys this machine happens to have configured, so the check is not vacuous. */
function collectKeys(): readonly string[] {
  return Object.entries(process.env)
    .filter(([name]) => name.startsWith('GEMINI_API_KEY'))
    .flatMap(([, value]) => (value ?? '').split(/[\s,]+/))
    .filter((key) => key.length > 0);
}
