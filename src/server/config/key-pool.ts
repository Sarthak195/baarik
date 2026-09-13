import 'server-only';

/**
 * A round-robin pool of interchangeable API keys.
 *
 * Free-tier Gemini quota is enforced per key and the exact ceilings are unpublished,
 * so the only reliable way to survive several evaluators using the demo at once is to
 * hold more than one key and move off a key the moment it answers 429. A pool turns a
 * hard stop into a slower answer, which is the difference between a demo that works
 * and one that is wedged for a minute at the worst possible time.
 *
 * The class holds no timers and reads no clock: a penalised key is demoted by position
 * rather than parked until a timestamp. That costs a little precision — a key whose
 * quota window has since reset is not promoted back early — and buys a component that
 * can be tested exhaustively with no fake timers and behaves identically on every run.
 *
 * Demotion rather than eviction also means a permanently dead key — a revoked one, say
 * — costs one wasted attempt per full rotation instead of poisoning the pool: it sinks
 * to the back, every working key is still handed out in turn, and it starts working
 * again by itself if the operator re-enables it.
 */
export class KeyPool {
  /** Preference order. The penalised key is always the last element. */
  readonly #keys: string[];
  #cursor = 0;

  constructor(keys: readonly string[]) {
    if (keys.length === 0) {
      throw new Error('KeyPool requires at least one key.');
    }
    this.#keys = [...keys];
  }

  get size(): number {
    return this.#keys.length;
  }

  /** The next key in rotation. Spreads load so no single key is the first to hit its cap. */
  next(): string {
    const key = this.#keys[this.#cursor];
    this.#cursor = (this.#cursor + 1) % this.#keys.length;
    // The cursor is kept in range by every path that moves it, so this branch does not
    // run. It is a guard rather than an assertion because `as string` would state a
    // fact the compiler cannot check, and the lint rules reject that on principle.
    if (key === undefined) throw new Error('KeyPool lost its cursor.');
    return key;
  }

  /**
   * Demote a key that just reported rate limiting, moving it behind every other key.
   *
   * The cursor is rewound onto whichever key moved up into the vacated slot, so the
   * caller's retry takes that key immediately. Without the rewind, a retry after a 429
   * would skip a perfectly good key, and when the penalised key happened to be last it
   * would be handed straight back the key that had just failed.
   *
   * Unknown keys are ignored rather than rejected: a caller holding a key from a pool
   * that has since been rebuilt should not lose a request over bookkeeping.
   */
  penalise(key: string): void {
    const index = this.#keys.indexOf(key);
    if (index === -1) return;

    this.#keys.splice(index, 1);
    // Computed against the pool with the penalised key already removed, which is what
    // makes it impossible for the rewind to land back on it.
    this.#cursor = this.#keys.length === 0 ? 0 : index % this.#keys.length;
    this.#keys.push(key);
  }

  /** The current preference order. Copied, so a caller cannot reorder the pool by accident. */
  snapshot(): readonly string[] {
    return [...this.#keys];
  }
}
