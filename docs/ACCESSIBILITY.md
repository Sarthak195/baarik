# Accessibility

The contest scores accessibility as *"how usable the solution is for diverse users and
environments"* — which is wider than WCAG and, for a product aimed at Indian consumers
reading their own contracts, more demanding. A tenant on a five-year-old Android phone
on a metered connection is as much an accessibility case as a screen-reader user.

This document states what is implemented, with file references, and then states what is
not. The second half is the more useful one.

---

## 1. The structural decisions

### Two client components in the entire application

`src/components/report/AnalysisProgress.tsx` and `src/components/report/PrintButton.tsx`
are the only files carrying `'use client'`. Everything else is a server component.

The consequence is the one that matters: **the whole primary flow works with JavaScript
switched off.** Disclaimer → form → analysis → report → statute disclosures → language
switch is server-rendered links and one plain form POST.

### The form is a plain POST to a route handler, not a Server Action

`src/components/upload/PasteForm.tsx`:

```tsx
<form
  action="/analyze"
  method="post"
  encType="multipart/form-data"
```

and `src/app/analyze/route.ts` explains why this is not a Server Action:

> *"A Server Action degrades to a plain POST when scripting is unavailable, but only
> because the framework arranges it; this is a plain POST because that is all it ever
> was. The distinction matters when the requirement is 'works with JavaScript switched
> off' rather than 'usually works' — there is nothing here to degrade."*

The handler answers `303`, so the report URL is shareable and a refresh does not re-post.

### Native elements instead of JavaScript widgets

| Need | What is used | Where |
|---|---|---|
| Expand/collapse | `<details>` / `<summary>` | `src/components/ui/Disclosure.tsx` |
| Blocking disclaimer | A full page with two ordinary links, **not a modal** | `src/components/disclaimer/OnboardingNotice.tsx` |
| Deadline interrupt | Two `<Link>`s, always two | `src/components/disclaimer/TimeSensitiveInterrupt.tsx` |
| Language switch | A bare `<a>` with `hreflang` | `src/components/ui/SiteFooter.tsx` |
| Sample documents | Ordinary links | `src/components/upload/SampleDocuments.tsx` |

`OnboardingNotice.tsx` states the reasoning:

> *"Blocking, and deliberately not a modal. A modal would need JavaScript to open, focus
> trapping to be usable with a keyboard, and an escape route that a modal is always one
> bug away from losing."*

### No copy button — deliberately

There is no clipboard code anywhere in the repository. `src/components/report/ClauseActions.tsx`:

> *"Replacement wording is supplied as selectable text rather than behind a copy button.
> A copy button needs JavaScript to work at all, and a button that silently does nothing
> is worse than no button; long-press to select is how text moves on the phones this is
> built for anyway."*

Suggested wording is rendered in a `<figure>` / `<figcaption>` instead.

`PrintButton.tsx` applies the same rule in the opposite direction: it calls
`window.print()`, so it gates itself behind hydration and **renders nothing** when
scripting is unavailable, rather than showing an inert control. The "this report is not
saved" sentence beside it is server-rendered and always present. The print stylesheet
(`src/app/globals.css`) hides chrome, avoids breaking inside a clause card, and resolves
`href`s into printed text.

### No webfonts, no images, no third-party scripts

- No font is loaded at all (`src/app/globals.css`) — the system stack is used.
- There is not a single `<img>` or `next/image` in `src/`. Every graphic is inline SVG.
- No analytics, no tag manager, no CDN JavaScript.

On a metered connection in a small town this is the accessibility feature, whatever the
audit checklist says.

---

## 2. Perceivable

### Risk is never conveyed by colour alone

Four channels carry severity, and colour is explicitly the redundant one.
`src/components/report/SeverityChip.tsx`:

```tsx
const ICONS: Readonly<Record<RiskSignal, (props: IconProps) => JSX.Element>> = {
  challenged: OctagonIcon,
  risky: TriangleIcon,
  standard: DiscIcon,
  favourable: RingIcon,
};
```

