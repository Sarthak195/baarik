import type { JSX } from 'react';

import type { Dictionary } from '@/i18n';
import { CheckIcon } from '@/components/ui/Icons';

/**
 * Three claims that are literally true rather than privacy-policy true.
 *
 * "No document is stored" is only worth printing because there is no database, no
 * object storage and no account to attach a document to (ADR 0008). A product that
 * stored documents and promised to delete them would need this paragraph to be much
 * longer and much less believable.
 */
export function PrivacyPromise({ dictionary }: { readonly dictionary: Dictionary }): JSX.Element {
  return (
    <ul className="space-y-2">
      {dictionary.landing.promises.map((promise) => (
        <li key={promise.slice(0, 24)} className="flex items-start gap-2.5 text-sm">
          <CheckIcon className="text-favour mt-1 h-3.5 w-3.5 shrink-0" />
          <span>{promise}</span>
        </li>
      ))}
    </ul>
  );
}
