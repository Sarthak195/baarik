import { describe, expect, it, vi } from 'vitest';

import { KeyPool } from '@/server/config/key-pool';

// `server-only` throws by design anywhere outside a React Server Component, which is the
// whole point of the marker. Vitest is not one, so the marker is stubbed rather than the
// import removed — that import is a hard requirement on every file in src/server, and a
// test suite must not be the reason it disappears. `vi.mock` is hoisted above the imports
// above, so the stub is registered before `key-pool` is evaluated.
vi.mock('server-only', () => ({}));

describe('KeyPool', () => {
  it('refuses to exist without a key, rather than handing out undefined later', () => {
    expect(() => new KeyPool([])).toThrow(/at least one key/i);
  });

  it('hands out keys in rotation and wraps', () => {
    const pool = new KeyPool(['a', 'b', 'c']);
    expect([pool.next(), pool.next(), pool.next(), pool.next()]).toEqual(['a', 'b', 'c', 'a']);
  });

  it('always returns the same key when the pool holds one', () => {
    const pool = new KeyPool(['only']);
    expect([pool.next(), pool.next()]).toEqual(['only', 'only']);
    pool.penalise('only');
    expect(pool.next()).toBe('only');
  });

  it('moves a penalised key to the back and takes the key that replaced it', () => {
    const pool = new KeyPool(['a', 'b', 'c']);

    expect(pool.next()).toBe('a');
    pool.penalise('a');

    expect(pool.snapshot()).toEqual(['b', 'c', 'a']);
    // Without the cursor rewind this would skip 'b' and could land back on 'a'.
    expect(pool.next()).toBe('b');
  });

  it('does not hand back a key that was penalised while already last', () => {
    const pool = new KeyPool(['a', 'b', 'c']);
    pool.penalise('c');

    expect(pool.snapshot()).toEqual(['a', 'b', 'c']);
    expect(pool.next()).not.toBe('c');
  });

  it('penalises a middle key without disturbing the keys around it', () => {
    const pool = new KeyPool(['a', 'b', 'c']);
    pool.penalise('b');

    expect(pool.snapshot()).toEqual(['a', 'c', 'b']);
    expect(pool.next()).toBe('c');
  });

  it('ignores a key it does not hold', () => {
    const pool = new KeyPool(['a', 'b']);
    pool.penalise('not-in-the-pool');

    expect(pool.snapshot()).toEqual(['a', 'b']);
    expect(pool.size).toBe(2);
  });

  /**
   * The deployment this runs in holds one revoked key alongside two working ones, so
   * "a key that always fails" is the real case rather than a hypothetical.
   */
  it('keeps serving the working keys when one key is permanently dead', () => {
    const dead = 'revoked';
    const pool = new KeyPool([dead, 'good-1', 'good-2']);
    const served: string[] = [];

    // Ten requests, each retrying once past a dead key, exactly as a caller would.
    for (let request = 0; request < 10; request += 1) {
      let key = pool.next();
      if (key === dead) {
        pool.penalise(key);
        key = pool.next();
      }
      served.push(key);
    }

    expect(served).not.toContain(dead);
    expect(new Set(served)).toEqual(new Set(['good-1', 'good-2']));
    // Both good keys carry real traffic; neither is starved by the rotation.
    expect(served.filter((key) => key === 'good-1').length).toBeGreaterThan(2);
    expect(served.filter((key) => key === 'good-2').length).toBeGreaterThan(2);
    // The dead key is demoted, never dropped: re-enabling it needs no restart.
    expect(pool.size).toBe(3);
  });

  it('hands out a copy of the order, so a caller cannot reorder the pool', () => {
    const pool = new KeyPool(['a', 'b']);
    const snapshot = [...pool.snapshot()].reverse();

    expect(snapshot).toEqual(['b', 'a']);
    expect(pool.snapshot()).toEqual(['a', 'b']);
  });
});

/**
 * The gateway budgets exactly `size` attempts per model and penalises every key that
 * answers 429, so what the pool does under a whole round of failures decides whether a
 * model really gets all six keys or quietly gets fewer. These pin the properties the
 * ladder leans on, which the single-penalty cases above do not reach.
 */
describe('KeyPool under sustained failure', () => {
  it('still reaches every key exactly once per rotation after a penalty', () => {
    const pool = new KeyPool(['a', 'b', 'c']);
    pool.penalise('a');

    // Demotion reorders the rotation; it never shortens it.
    expect([pool.next(), pool.next(), pool.next()]).toEqual(['b', 'c', 'a']);
  });

  it('comes back to its starting order once every key has been penalised in turn', () => {
    // This is what lets the gateway drop to the next model and start from the preferred
    // key, rather than from wherever the previous model's run of 429s left the cursor.
    const pool = new KeyPool(['a', 'b', 'c']);

    for (const key of ['a', 'b', 'c']) pool.penalise(key);

    expect(pool.snapshot()).toEqual(['a', 'b', 'c']);
    expect(pool.next()).toBe('a');
  });

  it('costs exactly one wasted attempt per cycle for a key that always fails', () => {
    const pool = new KeyPool(['revoked', 'good-1', 'good-2']);
    const served: string[] = [];

    for (let draw = 0; draw < 12; draw += 1) {
      const key = pool.next();
      served.push(key);
      if (key === 'revoked') pool.penalise(key);
    }

    // Four cycles, one wasted attempt each — the price of keeping a dead key in the pool
    // so that re-enabling it needs no restart. Every working key carries an equal share.
    expect(served.filter((key) => key === 'revoked')).toHaveLength(4);
    expect(served.filter((key) => key === 'good-1')).toHaveLength(4);
    expect(served.filter((key) => key === 'good-2')).toHaveLength(4);
  });

  it('leaves a repeatedly penalised key at the back instead of duplicating it', () => {
    const pool = new KeyPool(['a', 'b', 'c']);
    pool.penalise('a');
    pool.penalise('a');

    // The gateway's attempt budget is `size`, so a pool that grew on every 429 would
    // hand out the same dead key twice within one model's round.
    expect(pool.snapshot()).toEqual(['b', 'c', 'a']);
    expect(pool.size).toBe(3);
  });

  it('keeps handing out its only key however often that key is penalised', () => {
    // The single-key deployment is the realistic degraded case: a contributor running
    // locally with one key must still get an answer, not a pool that has emptied itself.
    const pool = new KeyPool(['only']);

    for (let round = 0; round < 3; round += 1) {
      expect(pool.next()).toBe('only');
      pool.penalise('only');
    }

    expect(pool.size).toBe(1);
    expect(pool.snapshot()).toEqual(['only']);
  });
});
