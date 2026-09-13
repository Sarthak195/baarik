import { describe, expect, it, vi } from 'vitest';

import { LIMITS } from '@/server/config/limits';

vi.mock('server-only', () => ({}));

/**
 * These assert relationships, not values. A test that restates `maxPdfPages === 120`
 * only makes the number harder to change; what is worth pinning is the handful of
 * places where two limits have to agree, because those are the ones that break quietly
 * when one of them is tuned in isolation.
 */
describe('LIMITS', () => {
  it('keeps the pasted-text cap at or below the canonical cap', () => {
    // Otherwise a paste could be accepted and then silently truncated by canonicalisation,
    // which is the one failure this product must never produce without saying so.
    expect(LIMITS.maxPasteChars).toBeLessThanOrEqual(LIMITS.maxCanonicalChars);
  });

  it('matches the canonicalisation default it mirrors', async () => {
    const { CANONICALISE_DEFAULTS } = await import('@/core/document/normalise');
    expect(LIMITS.maxCanonicalChars).toBe(CANONICALISE_DEFAULTS.maxChars);
  });

  it('sets the scanned-page threshold well below a real page of prose', () => {
    // A dense legal page runs into the thousands of characters; the guard has to sit far
    // enough below that a sparse but genuine page is not mistaken for a scan.
    expect(LIMITS.minPdfCharsPerPage).toBeGreaterThan(0);
    expect(LIMITS.minPdfCharsPerPage).toBeLessThan(1_000);
  });

  it('allows a burst larger than one request but refills slower than a script', () => {
    expect(LIMITS.rateLimit.capacity).toBeGreaterThan(1);
    expect(LIMITS.rateLimit.refillPerMinute).toBeLessThan(LIMITS.rateLimit.capacity);
  });

  it('keeps a question far smaller than a document, so it cannot smuggle one in', () => {
    expect(LIMITS.maxQuestionChars).toBeLessThan(LIMITS.maxPasteChars / 100);
  });

  it('bounds every limit it publishes', () => {
    expect(LIMITS.maxUploadBytes).toBeGreaterThan(0);
    expect(LIMITS.maxPdfPages).toBeGreaterThan(0);
    expect(LIMITS.maxFindings).toBeGreaterThan(0);
    expect(LIMITS.requestTimeoutMs).toBeGreaterThan(0);
  });
});
