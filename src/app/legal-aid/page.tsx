import type { Metadata } from 'next';
import type { JSX } from 'react';

import type { LegalAidGround } from '@/core/legal-aid/types';
import { Callout } from '@/components/ui/Callout';
import { ExternalIcon } from '@/components/ui/Icons';
import { PageShell } from '@/components/ui/PageShell';
import { dictionaryFor, parseLanguage } from '@/i18n';
import type { SearchParams } from '@/lib/page-props';

export const metadata: Metadata = {
  title: 'Free legal aid',
  description:
    'Section 12 of the Legal Services Authorities Act, 1987 entitles a very large number of people in India to a free advocate, most of them irrespective of what they earn. This page says who, and where to go.',
};

interface Ground {
  readonly section: string;
  readonly who: string;
  readonly meansTested: boolean;
}

/**
 * Section 12, in the Act's own order.
 *
 * Typed as a total record over `LegalAidGround` so that a ground added to the core
 * union fails to compile until it is described here. The single most important fact on
 * this page is that every ground except the last applies *irrespective of income* —
 * and that between them, every woman, every child's matter and every industrial
 * workman is covered, which is a very large share of the people who will ever open
 * this application and almost none of whom know it.
 */
const GROUNDS: Readonly<Record<LegalAidGround, Ground>> = {
  scheduled_caste_or_tribe: {
    section: 's.12(a)',
    who: 'A member of a Scheduled Caste or Scheduled Tribe.',
    meansTested: false,
  },
  trafficking_or_begar_victim: {
    section: 's.12(b)',
    who: 'A victim of trafficking in human beings, or of begar, within Article 23 of the Constitution.',
    meansTested: false,
  },
  woman_or_child: {
    section: 's.12(c)',
    who: 'Every woman. Every child.',
    meansTested: false,
  },
  mental_illness_or_disability: {
    section: 's.12(d)',
    who: 'A person with a mental illness or another disability.',
    meansTested: false,
  },
  undeserved_want: {
    section: 's.12(e)',
    who: 'A person in circumstances of undeserved want — a mass disaster, ethnic violence, caste atrocity, flood, drought, earthquake or industrial disaster.',
    meansTested: false,
  },
  industrial_workman: {
    section: 's.12(f)',
    who: 'An industrial workman.',
    meansTested: false,
  },
  in_custody: {
    section: 's.12(g)',
    who: 'A person in custody, including in a protective home, a juvenile home or a psychiatric hospital.',
    meansTested: false,
  },
  income_below_ceiling: {
    section: 's.12(h)',
    who: 'A person whose annual income is below the ceiling their State has fixed. Rs 5,00,000 applies to Supreme Court matters.',
    meansTested: true,
  },
};

const ORDER: readonly LegalAidGround[] = [
  'scheduled_caste_or_tribe',
  'trafficking_or_begar_victim',
  'woman_or_child',
  'mental_illness_or_disability',
  'undeserved_want',
  'industrial_workman',
  'in_custody',
  'income_below_ceiling',
];

export default async function LegalAidPage({
  searchParams,
}: {
  readonly searchParams: SearchParams;
}): Promise<JSX.Element> {
  const params = await searchParams;
  const language = parseLanguage(params.lang);
  const dictionary = dictionaryFor(language);

  return (
    <PageShell dictionary={dictionary} language={language} current="legalAid">
      <div lang="en" className="space-y-10">
        <header className="max-w-[62ch]">
          <p className="text-faint mb-3 text-xs font-semibold tracking-[0.14em] uppercase">
            Legal Services Authorities Act, 1987
          </p>
          <h1 className="text-4xl">A free advocate, today, for far more people than expect one</h1>
          <p className="text-muted mt-5 text-[1.0625rem] leading-relaxed">
            Section 12 lists who is entitled to free legal services — advice, drafting and
            representation by a panel advocate, with court fees and process fees paid. Seven of the
            eight grounds do not look at income at all.
          </p>
        </header>

        <section aria-labelledby="grounds-heading">
          <h2 id="grounds-heading" className="text-2xl">
            Who is entitled
          </h2>
          <ul className="mt-4 space-y-4">
            {ORDER.map((ground) => (
              <li key={ground} className="border-rule-strong border-l-4 pl-4">
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-mono text-sm font-semibold">{GROUNDS[ground].section}</span>
                  {!GROUNDS[ground].meansTested && (
                    <span className="text-favour border-favour/40 bg-favour-bg border px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wider uppercase">
                      Whatever you earn
                    </span>
                  )}
                </p>
                <p className="mt-1">{GROUNDS[ground].who}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="where-heading">
          <h2 id="where-heading" className="text-2xl">
            Where to go
          </h2>
          <dl className="mt-4 space-y-4">
            <Entry term="Your District Legal Services Authority">
              Every district court complex has one, and it takes walk-in applications. Eligibility
              is decided by the Authority on the application and the documents filed with it.
            </Entry>
            <Entry term="NALSA helpline — 15100">
              Toll-free, and open to everyone. It is the fastest route if you are not sure which
              Authority covers you.
            </Entry>
            <Entry term="Tele-Law">
              Connects you to a panel lawyer free of charge through a Common Service Centre or the
              Tele-Law app, in 22 languages.
            </Entry>
            <Entry term="Lok Adalat">
              Settles a dispute by consent, before or after a case is filed. Section 21 makes the
              award a decree of a civil court, and refunds the court fee already paid — but no
              appeal lies from it, so what is agreed there cannot be reopened.
            </Entry>
          </dl>

          <p className="mt-6">
            <a
              href="https://nalsa.gov.in/"
              rel="noreferrer noopener"
              target="_blank"
              className="border-rule-strong inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-medium"
            >
              Find your Authority on nalsa.gov.in
              <ExternalIcon className="h-3.5 w-3.5" />
            </a>
          </p>
        </section>

        <Callout tone="neutral" heading="What this page does not decide" asSection>
          <p>
            This describes what the Act provides. Whether you qualify is for the Legal Services
            Authority to decide on your application, and applying does not stop the limitation
            period for your underlying claim from running.
          </p>
        </Callout>
      </div>
    </PageShell>
  );
}

function Entry({ term, children }: { readonly term: string; readonly children: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:gap-6">
      <dt className="font-medium">{term}</dt>
      <dd className="text-muted max-w-[62ch]">{children}</dd>
    </div>
  );
}