The word is always rendered beside the icon and is never abbreviated. The four icons are
**distinct silhouettes**, not four colours of one glyph — octagon, warning triangle,
filled disc and open ring (`src/components/ui/Icons.tsx`); the filled/open pairing is
deliberate so the two quiet states differ in mass as well as hue. A `SeverityLegend`
prints all four above the clause list.

From the file's own comment: *"Remove the colour and this still reads."* The design-token
block in `globals.css` says the same: *"Severity. Never used alone — every one of these
ships with an icon, a shape and a word."*

### The asymmetry meter uses texture, and is hidden from assistive technology

`src/components/report/TaraazuMeter.tsx` renders your share as a solid fill and the other
side's as a 45° hatch (the `hatched` utility in `globals.css`), marks the bar
`aria-hidden="true"`, and repeats the identical fact in prose plus a raw fraction:

> *"Print it in greyscale, photocopy it, or view it with either common form of colour
> blindness and the two halves stay two halves."*

The tier bars in `ReportSummary.tsx` follow the same pattern — `aria-hidden` bar, numeric
value in text beside it.

`src/components/ui/Callout.tsx` carries tone on a left border rule as well as a
background colour, for the same greyscale reason.

### Zoom is not blocked

`src/app/layout.tsx` sets a viewport with no `maximum-scale` and no `user-scalable=no`,
with a comment stating that pinch-zoom and 200% desktop zoom must keep working.

---

## 3. Operable

### Skip link, first in the DOM and genuinely focusable

`src/components/ui/PageShell.tsx`:

```tsx
<a
  href="#main-content"
  className="focus:bg-accent focus:text-accent-ink sr-only focus:not-sr-only ..."
>
  {dictionary.nav.skipToContent}
</a>
```

It precedes the header, its text is translated (`nav.skipToContent` exists in both
dictionaries), and it uses `sr-only` / `focus:not-sr-only` rather than `display: none`,
which would remove it from the focus order entirely. Its target carries `tabIndex={-1}`
so focus actually lands:

```tsx
<main id="main-content" tabIndex={-1}>
```

### Focus is visible everywhere, and never suppressed

`src/app/globals.css`:

```css
:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  border-radius: 2px;
}
```

`:focus-visible` rather than `:focus`, with a dedicated `--focus` token defined for both
light and dark themes. **`outline: none` does not appear anywhere in the repository.**

### Reduced motion is respected in CSS and in JavaScript

`globals.css` carries the standard `prefers-reduced-motion: reduce` block, which also
unwinds the `scroll-behavior: smooth` set earlier in the file.
`AnalysisProgress.tsx` checks `window.matchMedia('(prefers-reduced-motion: reduce)')` and
skips its staged reveal entirely.

That component also refuses to steal focus: it moves focus to the results heading only
`if (document.activeElement === document.body)`, so a reader who is mid-Tab is left alone.

### Touch targets

`min-h-11` (44 px) on effectively every interactive element, `min-h-12` on the submit
button.

---

## 4. Understandable

### Landmarks and headings

One each of `<header>`, `<nav aria-label={...}>`, `<main>`, `<footer>` per page, all
supplied by `PageShell.tsx`. Heading order is clean on every route: `h1` → `h2` → `h3`,
with `h4` only inside the statute disclosures on a clause card. One heading is
visually hidden but present (`ReportSummary.tsx`).

### Semantics chosen for meaning, not for layout

| Content | Element | Where |
|---|---|---|
| Verbatim quotes from the document | `<blockquote>` | `ClauseCard.tsx`, `ClauseEnforceability.tsx`, `UnverifiedFindings.tsx` |
| Case citations | `<cite>` | `ClauseEnforceability.tsx` |
| Suggested replacement wording | `<figure>` / `<figcaption>` | `ClauseActions.tsx` |
| Clause facts, forum details, aid routes | `<dl>` / `<dt>` / `<dd>` | `ClauseCard.tsx`, `NextStepsPanel.tsx`, `legal-aid/page.tsx` |
| Anything with a real order | `<ol>` | pipeline steps, next steps, arithmetic |
| Cited spans in the source text | `<mark id=… tabIndex={-1}>` | `SourceDocument.tsx` |

