import type { DocumentType } from '../../schemas/document-type';
import type { ConstructId } from '../../schemas/extracted-facts';
import type { Verdict } from '../enforceability/types';
import type { Severity } from '../risk/types';
import type { LimitationClock } from './limitation';

/**
 * Where a reader can actually take this, what it costs, and how long they have.
 *
 * A risk score that ends in "consider seeking legal advice" is decoration. India has a
 * dense, cheap and largely unknown set of statutory forums — a consumer complaint costs
 * nothing up to Rs 5,00,000 and may be filed where the complainant lives, an unpaid
 * freelancer with a free Udyam registration is owed three times the RBI bank rate
 * compounded — and almost nobody reading a one-sided contract knows any of it.
 *
 * Two rules hold this inside the law, the same two that govern enforceability triage:
 *
 *   1. **The model never routes.** Every row lives in `data/remedies/forums.yaml`, is
 *      parsed and Zod-validated in the server layer, and arrives here as data. The
 *      matcher below is arithmetic over that table.
 *   2. **Nothing is a conclusion about the reader's case.** A row says what a forum
 *      does, what the statute provides and what the filing costs. It never says the
 *      reader will win, or that they have a claim. Advocates Act 1961 ss.29 and 33 with
 *      *BCI v A.K. Balaji* (2018) reserve legal advice to enrolled advocates, so every
 *      row carries caveats and a citation the reader can check.
 */

export type ForumId =
  /** District/State/National Consumer Disputes Redressal Commission, CPA 2019. */
  | 'consumer_commission'
  /** State Real Estate Regulatory Authority, RERA 2016 s.31. */
  | 'rera_authority'
  /** Conciliation Officer / Labour Commissioner, then the Labour Court. */
  | 'labour_conciliation'
  /** Micro and Small Enterprise Facilitation Council, MSMED 2006 s.18. */
  | 'msefc'
  /** RBI Ombudsman under the Integrated Ombudsman Scheme, 2021. */
  | 'rbi_ombudsman'
  /** Insurance Ombudsman under the Insurance Ombudsman Rules, 2017. */
  | 'insurance_ombudsman'
  /** Grievance Appellate Committee, IT Rules 2021 rule 3A. */
  | 'grievance_appellate_committee'
  /** DLSA/SLSA/NALSA free legal services, LSA Act 1987. */
  | 'legal_services_authority'
  /** Lok Adalat, LSA Act 1987 ss.19-21. */
  | 'lok_adalat';

/**
 * What the reader says went wrong, in their words rather than the document's.
 *
 * Routing is far more accurate when someone can say "the builder has not handed over
 * possession" than when it must be inferred from a PDF, so a stated problem outranks
 * every document-derived signal in the matcher.
 */
export type RemedyProblem =
  | 'goods_or_services_defect'
  | 'builder_delay_or_refund'
  | 'unpaid_salary_or_termination'
  | 'unpaid_invoice'
  | 'bank_or_loan_conduct'
  | 'insurance_claim'
  | 'platform_action_or_privacy';

/** Circumstances that open a route of their own, independent of the dispute. */
export type SituationFlag = 'cannot_afford_lawyer' | 'prefers_settlement';

export interface RemedySituation {
  readonly problem: RemedyProblem | null;
  /**
   * When the problem happened. Null when the reader has not said, in which case no
   * deadline is computed at all — an invented start date would produce a date someone
   * might rely on.
   */
  readonly causeOfActionDate: Date | null;
  readonly cannotAffordLawyer: boolean;
  readonly prefersSettlement: boolean;
}

export interface Portal {
  readonly name: string;
  /** Asserted https by a test: a filing portal read off a legal product must be real. */
  readonly url: string;
}

export interface ForumFee {
  /** Quoted from the fee rules, including the slabs, because "free" is rarely flat. */
  readonly summary: string;
  /** A flat fee where one exists, so a UI can sort by cost. Null where it is slabbed. */
  readonly amountInr: number | null;
  /** The claim value up to which nothing is payable. */
  readonly freeForClaimsUpToInr: number | null;
}

/**
 * A step the statute or scheme requires before the forum will hear the matter.
 *
 * These are where most self-filed complaints die: the RBI Ombudsman will not look at a
 * complaint until the bank has had thirty days, and MSME Samadhaan needs a Udyam number.
 */
