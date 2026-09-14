import { OutputLanguage } from '@/schemas/document-type';
import { en } from './en';
import { hi } from './hi';
import type { Dictionary } from './types';

export type { Dictionary } from './types';

/**
 * Language selection.
 *
 * It reads from the URL rather than from a cookie or from client state, for the same
 * reason the whole flow is built on plain links and plain forms: a query parameter
 * survives JavaScript being unavailable, survives being shared over WhatsApp, and
 * needs no storage — which matters when the product's first claim is that it stores
 * nothing (ADR 0008).
 */
const DICTIONARIES: Readonly<Record<OutputLanguage, Dictionary>> = { en, hi };

export const LANGUAGES: readonly OutputLanguage[] = OutputLanguage.options;

/** Unrecognised input falls back to English rather than throwing. A mistyped query
 *  parameter must not be able to turn a legal document into an error page. */
export function dictionaryFor(language: OutputLanguage): Dictionary {
  return DICTIONARIES[language];
}

export function parseLanguage(value: string | string[] | undefined): OutputLanguage {
  const candidate = typeof value === 'string' ? value : value?.[0];
  const parsed = OutputLanguage.safeParse(candidate);
  return parsed.success ? parsed.data : 'en';
}

/**
 * How the requested language reaches the one place that cannot read the URL.
 *
 * `src/app/layout.tsx` renders `<html>`, and a root layout is handed neither params
 * nor a query string, so the document language was hardcoded `en` — which meant a
 * screen reader consulting only the document element read a fully translated Hindi
 * page in an English voice. `src/proxy.ts` sits in front of every request and already
 * carries the CSP nonce into the render by setting a header on the *request*; this is
 * the same mechanism with a second value on it, and it adds no state the product did
 * not already have, because the answer is still computed from `?lang=` alone.
 *
 * The proxy sets this header rather than appending to it, and that is the part worth
 * being deliberate about: it is an ordinary request header, so a client can send one,
 * and a page must never announce a language the URL did not ask for.
 */
export const LANGUAGE_HEADER = 'x-baarik-language';

/** Appends `?lang=` only when it is not the default, keeping shared links tidy. */
export function withLanguage(path: string, language: OutputLanguage): string {
  return language === 'en' ? path : `${path}${path.includes('?') ? '&' : '?'}lang=${language}`;
}
