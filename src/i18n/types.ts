import type { Verdict } from '@/core/enforceability/types';
import type { GroundingStats } from '@/core/grounding/verify';
import type { Tier } from '@/core/risk/types';
import type { ClauseAction, ClauseConfidence } from '@/lib/clause-view';
import type { RiskSignal } from '@/lib/severity';
import type { DocumentType } from '@/schemas/document-type';
import type { Party } from '@/schemas/finding';

/**
 * The shape of every dictionary.
 *
 * This interface exists so that adding a language cannot silently drop a label: a
 * dictionary that is missing `card.enforceability` does not compile, and a clause card
 * with six rows instead of seven is precisely the drift the fixed-card rule forbids.
 *
 * Two things are deliberately absent. Verbatim clause text is never translated — it is
 * evidence, and a translated quote is not a quote. Statute names and citations are
 * never translated either: "Section 27, Indian Contract Act, 1872" is how the reader
 * will find it, how a court will refer to it, and how an advocate will recognise it.
 */
export interface Dictionary {
  readonly languageName: string;
  readonly meta: {
    readonly appName: string;
    readonly tagline: string;
  };
  readonly nav: {
    readonly skipToContent: string;
    readonly home: string;
    readonly howItWorks: string;
    readonly legalAid: string;
  };
  readonly footer: {
    /** Fixed wording. ADR 0005 — the Advocates Act line is not a style choice. */
    readonly notAdvice: string;
    /** Fixed wording. ADR 0008 — nothing is stored, so say so where it is felt. */
    readonly notSaved: string;
    readonly languageLabel: string;
  };
  readonly landing: {
    readonly heading: string;
    readonly lede: string;
    readonly pasteLabel: string;
    readonly pasteHint: string;
    readonly uploadLabel: string;
    readonly uploadHint: string;
    readonly documentTypeLabel: string;
    readonly documentTypeAuto: string;
    readonly submit: string;
    readonly samplesHeading: string;
    readonly samplesHint: string;
    readonly promises: readonly string[];
  };
  readonly disclaimer: {
    readonly onboardingHeading: string;
    readonly onboardingBody: readonly string[];
    readonly onboardingAccept: string;
    readonly onboardingRead: string;
    readonly perAnswer: string;
    readonly interruptHeading: string;
    readonly interruptBody: string;
    readonly interruptFindDlsa: string;
    readonly interruptContinue: string;
    readonly interruptHelpline: string;
  };
  readonly report: {
    readonly analysisHeading: string;
    readonly stages: readonly string[];
    readonly complete: string;
    readonly resultsHeading: string;
    readonly riskHeading: string;
    readonly findingsHeading: string;
    readonly missingHeading: string;
    readonly questionsHeading: string;
    readonly nextStepsHeading: string;
    readonly unverifiedHeading: string;
    readonly unverifiedLede: string;
    readonly sourceHeading: string;
    readonly sourceLede: string;
    readonly download: string;
    readonly sampleBanner: string;
    /** Shown over a live analysis, where the sample banner would be a lie. */
    readonly liveBanner: string;
    readonly deadlineLabel: string;
    readonly feeLabel: string;
    readonly filingPlaceLabel: string;
    readonly prerequisitesLabel: string;
    readonly entitlementsLabel: string;
    readonly helplineLabel: string;
    readonly openPortal: string;
    readonly scoreLabel: string;
    readonly outOf: string;
    readonly rubricLabel: string;
    readonly topDriversHeading: string;
    readonly whyOffered: string;
    readonly tiers: Readonly<Record<Tier, string>>;
  };
  readonly card: {
    readonly says: string;
    readonly means: string;
    readonly matters: string;
    readonly enforceability: string;
    readonly favours: string;
    readonly actions: string;
    readonly confidence: string;
    readonly showInDocument: string;
    readonly why: string;
    readonly howComputed: string;
    readonly clauseLabel: string;
    readonly pageLabel: string;
    readonly unnumbered: string;
    readonly statuteHeading: string;
    readonly authoritiesHeading: string;
    readonly caveatsHeading: string;
    readonly ruleIdLabel: string;
    readonly readStatute: string;
    readonly noEnforceabilityRow: string;
    readonly copyWording: string;
    readonly askAdvocate: string;
    readonly matchMethod: Readonly<Record<'exact' | 'normalised' | 'fuzzy', string>>;
  };
  /** The three things a reader can do with a clause, named once. */
  readonly actionKinds: Readonly<Record<ClauseAction['kind'], string>>;
  readonly signals: Readonly<Record<RiskSignal, string>>;
  readonly verdicts: Readonly<Record<Verdict, string>>;
  readonly confidence: Readonly<Record<ClauseConfidence, string>>;
  readonly parties: Readonly<Record<Party, string>>;
  readonly documentTypes: Readonly<Record<DocumentType, string>>;
  readonly bands: Readonly<Record<'low' | 'moderate' | 'high' | 'severe', string>>;
  /**
   * The grounding badge sentence.
   *
   * A function rather than a template string because the clause order differs between
   * English and Hindi, and interpolating into a fixed English skeleton would produce
   * Hindi words in English syntax.
   */
  readonly grounding: (stats: GroundingStats) => string;
  /** The Taraazu meter's text equivalent, for greyscale, print and screen readers. */
  readonly favoursSummary: (yourShare: number, pairedRights: number, side: Party) => string;
}
