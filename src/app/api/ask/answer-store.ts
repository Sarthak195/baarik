import 'server-only';

import type { AnswerView } from '@/components/qa/types';

/**
 * Where an answer waits between the POST that produced it and the GET that shows it.
 *
 * The alternative was to put the answer in the query string of the redirect, and it
 * was rejected on privacy grounds. An answer carries a verbatim passage of somebody's
 * contract and is preceded by their question; a URL carrying both is written to
 * browser history, sent onward in `Referer` headers, and recorded by every proxy and
 * access log in between. `src/server/observability/logger.ts` refuses to let a quote
 * reach a log line, and it would be a strange system that enforced that in one place
 * and posted the same text into a URL in another. What travels instead is an opaque
 * token, which says nothing about anything.
 *
 * The token also keeps answers apart. Keying by report id would be simpler and wrong:
 * the sample reports have stable, shared ids, so two people reading the same sample on
 * one instance would see each other's questions. A `randomUUID` is unguessable, and
 * the report id is checked on the way out, so a token is only redeemable on the report
 * it was created for.
 *
 * In memory, bounded, lost on restart — the same terms as `report-store.ts`, for the
 * same reason (ADR 0008). It is hung off `globalThis` for the same reason too: Next
 * bundles the route handler and the page into separate server chunks, and a module
 * constant would be instantiated twice, so the page would never find what the route
 * had just written.
 *
 * Kept beside the route that fills it rather than under `src/server/store`, because it
 * has exactly one writer and one reader and nothing else in the system has any
 * business holding an answer.
 */
interface StoredAnswer {
  readonly reportId: string;
  readonly view: AnswerView;
  readonly createdAt: number;
}

/** One answer per question asked, and nobody is reading a hundred at once. */
const MAX_ANSWERS = 100;

/**
 * Short, because an answer quotes the document and a document is the thing this
 * product promises not to keep. Long enough that reloading the page, printing it, or
 * following the link back from the source section still shows what was asked.
 */
const MAX_AGE_MS = 15 * 60 * 1000;

const STORE_KEY = Symbol.for('baarik.answerStore');

type GlobalWithAnswers = typeof globalThis & {
  [STORE_KEY]?: Map<string, StoredAnswer>;
};

function store(): Map<string, StoredAnswer> {
  const container = globalThis as GlobalWithAnswers;
  const existing = container[STORE_KEY];
  if (existing !== undefined) return existing;

  const created = new Map<string, StoredAnswer>();
  container[STORE_KEY] = created;
  return created;
}

export function putAnswer(token: string, reportId: string, view: AnswerView, now: number): void {
  const answers = store();
  answers.set(token, { reportId, view, createdAt: now });
  evict(answers, now);
}

/**
 * Redeem a token against the report it was issued for.
 *
 * A mismatch is treated as a miss rather than as an error: the only way to produce one
 * is to move a token to another report's URL by hand, and the honest answer to that is
 * a page with no answer on it.
 */
export function getAnswer(token: string, reportId: string, now: number): AnswerView | null {
  const answers = store();
  const stored = answers.get(token);
  if (stored === undefined) return null;

  if (now - stored.createdAt > MAX_AGE_MS) {
    answers.delete(token);
    return null;
  }
  return stored.reportId === reportId ? stored.view : null;
}

/** Discard everything. Used by tests; never called in production. */
export function clearAnswers(): void {
  store().clear();
}

function evict(answers: Map<string, StoredAnswer>, now: number): void {
  for (const [token, stored] of answers) {
    if (now - stored.createdAt > MAX_AGE_MS) answers.delete(token);
  }

  // Map preserves insertion order, so the oldest surviving entry is the first one.
  while (answers.size > MAX_ANSWERS) {
    const oldest = answers.keys().next();
    if (oldest.done) break;
    answers.delete(oldest.value);
  }
}