The `<mark>` detail is worth naming: each cited span is a focus target, so "show in
document" moves the caret rather than merely scrolling the viewport.

Every form control has an associated `<label htmlFor>` and an `aria-describedby` hint
(`PasteForm.tsx`).

### Reading level is a prompt parameter, not a style

`ReadingLevel` (`src/schemas/document-type.ts`) is `'standard' | 'simple'` and is passed
into the generation prompt — *"A real prompt change, not a CSS class."* The guardrails
(`src/server/prompts/shared/guardrails.ts`) require class-8 reading level and expansion
of every legal term on first use.

---

## 5. Language and reach

### Hindi is a data concern, not a code concern

Two dictionaries — `src/i18n/en.ts` and `src/i18n/hi.ts` — both satisfying the
`Dictionary` interface in `src/i18n/types.ts`. **127 translatable string values in each,
in exact parity**, because the interface makes a missing key a compile error rather than
a runtime fallback to English. Nine sub-records are typed
`Readonly<Record<Union, string>>`, so adding a new `Verdict` or `DocumentType` breaks the
build until both languages cover it.

No component contains a Devanagari literal except the wordmark बारीक in `SiteHeader.tsx`.

Two dictionary entries are functions rather than templates, for a reason worth recording
(`src/i18n/types.ts`): *"the clause order differs between English and Hindi, and
interpolating into a fixed English skeleton would produce Hindi words in English
syntax."*

Rubric rules carry both languages too — `explain: { en, hi }` is **required** by
`RubricRuleSchema` in `src/core/rubric/schema.ts`, so a rule that exists only in English
fails validation at boot rather than silently degrading the Hindi report.

### Language lives in the URL

`src/i18n/index.ts` reads `?lang=` and nothing else — no cookie, no client state:

> *"a query parameter survives JavaScript being unavailable, survives being shared over
> WhatsApp, and needs no storage — which matters when the product's first claim is that
> it stores nothing (ADR 0008)."*

### The sample path costs zero API calls

`src/components/upload/SampleDocuments.tsx` renders plain links to `/report/<id>`, and
`src/app/report/[id]/page.tsx` resolves them through `sampleReportView` in
`src/server/samples/view.ts`, which joins a recorded report from `golden/reports/` to
its fixture text and runs it through the same adapter a live analysis uses. Reading
two committed files and memoised after the first reader: no model call, no key, no
quota, no failure mode.

This is an accessibility property as much as an efficiency one: the demo works on a
throttled connection, works when the free tier is exhausted, and works for an evaluator
who arrives after everyone else has used the day's quota.

---

## 6. Known gaps

Stated plainly. Several of these are choices; some are defects.

### Language

1. **`<html lang>` is always `en`.** `src/app/layout.tsx` hardcodes it. A root layout
   cannot read the URL, so it cannot know which language was requested; the translated
   subtree is instead wrapped in `<div lang={language}>` by `PageShell.tsx`. A screen
   reader that honours the nearest `lang` ancestor gets the right voice for content; one
   that consults only the document element does not. This is a real compromise, chosen
   over a cookie or middleware rewrite because both would add state the product
   otherwise does not have.

2. **`<title>` and `<meta description>` are English on every route**, always. Metadata is
   generated outside the `lang` subtree and is not translated.

3. **`/how-it-works` and `/legal-aid` prose is English-only.** The page chrome, header,
   footer and skip link translate; the body copy does not. Both pages honestly re-declare
   `<div lang="en">` around that prose rather than letting a Hindi document language lie
   about English text — but the footer language switcher is visible on both pages and
   changes very little there.

