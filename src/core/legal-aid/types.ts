/**
 * Free legal aid under section 12 of the Legal Services Authorities Act, 1987.
 *
 * The statute lists categories of person entitled to free legal services. Most are
 * unconditional: they do not depend on income at all. That matters more than any
 * other fact in this module, because the categories in question — every woman, every
 * child's matter, every industrial workman — cover a very large share of the people
 * who will ever open this application, and almost none of them know it.
 *
 * The eligibility check is therefore not a formality bolted onto a document analyser.
 * It is the point at which "legal information" becomes "legal access", which is what
 * the problem this product addresses actually asks for.
 */

/**
 * The grounds in section 12, in the Act's own order. Every ground except
 * `income_below_ceiling` applies irrespective of means.
 */
export type LegalAidGround =
  /** s.12(a) — a member of a Scheduled Caste or Scheduled Tribe. */
  | 'scheduled_caste_or_tribe'
  /** s.12(b) — a victim of trafficking in human beings or of begar (Article 23). */
  | 'trafficking_or_begar_victim'
  /** s.12(c) — a woman or a child. */
  | 'woman_or_child'
  /** s.12(d) — a person with mental illness or another disability. */
  | 'mental_illness_or_disability'
  /**
   * s.12(e) — a person under circumstances of undeserved want: a victim of a mass
   * disaster, ethnic violence, caste atrocity, flood, drought, earthquake or
   * industrial disaster.
   */
  | 'undeserved_want'
  /** s.12(f) — an industrial workman. */
  | 'industrial_workman'
  /** s.12(g) — a person in custody, including in a protective or juvenile home. */
  | 'in_custody'
  /** s.12(h) — a person whose annual income is below the ceiling for the forum. */
  | 'income_below_ceiling';

/** The forum a matter would be heard in; it sets the income ceiling that applies. */
export type LegalAidForum = 'supreme_court' | 'other';

/**
 * Answers to the eligibility questionnaire.
 *
 * Every field is optional and `undefined` means "not answered", which is treated as
 * "not established" rather than "no". The result distinguishes the two.
 */
export interface LegalAidProfile {
  readonly state: string | null;
  readonly forum: LegalAidForum;
  /** Annual income in rupees, if the user chose to state it. */
  readonly annualIncomeInr?: number | null;
  readonly isWomanOrChild?: boolean;
  readonly isScheduledCasteOrTribe?: boolean;
  readonly isIndustrialWorkman?: boolean;
  readonly hasDisabilityOrMentalIllness?: boolean;
  readonly isTraffickingOrBegarVictim?: boolean;
  readonly isInCustody?: boolean;
  readonly isUnderUndeservedWant?: boolean;
}

/** Per-state annual income ceilings, in rupees. Data, not code: see `data/legal-aid/`. */
export interface LegalAidTable {
  /** Keyed by state name exactly as the UI offers it. */
  readonly stateCeilingsInr: Readonly<Record<string, number>>;
  /** Applies to Supreme Court matters regardless of state. */
  readonly supremeCourtCeilingInr: number;
  /** Used when the state is unknown or absent from the table. */
  readonly fallbackCeilingInr: number;
}

export interface LegalAidResult {
  readonly eligible: boolean;
  /** Every ground that applies. A person may qualify several times over. */
  readonly grounds: readonly LegalAidGround[];
  /**
   * True when at least one ground applies irrespective of income. Drives the
   * strongest sentence the product can say: you qualify regardless of what you earn.
   */
  readonly qualifiesRegardlessOfIncome: boolean;
  /** The ceiling that was applied, so the answer can be explained rather than asserted. */
  readonly appliedCeilingInr: number;
  /**
   * True when no ground was established but the questionnaire was left incomplete —
   * distinguishing "you do not qualify" from "we cannot tell yet".
   */
  readonly indeterminate: boolean;
}
