import type { OutputLanguage } from '@/schemas/document-type';
import type { AskError } from './types';

/**
 * Three sentences the shared dictionary does not carry.
 *
 * `src/i18n` is the vocabulary of the product — what a clause is, what a report says,
 * what the law provides. These describe the behaviour of one form: they are read only
 * by someone who has just pressed Ask and had the request refused, and they say
 * nothing about the reader's document. Keeping them beside the only component that
 * renders them means the dictionary every page loads does not grow a section that
 * exists to explain a query string.
 *
 * Both languages are here rather than English alone, because a reader who chose Hindi
 * and then hit an error is precisely the reader least well served by falling back.
 */
const MESSAGES: Readonly<Record<OutputLanguage, Readonly<Record<AskError, string>>>> = {
  en: {
    empty: 'Type a question first.',
    too_long:
      'That is longer than a question about this document needs to be. Shorten it and ask again.',
    unavailable:
      'The answering service could not be reached just now. Your document was not changed, and nothing was stored. Try again in a minute.',
  },
  hi: {
    empty: 'पहले कोई प्रश्न लिखिए।',
    too_long:
      'इस दस्तावेज़ के बारे में प्रश्न इतना लंबा होने की ज़रूरत नहीं। इसे छोटा करके फिर पूछिए।',
    unavailable:
      'उत्तर देने वाली सेवा अभी उपलब्ध नहीं है। आपका दस्तावेज़ बदला नहीं गया और कुछ भी संग्रहीत नहीं हुआ। एक मिनट बाद फिर कोशिश कीजिए।',
  },
};

export function askErrorMessage(error: AskError, language: OutputLanguage): string {
  return MESSAGES[language][error];
}
