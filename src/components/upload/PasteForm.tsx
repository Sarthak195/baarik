import type { JSX } from 'react';

import type { Dictionary } from '@/i18n';
import { DocumentType, type OutputLanguage } from '@/schemas/document-type';

export interface PasteFormProps {
  readonly dictionary: Dictionary;
  readonly language: OutputLanguage;
}

/**
 * The form, and the reason this page works with JavaScript switched off.
 *
 * There is no `onSubmit`, no fetch, no client state and no hydration on this path. It
 * is a plain `<form method="post">` pointed at a route handler that answers with a
 * redirect, which is the same mechanism the web had in 1995 and the same mechanism
 * that still works on a five-year-old Android browser, through a corporate proxy that
 * strips scripts, on a 2G connection where the JavaScript bundle has not arrived yet,
 * and in the Jio Pages browser that came with the phone.
 *
 * That is not nostalgia. The reader this product exists for is the one whose landlord
 * has handed them eleven pages of English they cannot fully read, on the cheapest
 * handset in the shop. If the form needs a framework to submit, it does not work for
 * them, and every other feature is moot.
 *
 * Both inputs are optional individually and the server decides what arrived. Requiring
 * the textarea would break the file path, and marking either `required` would let the
 * browser block a submission the server can describe far better.
 */
export function PasteForm({ dictionary, language }: PasteFormProps): JSX.Element {
  const { landing } = dictionary;

  return (
    <form
      action="/analyze"
      method="post"
      encType="multipart/form-data"
      className="border-rule bg-surface space-y-7 border p-5 sm:p-6"
    >
      <input type="hidden" name="lang" value={language} />

      <div>
        <label htmlFor="documentText" className="block text-base font-medium">
          {landing.pasteLabel}
        </label>
        <p id="paste-hint" className="text-muted mt-1 text-sm">
          {landing.pasteHint}
        </p>
        <textarea
          id="documentText"
          name="documentText"
          rows={10}
          aria-describedby="paste-hint"
          spellCheck={false}
          className="border-rule-strong bg-paper mt-2 block w-full border p-3 font-mono text-sm leading-relaxed"
        />
      </div>

      <div>
        <label htmlFor="documentFile" className="block text-base font-medium">
          {landing.uploadLabel}
        </label>
        <p id="file-hint" className="text-muted mt-1 text-sm">
          {landing.uploadHint}
        </p>
        <input
          type="file"
          id="documentFile"
          name="documentFile"
          accept=".pdf,.docx,.txt,application/pdf,text/plain"
          aria-describedby="file-hint"
          className="border-rule-strong mt-2 block w-full border p-2.5 text-sm file:mr-3 file:min-h-9 file:border-0 file:bg-sunken file:px-3 file:text-sm"
        />
      </div>

      <div>
        <label htmlFor="documentType" className="block text-base font-medium">
          {landing.documentTypeLabel}
        </label>
        <select
          id="documentType"
          name="documentType"
          defaultValue=""
          className="border-rule-strong bg-paper mt-2 block min-h-11 w-full border px-3 text-base"
        >
          <option value="">{landing.documentTypeAuto}</option>
          {DocumentType.options.map((type) => (
            <option key={type} value={type}>
              {dictionary.documentTypes[type]}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="bg-accent text-accent-ink inline-flex min-h-12 w-full items-center justify-center px-6 text-base font-medium sm:w-auto"
      >
        {landing.submit}
      </button>
    </form>
  );
}
