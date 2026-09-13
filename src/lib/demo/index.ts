import { OFFER_LETTER_REPORT } from './offer-letter';
import { RENT_AGREEMENT_REPORT } from './rent-agreement';
import type { DemoReport, SampleSummary } from './types';

/**
 * The demonstration registry.
 *
 * The analysis pipeline lands in a separate commit. Until it does, the report route
 * resolves an id against this map — which is exactly what it will do afterwards, with
 * an `AnalysisCache` lookup in place of the map and nothing else changed. No component
 * below the page knows the difference, because none of them fetches anything.
 */
const REPORTS: readonly DemoReport[] = [OFFER_LETTER_REPORT, RENT_AGREEMENT_REPORT];

export const DEFAULT_REPORT_ID = OFFER_LETTER_REPORT.id;

export function reportById(id: string): DemoReport | null {
  return REPORTS.find((report) => report.id === id) ?? null;
}

export const SAMPLES: readonly SampleSummary[] = REPORTS.map((report) => ({
  id: report.id,
  title: report.title,
  documentType: report.documentType,
  blurb: report.blurb,
}));
