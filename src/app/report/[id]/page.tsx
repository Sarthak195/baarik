import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';

import { getAnswer } from '@/app/api/ask/answer-store';
import { TimeSensitiveInterrupt } from '@/components/disclaimer/TimeSensitiveInterrupt';
import { AskPanel } from '@/components/qa/AskPanel';
import { parseAskError } from '@/components/qa/types';
import { AnalysisProgress } from '@/components/report/AnalysisProgress';
import { ClauseCard } from '@/components/report/ClauseCard';
import { MissingClauses } from '@/components/report/MissingClauses';
import { NextStepsPanel } from '@/components/report/NextStepsPanel';
import { PrintButton } from '@/components/report/PrintButton';
import { ReportSummary } from '@/components/report/ReportSummary';
import { SeverityLegend } from '@/components/report/SeverityChip';
import { SourceDocument } from '@/components/report/SourceDocument';
import { UnverifiedFindings } from '@/components/report/UnverifiedFindings';
import { Callout } from '@/components/ui/Callout';
import { PageShell } from '@/components/ui/PageShell';
import { dictionaryFor, parseLanguage, withLanguage } from '@/i18n';
import { sampleEntry } from '@/server/samples/catalogue';
import { sampleReportView } from '@/server/samples/view';
import { LIMITS } from '@/server/config/limits';
import { getReport } from '@/server/store/report-store';
import { ExpiredReport } from '@/components/report/ExpiredReport';
import type { RouteParams, SearchParams } from '@/lib/page-props';

interface ReportPageProps {
  readonly params: RouteParams<'id'>;
  readonly searchParams: SearchParams;
}

const RESULTS_HEADING_ID = 'analysis-results';

/** A live report is keyed by randomUUID; a sample is keyed by a readable slug. */
const LIVE_REPORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: ReportPageProps): Promise<Metadata> {
  const { id } = await params;
  const report = sampleReportView(id);
  return { title: report?.title ?? 'Report' };
}

/**
 * The report.
 *
 * Every component below is a pure function of its props; this page is the only thing
 * that knows where a report comes from. Today that is a fixture registry, tomorrow an
 * `AnalysisCache` lookup keyed by document hash, and nothing underneath has to change.
 * That cache now exists in `src/server/store/analysis-cache.ts`, in memory and bounded.
 *
 * The hard interrupt (ADR 0005) takes over the whole page when a limitation period is
 * close or has run, rather than sitting in a banner the reader scrolls past. It always
 * offers both ways forward, and both are links, so there is no state to escape from.
 */
export default async function ReportPage({
  params,
  searchParams,
}: ReportPageProps): Promise<JSX.Element> {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  // A live analysis first, then the committed fixtures. The fixtures are not a
  // fallback for a failed lookup — they are separate reports with their own ids — so
  // a miss on both is genuinely a 404 rather than a silent substitution.
  const report = getReport(id, Date.now()) ?? sampleReportView(id);

  if (report === null) {
    // An id shaped like a generated one belonged to a live analysis that is gone: the
    // store is memory only, so a restart, a thirty-minute wait, or a second Cloud Run
    // instance all lose it. That is the visible cost of storing nothing, and the reader
    // deserves to be told which it was rather than shown a bare 404.
    if (LIVE_REPORT_ID.test(id)) {
      const language = parseLanguage(query.lang);
      return <ExpiredReport dictionary={dictionaryFor(language)} language={language} />;
    }
    notFound();
  }

  // A live report has no catalogue entry, and only catalogued documents are samples.
  // Saying "this is a sample" over someone's own contract would be worse than saying
  // nothing. Asked of the catalogue rather than by rebuilding the view: the answer is
  // a single string comparison either way, and one of them reads a file.
  const isSample = sampleEntry(id) !== null;

  const language = parseLanguage(query.lang);
  const dictionary = dictionaryFor(language);
  const acknowledgedDeadline = query.continue === '1';

  // `/api/ask` answered a moment ago and sent the reader back here with a token. The
  // token is redeemed against this report's id, so one moved to another report's URL
  // by hand resolves to nothing rather than to somebody else's question.
  const answered = typeof query.answered === 'string' ? query.answered : null;
  const answer = answered === null ? null : getAnswer(answered, report.id, Date.now());
  const askError = parseAskError(query.askError);

  if (report.timeSensitive && !acknowledgedDeadline) {
    const urgent = report.nextSteps.find((step) => step.clock !== null);
    return (
      <PageShell dictionary={dictionary} language={language} current="home">
        <TimeSensitiveInterrupt
          dictionary={dictionary}
          language={language}
          clock={urgent?.clock ?? null}
          continueHref={withLanguage(`/report/${report.id}?continue=1`, language)}
        />
      </PageShell>
    );
  }

  return (
    <PageShell dictionary={dictionary} language={language} current="home">
      <div className="space-y-12">
        <header>
          {isSample ? (
            <Callout tone="warning" className="mb-6">
              {dictionary.report.sampleBanner}
            </Callout>
          ) : (
            <Callout tone="neutral" className="mb-6">
              {dictionary.report.liveBanner}
            </Callout>
          )}
          <p className="text-faint text-xs font-semibold tracking-[0.14em] uppercase">
            {dictionary.documentTypes[report.documentType]}
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl">{report.title}</h1>
        </header>

        <AnalysisProgress
          heading={dictionary.report.analysisHeading}
          stages={dictionary.report.stages}
          completeLabel={dictionary.report.complete}
          resultsHeadingId={RESULTS_HEADING_ID}
          stageMs={420}
        />

        <div className="space-y-8">
          <h2 id={RESULTS_HEADING_ID} tabIndex={-1} className="scroll-mt-4 text-2xl">
            {dictionary.report.resultsHeading}
          </h2>

          <ReportSummary risk={report.risk} grounding={report.grounding} dictionary={dictionary} />

          <PrintButton label={dictionary.report.download} note={dictionary.footer.notSaved} />
        </div>

        <section aria-labelledby="findings-heading" className="space-y-5">
          <h2 id="findings-heading" className="text-2xl">
            {dictionary.report.findingsHeading}
          </h2>
          <SeverityLegend dictionary={dictionary} />
          <div className="space-y-6">
            {report.clauses.map((clause) => (
              <ClauseCard key={clause.finding.id} clause={clause} dictionary={dictionary} />
            ))}
          </div>
        </section>

        <MissingClauses
          drivers={report.risk.drivers}
          unknowns={report.risk.unknowns}
          dictionary={dictionary}
        />

        <NextStepsPanel steps={report.nextSteps} dictionary={dictionary} />

        {/* Above the discarded findings on purpose. Asking a question of the document
            is one of the four things this product claims to do; burying it under a
            section about what the system got wrong would read as an afterthought. */}
        <AskPanel
          dictionary={dictionary}
          language={language}
          reportId={report.id}
          maxQuestionChars={LIMITS.maxQuestionChars}
          answer={answer ?? undefined}
          error={askError ?? undefined}
        />

        <UnverifiedFindings rejected={report.rejected} dictionary={dictionary} />

        <SourceDocument
          text={report.documentText}
          clauses={report.clauses}
          dictionary={dictionary}
        />
      </div>
    </PageShell>
  );
}
