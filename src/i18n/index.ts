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

/** Appends `?lang=` only when it is not the default, keeping shared links tidy. */
export function withLanguage(path: string, language: OutputLanguage): string {
  return language === 'en' ? path : `${path}${path.includes('?') ? '&' : '?'}lang=${language}`;
}