4. **`src/app/not-found.tsx` is English-only**, acknowledged in its own comment: it
   cannot read the URL, so it answers in English.

5. **The recorded sample reports are English-only.** `golden/reports/` contains no
   Devanagari. In Hindi mode a reader gets Hindi row labels around English clause
   explanations. The live pipeline is better provisioned than the demo — `data/rubric/*.yaml`
   carries `hi:` templates for every rule — but the samples are the path that runs without a
   key, so it is the path most readers will see.

6. **Some English fragments are concatenated into otherwise-translated output**:
   `NextStepsPanel.tsx` (`'this period has run'`, the fee and waiting-period parentheses)
   and `TimeSensitiveInterrupt.tsx` (`' — this period has run'`). `src/lib/format.ts`
   hardcodes `day`/`days`/`month`/`months` and pins all three `Intl` formatters to
   `en-IN` — correct for 2-2-3 digit grouping, wrong for a Hindi month name.

7. **`UnverifiedFindings.tsx` renders the raw enum value** of an `UngroundedReason`, so a
   reader sees the literal token `not_found` rather than a sentence.

### Markup and assistive technology

8. **There are no `<table>` elements anywhere**, so nothing in this repository can claim
   accessible table headers. Tabular-looking data is built from description lists.

9. **`Callout.tsx` always emits `<h2>`** with no level prop. It is correct on the two
   pages that use it today, but a Callout nested inside an `h2` section would break the
   outline. A latent hazard, not a current violation.

10. **`SeverityLegend` has no accessible name** — it is a bare `<ul>` of four chips
    between the findings heading and the clause list.

11. **The labelled-icon path is dead code.** `Icons.tsx` supports `role="img"` with a
    `<title>` when a `title` prop is passed; no caller passes one. Every icon in the
    application is `aria-hidden` beside a text label. That is correct, but the capability
    is unexercised.

12. **`aria-current="true"`** on the language switcher rather than a more specific token
    (the header navigation correctly uses `aria-current="page"`).

13. **`AnalysisProgress` announces a process that is not happening.** The server renders
    the completed state; the component rewinds to zero and replays five stages on a timer
    inside an `aria-live="polite"` region. It is a staged reveal, not progress feedback,
    and should never be described as streaming.

### Not measured, not handled

14. **No colour-contrast ratio has been verified.** The token palette looks considered
    and defines a full dark theme, but nothing in this repository measures it. No WCAG AA
    or AAA claim is made. The value most likely to fail is `--ink-faint` on `--paper`,
    used for small uppercase labels throughout.

15. **No `prefers-contrast` or `forced-colors` handling.** Windows High Contrast mode may
    drop background painting, which would flatten the hatched texture the asymmetry meter
    relies on — the one place where a non-colour channel is itself a background effect.
    Untested.

16. **`color-mix()` and `min-h-dvh` are modern CSS** and are used by the hatch utility and
    the page shell respectively. Neither has been tested on the five-year-old Android
    browsers the design comments name as the target. If `color-mix` is unsupported the
    hatch may degrade toward a flat fill — degrading exactly the mechanism that makes the
    meter colour-independent.

17. **No automated accessibility testing.** `eslint-plugin-jsx-a11y` was lost when
    `eslint-config-next` was dropped for ESLint 10 compatibility; ADR 0007 records that
    trade and names re-adding it as the trigger for revisiting. There is no axe run, no
    Lighthouse budget and no browser-driven suite; the test suite
    (`tests/**`) is entirely unit-level and runs in Node. Accessibility here is covered
    by semantic markup and manual review, which is weaker evidence than a test and is
    stated as such rather than dressed up.

18. **No `role="alert"` or error region exists.** Server-side ingest and rate-limit
    messages are generated but are not currently rendered to the reader — see
    `docs/LIMITATIONS.md`, which records this as an open defect rather than a design
    choice.