export interface Prerequisite {
  readonly step: string;
  /** Days to wait after the step before the forum takes over. Null when there is none. */
  readonly waitDays: number | null;
  readonly url: string | null;
}

/**
 * When a row is offered. Every field is data; nothing here is inferred by a model.
 *
 * `documentTypes` filters the document-derived signals only. A stated problem bypasses
 * it, because someone whose salary is unpaid needs the labour route whether or not they
 * happen to have uploaded their offer letter.
 */
export interface ForumTrigger {
  /** Empty means the document-derived signals apply to every document type. */
  readonly documentTypes: readonly DocumentType[];
  readonly problems: readonly RemedyProblem[];
  readonly constructs: readonly ConstructId[];
  readonly verdicts: readonly Verdict[];
  /** Matches when a risk driver of one of these severities fired. */
  readonly driverSeverities: readonly Severity[];
  readonly situations: readonly SituationFlag[];
  /**
   * Open to everyone irrespective of the dispute — free legal aid and Lok Adalat. Such
   * a row is always offered but never outranks a forum that matched on the facts.
   */
  readonly universal: boolean;
}

/** A row of `data/remedies/forums.yaml`. Data, never code. */
export interface ForumRoute {
  readonly id: ForumId;
  readonly name: string;
  /** One sentence on what the forum does. Not what the reader should expect from it. */
  readonly handles: string;
  readonly statute: string;
  readonly statuteUrl: string;
  readonly portal: Portal;
  /** A toll-free number where one exists: 1915 consumer, 15100 legal aid. */
  readonly helpline: string | null;
  readonly fee: ForumFee;
  /**
   * Where the complaint may be filed. CPA 2019 s.34(2)(d) is the least known and most
   * useful right in this table: a consumer files where they live, not where the seller
   * chose in the contract.
   */
  readonly filingPlace: string | null;
  readonly lawyerRequired: boolean;
  readonly prerequisites: readonly Prerequisite[];
  /** What the statute provides if the forum agrees — the section, not a prediction. */
  readonly entitlements: readonly string[];
  /** Into `data/remedies/limitation.yaml`. Null where the route has no filing window. */
  readonly limitationRuleId: string | null;
  readonly triggers: ForumTrigger;
  /** Required and asserted non-empty by a test: the advice boundary, in the types. */
  readonly caveats: readonly string[];
}

export type ForumTable = readonly ForumRoute[];

/**
 * A window that runs from a different event than the rule's own cause of action, and so
 * cannot be part of the same countdown: the thirty days to send a cheque-dishonour
 * notice run from the bank's memo, the forty-five days to appeal from the order.
 */
export interface LimitationStage {
  readonly label: string;
  readonly days: number;
  /** The event the days run from, in the statute's own terms. */
  readonly from: string;
  readonly statute: string;
}

/**
 * Statutes count some periods in whole months and others in days, and the two are not
 * interchangeable — thirty days is not a month in February, and a deadline that is a day
 * out is worthless.
 */
export interface LimitationPeriod {
  readonly unit: 'months' | 'days';
  readonly count: number;
}

/** A row of `data/remedies/limitation.yaml`. */
export interface RemedyLimitationRule {
  readonly id: string;
  /** What starts the clock, in the statute's terms. */
  readonly causeOfAction: string;
  readonly period: LimitationPeriod;
  readonly statute: string;
  readonly statuteUrl: string;
  readonly condonationPossible: boolean;
  readonly stages: readonly LimitationStage[];
}

export type LimitationTable = readonly RemedyLimitationRule[];

/**
 * Why a route was offered. The identifier that matched, not a sentence: phrasing is the
 * interface layer's job, and this way a route is explainable in either language.
 */
export interface RouteSignal {
  readonly kind: 'problem' | 'construct' | 'verdict' | 'risk_driver' | 'situation' | 'universal';
  readonly detail: string;
}

export interface NextStep {
  readonly forum: ForumRoute;
  /** Null when the row names no window, or names one absent from the table. */
  readonly limitationRule: RemedyLimitationRule | null;
  /** Null until the reader says when the problem happened. */
  readonly clock: LimitationClock | null;
  readonly signals: readonly RouteSignal[];
  /** Ordering weight only. Not a claim that one forum is better than another. */
  readonly priority: number;
}
