import { formatNumber } from '@/lib/format';
import type { Dictionary } from './types';

/**
 * English. The reference dictionary: every other language is checked against this
 * file's shape by the compiler, and against its *register* by a human — plain,
 * second person, no legal vocabulary the reader would have to look up.
 */
export const en: Dictionary = {
  languageName: 'English',

  meta: {
    appName: 'Baarik',
    tagline: 'Understand the fine print before you sign it.',
  },

  nav: {
    skipToContent: 'Skip to main content',
    home: 'Check a document',
    howItWorks: 'How this works',
    legalAid: 'Free legal aid',
  },

  footer: {
    notAdvice:
      'Baarik gives you legal information, not legal advice. It is not a substitute for an advocate enrolled under the Advocates Act, 1961.',
    notSaved: 'This report is not saved anywhere — download it before you close the tab.',
    languageLabel: 'Language',
  },

  landing: {
    heading: 'Read the fine print before you sign it',
    lede: 'Paste a rent agreement, offer letter, loan sanction, NDA, freelance contract or privacy policy. Baarik explains every clause in plain words, quotes the exact line it is talking about, and tells you which clauses Indian law commonly refuses to enforce.',
    pasteLabel: 'Paste the text of your document',
    pasteHint:
      'Long-press and paste from WhatsApp, Gmail or a PDF reader. Nothing is stored, on this device or on the server.',
    uploadLabel: 'Or choose a file',
    uploadHint: 'PDF, Word or plain text, up to 10 MB.',
    documentTypeLabel: 'What kind of document is this?',
    documentTypeAuto: 'Let Baarik work it out',
    submit: 'Explain this document',
    samplesHeading: 'No document to hand?',
    samplesHint:
      'These are synthetic documents written for demonstration. They are not real contracts.',
    promises: [
      'No sign-up, no account, no payment.',
      'Nothing is written to a database, a disk or a log.',
      'Every claim quotes the line of your document it came from.',
    ],
  },

  disclaimer: {
    onboardingHeading: 'Before you start — what this is, and what it is not',
    onboardingBody: [
      'Baarik explains what a document says and what Indian statutes provide. It does not tell you what to do about your situation, and it cannot take the place of an advocate who has read your papers.',
      'Nothing here is a prediction. You will not be told that you will win, that a clause is void in your case, or what a claim is worth.',
      'Your document is sent to Google’s Gemini API to be read. It is never stored by Baarik. Read how this works before you paste anything you would not email.',
    ],
    onboardingAccept: 'I understand — continue',
    onboardingRead: 'Read how this works first',
    perAnswer: 'Legal information, not legal advice.',
    interruptHeading: 'This looks time-sensitive',
    interruptBody:
      'A deadline in this document or in the law that applies to it appears to be close. Deadlines in Indian law are strict, and a free advocate is available to you today through your District Legal Services Authority.',
    interruptFindDlsa: 'Find my District Legal Services Authority',
    interruptContinue: 'Continue to the report',
    interruptHelpline: 'NALSA helpline: 15100 — free, and open to everyone.',
  },

  report: {
    analysisHeading: 'Analysis',
    stages: [
      'Reading the document',
      'Pulling out the clauses',
      'Checking every quote against your document',
      'Scoring against the rubric',
      'Finding where you can take this',
    ],
    complete: 'Analysis complete.',
    resultsHeading: 'What this document says',
    riskHeading: 'Overall',
    findingsHeading: 'Clause by clause',
    missingHeading: 'What this document does not say',
    questionsHeading: 'Questions to put to an advocate',
    nextStepsHeading: 'Where you can take this',
    unverifiedHeading: 'Discarded findings',
    unverifiedLede:
      'These were proposed but could not be matched to any text in your document, so they are shown here rather than in the report. Nothing below counted towards the score.',
    sourceHeading: 'Your document',
    sourceLede: 'Highlighted spans are the exact text each clause card quotes.',
    download: 'Download this report',
    sampleBanner: 'Sample — synthetic, written for demonstration. Not a real contract.',
    liveBanner:
      'Analysed from the document you supplied. Nothing was stored — download this report before you close the tab.',
    deadlineLabel: 'Deadline',
    feeLabel: 'What it costs',
    filingPlaceLabel: 'Where to file',
    prerequisitesLabel: 'Do this first',
    entitlementsLabel: 'What the statute provides',
    helplineLabel: 'Helpline',
    openPortal: 'Open the filing portal',
    scoreLabel: 'Risk score',
    outOf: 'out of 100',
    rubricLabel: 'Rubric',
    topDriversHeading: 'What weighs most',
    whyOffered: 'Why this route is offered',
    tiers: {
      asymmetry: 'Asymmetry',
      threshold: 'Thresholds',
      construct: 'Known-bad constructs',
      absence: 'Missing protections',
    },
  },

  card: {
    says: 'What it says',
    means: 'What it means',
    matters: 'Why it matters',
    enforceability: 'Enforceability',
    favours: 'Who it favours',
    actions: 'What you can do',
    confidence: 'Confidence',
    showInDocument: 'Show in document',
    why: 'why?',
    howComputed: 'how is this computed?',
    clauseLabel: 'Clause',
    pageLabel: 'Page',
    unnumbered: 'Unnumbered clause',
    statuteHeading: 'What the statute says',
    authoritiesHeading: 'What courts have held',
    caveatsHeading: 'What this does not decide',
    ruleIdLabel: 'Rule',
    readStatute: 'Read the section on India Code',
    noEnforceabilityRow:
      'No statute row applies to this clause. That means Baarik has nothing verified to say about it, not that the clause is sound.',
    copyWording: 'Suggested wording',
    askAdvocate: 'Ask an advocate:',
    matchMethod: {
      exact: 'Matched exactly',
      normalised: 'Matched after normalising spacing',
      fuzzy: 'Matched approximately',
    },
  },

  actionKinds: {
    ask: 'Ask',
    accept: 'Accept',
    walk_away: 'Walk away',
  },

  signals: {
    challenged: 'Commonly challenged',
    risky: 'Risky for you',
    standard: 'Standard',
    favourable: 'In your favour',
  },

  verdicts: {
    likely_void: 'Indian law generally does not enforce a clause like this',
    likely_unenforceable_as_written: 'Courts have refused to enforce this as written',
    capped_by_statute: 'A statute caps what can be recovered under this',
    cannot_oust_this_forum: 'This cannot shut you out of the forum the statute gives you',
    enforceable_but_negotiable: 'Binding, but commonly conceded in negotiation',
    context_dependent: 'This turns on facts the document does not settle',
  },

  confidence: {
    confident: 'Confident — the quote was found in your document and a statute row applies',
    depends_on_your_state: 'Depends on your state — the rule differs across India',
    not_found_in_document: 'Not found in your document',
  },

  parties: {
    you: 'you',
    counterparty: 'the other side',
    both: 'both sides',
    unclear: 'unclear',
  },

  documentTypes: {
    rent_agreement: 'Rent or leave-and-licence agreement',
    employment_offer: 'Employment offer letter',
    loan_agreement: 'Loan agreement or sanction letter',
    nda: 'Non-disclosure agreement',
    freelance_contract: 'Freelance or services contract',
    privacy_policy: 'Privacy policy or terms of use',
    other: 'Something else',
  },

  bands: {
    low: 'Ordinary for this kind of agreement',
    moderate: 'Some terms worth pushing back on',
    high: 'Several terms weigh heavily against you',
    severe: 'This agreement is one-sided throughout',
  },

  grounding: (stats) =>
    stats.rejected === 0
      ? `All ${formatNumber(stats.total)} findings matched to text in your document.`
      : `${formatNumber(stats.grounded)} of ${formatNumber(stats.total)} findings matched to text in your document; ${formatNumber(stats.rejected)} discarded because we could not find it.`,

  favoursSummary: (yourShare, pairedRights, side) => {
    if (side === 'both' || side === 'unclear') {
      return `Of ${formatNumber(pairedRights)} paired rights, ${formatNumber(yourShare)} favour you and ${formatNumber(pairedRights - yourShare)} favour the other side.`;
    }
    const favoured = side === 'you' ? yourShare : pairedRights - yourShare;
    const who = side === 'you' ? 'you' : 'the other side';
    return `${formatNumber(favoured)} of ${formatNumber(pairedRights)} paired rights favour ${who}.`;
  },
};
