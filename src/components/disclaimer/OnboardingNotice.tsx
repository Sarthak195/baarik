import Link from 'next/link';
import type { JSX } from 'react';

import type { Dictionary } from '@/i18n';
import { withLanguage } from '@/i18n';
import type { OutputLanguage } from '@/schemas/document-type';

export interface OnboardingNoticeProps {
  readonly dictionary: Dictionary;
  readonly language: OutputLanguage;
  /** Where "I understand" leads. The caller owns the URL so the notice stays reusable. */
  readonly continueHref: string;
}

/**
 * Tier one of three: the blocking notice (ADR 0005).
 *
 * Blocking, and deliberately not a modal. A modal would need JavaScript to open, focus
 * trapping to be usable with a keyboard, and an escape route that a modal is always
 * one bug away from losing. This is the page — the upload form is not rendered behind
 * it, so there is nothing to trap the reader in front of — and both ways out are
 * ordinary links that work with scripting switched off.
 *
 * It is shown on every visit rather than remembered. There is no account to remember
 * it against and nothing is stored anywhere (ADR 0008), and a legal boundary the
 * reader saw once in March is not a boundary they are operating under in September.
 */
export function OnboardingNotice({
  dictionary,
  language,
  continueHref,
}: OnboardingNoticeProps): JSX.Element {
  const { disclaimer } = dictionary;

  return (
    <section aria-labelledby="onboarding-heading" className="max-w-[62ch]">
      <p className="text-faint mb-3 text-xs font-semibold tracking-[0.14em] uppercase">
        {dictionary.meta.appName} · {dictionary.meta.tagline}
      </p>

      <h1 id="onboarding-heading" className="text-3xl sm:text-4xl">
        {disclaimer.onboardingHeading}
      </h1>

      <div className="border-l-rule-strong mt-6 space-y-4 border-l-4 pl-5 text-[1.0625rem] leading-relaxed">
        {disclaimer.onboardingBody.map((paragraph) => (
          <p key={paragraph.slice(0, 24)}>{paragraph}</p>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href={continueHref}
          className="bg-accent text-accent-ink inline-flex min-h-11 items-center justify-center px-6 text-base font-medium"
        >
          {disclaimer.onboardingAccept}
        </Link>
        <Link
          href={withLanguage('/how-it-works', language)}
          className="text-accent inline-flex min-h-11 items-center justify-center px-2 text-base underline underline-offset-4"
        >
          {disclaimer.onboardingRead}
        </Link>
      </div>
    </section>
  );
}
