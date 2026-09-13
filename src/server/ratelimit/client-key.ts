import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Who is asking, reduced to something that cannot be turned back into who is asking.
 *
 * An IP address is personal data under the DPDP Act 2023, and this product's first
 * claim is that it holds nothing identifying. A rate limiter needs to tell one client
 * from another; it does not need to know which client, ever. Hashing satisfies the
 * first requirement and removes the second, so the map it keys holds no address even
 * in a heap dump — and there is nothing for a log line to leak by accident.
 *
 * The hash is salted with a value generated at process start (see `token-bucket.ts`).
 * IPv4 is a 32-bit space: an unsalted SHA-256 of every address on the internet is a
 * few hours of compute, so an unsalted digest is a reversible encoding of the address
 * rather than a one-way function of it. A salt that never leaves memory closes that.
 */

/** What Cloud Run's load balancer sets. The client is the first entry; the rest is the proxy chain. */
const FORWARDED_FOR = 'x-forwarded-for';

/** What most other reverse proxies set. Checked second because Cloud Run is the target. */
const REAL_IP = 'x-real-ip';

/**
 * One shared bucket for requests that carry neither header.
 *
 * Behind the intended deployment that never happens — the load balancer always sets
 * `x-forwarded-for`. Locally, and on any direct connection, it does. Sharing one
 * bucket between such requests is the conservative reading: the alternative is to let
 * an unattributable request through unmetered, and quota is the thing being protected.
 */
const UNATTRIBUTED = 'unattributed';

/** Long enough that two clients colliding is not a thing that happens. */
const KEY_LENGTH = 32;

function readClientAddress(headers: Headers): string | null {
  const forwarded = headers.get(FORWARDED_FOR);
  if (forwarded !== null) {
    // Only the first entry is the client. Every later entry is a proxy that appended
    // itself, and a client can prepend whatever it likes — which is why this value
    // bounds quota and is never treated as an identity.
    const first = forwarded.split(',')[0]?.trim() ?? '';
    if (first.length > 0) return first;
  }

  const real = headers.get(REAL_IP)?.trim() ?? '';
  return real.length > 0 ? real : null;
}

export function clientKey(headers: Headers, salt: string): string {
  const address = readClientAddress(headers);
  if (address === null) return UNATTRIBUTED;

  return createHash('sha256').update(salt).update(address).digest('hex').slice(0, KEY_LENGTH);
}
