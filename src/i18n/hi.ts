import { formatNumber } from '@/lib/format';
import type { Dictionary } from './types';

/**
 * हिन्दी.
 *
 * Two rules hold across this file and are the reason it is a translation rather than a
 * transliteration. Statute names, section numbers and case citations stay in English,
 * because that is how the reader will find the section and how an advocate will
 * recognise it. Verbatim clause text is never routed through here at all — a quote in
 * translation has stopped being evidence.
 *
 * A legal-access tool for India that speaks only English does not provide access, so
 * this is a product requirement rather than a nicety.
 */
export const hi: Dictionary = {
  languageName: 'हिन्दी',

  meta: {
    appName: 'बारीक',
    tagline: 'हस्ताक्षर करने से पहले बारीक अक्षर पढ़ लीजिए।',
  },

  nav: {
    skipToContent: 'मुख्य सामग्री पर जाएँ',
    home: 'दस्तावेज़ जाँचें',
    howItWorks: 'यह कैसे काम करता है',
    legalAid: 'निःशुल्क विधिक सहायता',
  },

  footer: {
    notAdvice:
      'बारीक आपको विधिक जानकारी देता है, विधिक सलाह नहीं। यह अधिवक्ता अधिनियम, 1961 के अंतर्गत नामांकित अधिवक्ता का विकल्प नहीं है।',
    notSaved: 'यह रिपोर्ट कहीं सहेजी नहीं जाती — टैब बंद करने से पहले इसे डाउनलोड कर लीजिए।',
    languageLabel: 'भाषा',
  },

  landing: {
    heading: 'हस्ताक्षर से पहले बारीक अक्षर पढ़िए',
    lede: 'किराया अनुबंध, नियुक्ति पत्र, ऋण स्वीकृति, गोपनीयता अनुबंध, फ्रीलांस अनुबंध या प्राइवेसी पॉलिसी यहाँ चिपकाइए। बारीक हर उपबंध को सरल शब्दों में समझाता है, दस्तावेज़ की वही पंक्ति उद्धृत करता है, और बताता है कि भारतीय विधि किन उपबंधों को सामान्यतः लागू नहीं करती।',
    pasteLabel: 'अपने दस्तावेज़ का पाठ यहाँ चिपकाइए',
    pasteHint:
      'WhatsApp, Gmail या PDF रीडर से कॉपी करके चिपकाइए। कुछ भी संग्रहित नहीं किया जाता — न इस उपकरण पर, न सर्वर पर।',
    uploadLabel: 'या फ़ाइल चुनिए',
    uploadHint: 'PDF, Word या सादा पाठ, अधिकतम 10 MB।',
    documentTypeLabel: 'यह किस प्रकार का दस्तावेज़ है?',
    documentTypeAuto: 'बारीक स्वयं पहचान ले',
    submit: 'यह दस्तावेज़ समझाइए',
    samplesHeading: 'अभी कोई दस्तावेज़ नहीं है?',
    samplesHint: 'ये प्रदर्शन के लिए लिखे गए काल्पनिक दस्तावेज़ हैं। ये वास्तविक अनुबंध नहीं हैं।',
    promises: [
      'न पंजीकरण, न खाता, न कोई शुल्क।',
      'कुछ भी डेटाबेस, डिस्क या लॉग में नहीं लिखा जाता।',
      'हर कथन आपके दस्तावेज़ की उसी पंक्ति को उद्धृत करता है जिससे वह निकला है।',
    ],
  },

  disclaimer: {
    onboardingHeading: 'शुरू करने से पहले — यह क्या है, और क्या नहीं',
    onboardingBody: [
      'बारीक बताता है कि दस्तावेज़ में क्या लिखा है और भारतीय कानून क्या उपबंधित करता है। यह आपकी स्थिति में क्या करना चाहिए, यह नहीं बताता, और आपके कागज़ात पढ़ चुके अधिवक्ता का स्थान नहीं ले सकता।',
      'यहाँ कोई भविष्यवाणी नहीं है। आपको यह नहीं बताया जाएगा कि आप जीतेंगे, कि आपके मामले में कोई उपबंध शून्य है, या किसी दावे का मूल्य कितना है।',
      'आपका दस्तावेज़ पढ़े जाने के लिए Google की Gemini API को भेजा जाता है। बारीक इसे कभी संग्रहित नहीं करता। कुछ भी चिपकाने से पहले पढ़िए कि यह कैसे काम करता है।',
    ],
    onboardingAccept: 'समझ गया — आगे बढ़िए',
    onboardingRead: 'पहले पढ़िए कि यह कैसे काम करता है',
    perAnswer: 'विधिक जानकारी, विधिक सलाह नहीं।',
    interruptHeading: 'यह समय-संवेदनशील प्रतीत होता है',
    interruptBody:
      'इस दस्तावेज़ में या उस पर लागू विधि में कोई समय-सीमा निकट प्रतीत होती है। भारतीय विधि में समय-सीमाएँ कठोर हैं, और आपके ज़िला विधिक सेवा प्राधिकरण के माध्यम से निःशुल्क अधिवक्ता आज ही उपलब्ध है।',
    interruptFindDlsa: 'मेरा ज़िला विधिक सेवा प्राधिकरण खोजिए',
    interruptContinue: 'रिपोर्ट पर आगे बढ़िए',
    interruptHelpline: 'NALSA हेल्पलाइन: 15100 — निःशुल्क, सबके लिए।',
  },

  report: {
    analysisHeading: 'विश्लेषण',
    stages: [
      'दस्तावेज़ पढ़ा जा रहा है',
      'उपबंध निकाले जा रहे हैं',
      'हर उद्धरण आपके दस्तावेज़ से मिलाया जा रहा है',
      'रूब्रिक के अनुसार अंक दिए जा रहे हैं',
      'उपाय के मंच खोजे जा रहे हैं',
    ],
    complete: 'विश्लेषण पूर्ण।',
    resultsHeading: 'यह दस्तावेज़ क्या कहता है',
    riskHeading: 'कुल मिलाकर',
    findingsHeading: 'उपबंध दर उपबंध',
    missingHeading: 'यह दस्तावेज़ क्या नहीं कहता',
    questionsHeading: 'अधिवक्ता से पूछने योग्य प्रश्न',
    nextStepsHeading: 'आप यह कहाँ ले जा सकते हैं',
    unverifiedHeading: 'निरस्त निष्कर्ष',
    unverifiedLede:
      'ये प्रस्तावित तो हुए, पर आपके दस्तावेज़ के किसी पाठ से मेल नहीं खाए, इसलिए रिपोर्ट के बजाय यहाँ दिखाए गए हैं। नीचे की किसी बात को अंक नहीं दिए गए।',
    sourceHeading: 'आपका दस्तावेज़',
    sourceLede: 'रेखांकित अंश वही पाठ हैं जिन्हें उपबंध-कार्ड उद्धृत करते हैं।',
    download: 'यह रिपोर्ट डाउनलोड कीजिए',
    sampleBanner: 'नमूना — प्रदर्शन के लिए लिखा गया काल्पनिक दस्तावेज़। वास्तविक अनुबंध नहीं।',
    liveBanner:
      'आपके द्वारा दिए गए दस्तावेज़ से विश्लेषण किया गया। कुछ भी संग्रहीत नहीं किया गया — टैब बंद करने से पहले यह रिपोर्ट डाउनलोड कर लें।',
    expiredHeading: 'वह रिपोर्ट अब उपलब्ध नहीं है',
    expiredExplanation:
      'रिपोर्ट केवल मेमोरी में रखी जाती हैं और कहीं लिखी नहीं जातीं, इसलिए वे पुनः आरंभ होने पर नहीं बचतीं और तीस मिनट बाद हटा दी जाती हैं। यह रिपोर्ट जा चुकी है।',
    expiredNotAnError:
      'यह कोई खराबी नहीं है। "कोई दस्तावेज़ संग्रहीत नहीं किया जाता" का व्यवहार में यही अर्थ है — उसे रखने की कोई जगह ही नहीं थी।',
    expiredAction: 'दोबारा कोई दस्तावेज़ जाँचें, या तैयार नमूनों में से कोई खोलें',
    deadlineLabel: 'समय-सीमा',
    feeLabel: 'कितना खर्च',
    filingPlaceLabel: 'कहाँ दाखिल करें',
    prerequisitesLabel: 'पहले यह कीजिए',
    entitlementsLabel: 'विधि क्या उपबंधित करती है',
    helplineLabel: 'हेल्पलाइन',
    openPortal: 'दाखिल करने का पोर्टल खोलिए',
    scoreLabel: 'जोखिम अंक',
    outOf: '100 में से',
    rubricLabel: 'रूब्रिक',
    topDriversHeading: 'सबसे भारी क्या पड़ता है',
    whyOffered: 'यह रास्ता क्यों सुझाया गया',
    tiers: {
      asymmetry: 'असंतुलन',
      threshold: 'सीमाएँ',
      construct: 'ज्ञात हानिकारक उपबंध',
      absence: 'अनुपस्थित सुरक्षाएँ',
    },
  },

  card: {
    says: 'इसमें क्या लिखा है',
    means: 'इसका अर्थ',
    matters: 'यह क्यों मायने रखता है',
    enforceability: 'प्रवर्तनीयता',
    favours: 'किसके पक्ष में',
    actions: 'आप क्या कर सकते हैं',
    confidence: 'विश्वास',
    showInDocument: 'दस्तावेज़ में दिखाइए',
    why: 'क्यों?',
    howComputed: 'यह कैसे गिना गया?',
    clauseLabel: 'उपबंध',
    pageLabel: 'पृष्ठ',
    unnumbered: 'बिना संख्या का उपबंध',
    statuteHeading: 'विधि क्या कहती है',
    authoritiesHeading: 'न्यायालयों ने क्या माना है',
    caveatsHeading: 'यह क्या तय नहीं करता',
    ruleIdLabel: 'नियम',
    readStatute: 'India Code पर यह धारा पढ़िए',
    noEnforceabilityRow:
      'इस उपबंध पर कोई सत्यापित विधि-पंक्ति लागू नहीं होती। इसका अर्थ यह है कि बारीक के पास कहने को कुछ सत्यापित नहीं है, यह नहीं कि उपबंध ठीक है।',
    copyWording: 'सुझाई गई शब्दावली',
    askAdvocate: 'अधिवक्ता से पूछिए:',
    matchMethod: {
      exact: 'हूबहू मिला',
      normalised: 'रिक्त स्थान सुधारने पर मिला',
      fuzzy: 'लगभग मिला',
    },
  },

  actionKinds: {
    ask: 'माँगिए',
    accept: 'स्वीकार कीजिए',
    walk_away: 'पीछे हट जाइए',
  },

  signals: {
    challenged: 'प्रायः चुनौती दिया जाने वाला',
    risky: 'आपके लिए जोखिम',
    standard: 'सामान्य',
    favourable: 'आपके पक्ष में',
  },

  verdicts: {
    likely_void: 'भारतीय विधि ऐसे उपबंध को सामान्यतः लागू नहीं करती',
    likely_unenforceable_as_written: 'जैसा लिखा है, न्यायालयों ने उसे लागू करने से इनकार किया है',
    capped_by_statute: 'विधि इस पर वसूली की अधिकतम सीमा तय करती है',
    cannot_oust_this_forum: 'यह आपको विधि द्वारा दिए गए मंच से वंचित नहीं कर सकता',
    enforceable_but_negotiable: 'बाध्यकारी, पर बातचीत में प्रायः छोड़ दिया जाता है',
    context_dependent: 'यह उन तथ्यों पर निर्भर है जो दस्तावेज़ तय नहीं करता',
  },

  confidence: {
    confident: 'विश्वसनीय — उद्धरण आपके दस्तावेज़ में मिला और एक विधि-पंक्ति लागू होती है',
    depends_on_your_state: 'आपके राज्य पर निर्भर — यह नियम भारत भर में भिन्न है',
    not_found_in_document: 'आपके दस्तावेज़ में नहीं मिला',
  },

  parties: {
    you: 'आप',
    counterparty: 'दूसरा पक्ष',
    both: 'दोनों पक्ष',
    unclear: 'स्पष्ट नहीं',
  },

  documentTypes: {
    rent_agreement: 'किराया या लीव-एंड-लाइसेंस अनुबंध',
    employment_offer: 'नियुक्ति प्रस्ताव पत्र',
    loan_agreement: 'ऋण अनुबंध या स्वीकृति पत्र',
    nda: 'गोपनीयता अनुबंध',
    freelance_contract: 'फ्रीलांस या सेवा अनुबंध',
    privacy_policy: 'प्राइवेसी पॉलिसी या उपयोग की शर्तें',
    other: 'कुछ और',
  },

  bands: {
    low: 'इस प्रकार के अनुबंध के लिए सामान्य',
    moderate: 'कुछ शर्तों पर बात करना उचित होगा',
    high: 'कई शर्तें आपके विरुद्ध भारी पड़ती हैं',
    severe: 'यह अनुबंध आरंभ से अंत तक एकतरफ़ा है',
  },

  grounding: (stats) =>
    stats.rejected === 0
      ? `सभी ${formatNumber(stats.total)} निष्कर्ष आपके दस्तावेज़ के पाठ से मिलाए गए।`
      : `${formatNumber(stats.total)} में से ${formatNumber(stats.grounded)} निष्कर्ष आपके दस्तावेज़ के पाठ से मिलाए गए; ${formatNumber(stats.rejected)} इसलिए हटा दिए गए क्योंकि वे दस्तावेज़ में नहीं मिले।`,

  favoursSummary: (yourShare, pairedRights, side) => {
    if (side === 'both' || side === 'unclear') {
      return `${formatNumber(pairedRights)} युग्मित अधिकारों में से ${formatNumber(yourShare)} आपके पक्ष में और ${formatNumber(pairedRights - yourShare)} दूसरे पक्ष में हैं।`;
    }
    const favoured = side === 'you' ? yourShare : pairedRights - yourShare;
    const who = side === 'you' ? 'आपके' : 'दूसरे पक्ष के';
    return `${formatNumber(pairedRights)} युग्मित अधिकारों में से ${formatNumber(favoured)} ${who} पक्ष में हैं।`;
  },
};
