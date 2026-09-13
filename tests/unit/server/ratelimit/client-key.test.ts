import { describe, expect, it, vi } from 'vitest';

import { clientKey } from '@/server/ratelimit/client-key';

vi.mock('server-only', () => ({}));

/**
 * The limiter has to tell one client from another; it must never be able to say which
 * client. An IP address is personal data under the DPDP Act 2023, and this product's
 * first claim is that it holds nothing identifying — so the assertions here are as
 * much about what the key is NOT as about what it is.
 */

const SALT = 'a-process-salt';
const IP = '203.0.113.42';

const headers = (values: Record<string, string>): Headers => new Headers(values);

describe('clientKey', () => {
  it('never contains the address it was derived from, in any form', () => {
    const key = clientKey(headers({ 'x-forwarded-for': IP }), SALT);

    expect(key).not.toContain(IP);
    // Nor an encoding of it. Asserting that no individual octet appears would be
    // asserting luck — hex digits and dotted quads share an alphabet — so the claim
    // worth making is that the key is a digest, and the test below that it is salted.
    expect(key).not.toContain(IP.replaceAll('.', ''));
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is stable for one address, so a client keeps its own bucket', () => {
    const first = clientKey(headers({ 'x-forwarded-for': IP }), SALT);
    const second = clientKey(headers({ 'x-forwarded-for': IP }), SALT);

    expect(first).toBe(second);
  });

  it('separates two addresses', () => {
    const mine = clientKey(headers({ 'x-forwarded-for': IP }), SALT);
    const theirs = clientKey(headers({ 'x-forwarded-for': '198.51.100.7' }), SALT);

    expect(mine).not.toBe(theirs);
  });

  it('changes with the salt, so the digest is not a reversible encoding', () => {
    // IPv4 is a 32-bit space. An unsalted SHA-256 of every address on the internet is
    // a few hours of compute, which would make an unsalted key a lookup away from the
    // address it was meant to hide.
    const salted = clientKey(headers({ 'x-forwarded-for': IP }), SALT);
    const otherwise = clientKey(headers({ 'x-forwarded-for': IP }), 'a-different-salt');

    expect(salted).not.toBe(otherwise);
  });

  it('reads the client from the first entry of a proxy chain', () => {
    const direct = clientKey(headers({ 'x-forwarded-for': IP }), SALT);
    const throughProxies = clientKey(
      headers({ 'x-forwarded-for': `${IP}, 70.41.3.18, 150.172.238.178` }),
      SALT,
    );

    // Later entries are proxies that appended themselves. Keying on the whole header
    // would give one client a fresh bucket for every path its traffic happened to take.
    expect(throughProxies).toBe(direct);
  });

  it('tolerates the spacing a proxy actually produces', () => {
    const tight = clientKey(headers({ 'x-forwarded-for': `${IP},10.0.0.1` }), SALT);
    const spaced = clientKey(headers({ 'x-forwarded-for': `  ${IP} , 10.0.0.1 ` }), SALT);

    expect(spaced).toBe(tight);
  });

  it('falls back to x-real-ip when no forwarded chain is present', () => {
    const forwarded = clientKey(headers({ 'x-forwarded-for': IP }), SALT);
    const real = clientKey(headers({ 'x-real-ip': IP }), SALT);

    expect(real).toBe(forwarded);
  });

  it('prefers x-forwarded-for when both are set, because Cloud Run sets that one', () => {
    const both = clientKey(headers({ 'x-forwarded-for': IP, 'x-real-ip': '198.51.100.7' }), SALT);

    expect(both).toBe(clientKey(headers({ 'x-forwarded-for': IP }), SALT));
  });

  it('falls back to x-real-ip when the forwarded chain is blank rather than absent', () => {
    const blank = clientKey(headers({ 'x-forwarded-for': '   ', 'x-real-ip': IP }), SALT);

    expect(blank).toBe(clientKey(headers({ 'x-real-ip': IP }), SALT));
  });

  it('puts every unattributable request into one shared bucket', () => {
    const anonymous = clientKey(headers({}), SALT);
    const alsoAnonymous = clientKey(headers({ 'user-agent': 'curl/8.4.0' }), SALT);

    // Behind the intended deployment this never happens; the load balancer always sets
    // the header. Sharing one bucket is the conservative reading of the alternative,
    // which would be letting an unattributable request through unmetered.
    expect(anonymous).toBe(alsoAnonymous);
    expect(anonymous).not.toMatch(/^[0-9a-f]{32}$/);
  });
});
