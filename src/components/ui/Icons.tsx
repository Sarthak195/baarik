import type { JSX, ReactNode } from 'react';

/**
 * Every icon in the application, drawn by hand.
 *
 * No icon library is installed and none should be. The cheapest of them costs tens of
 * kilobytes of JavaScript before a single glyph is painted, and the reader this
 * product is built for is on a five-inch Android over patchy mobile data. Ten inline
 * paths cost roughly two kilobytes of HTML that arrives with the page.
 *
 * The first four are load-bearing rather than decorative. They are the *shape* channel
 * of the risk signal: an octagon, a triangle, a filled disc and an open ring remain
 * distinguishable in greyscale, at 200% zoom, and to a reader with either common form
 * of colour blindness. Each one always ships beside its word — see `SeverityChip`.
 */

export interface IconProps {
  readonly className?: string | undefined;
  /**
   * Icons are decorative by default because the word beside them carries the meaning.
   * Passing a title makes the icon a labelled image instead, for the rare case where
   * it stands alone.
   */
  readonly title?: string | undefined;
}

function Svg({
  children,
  className,
  title,
}: IconProps & { readonly children: ReactNode }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? 'h-4 w-4'}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden={title === undefined}
      role={title === undefined ? undefined : 'img'}
    >
      {title !== undefined && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** ⛔ Commonly challenged. An octagon, because a stop sign is an octagon everywhere. */
export function OctagonIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M8.1 2.6h7.8l5.5 5.5v7.8l-5.5 5.5H8.1L2.6 15.9V8.1z" />
      <path d="M7.6 12h8.8" />
    </Svg>
  );
}

/** ▲ Risky for you. */
export function TriangleIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 3.2 22 20.3H2z" />
      <path d="M12 10v4.2" />
      <path d="M12 17.3h.01" />
    </Svg>
  );
}

/** ● Standard. Filled, so it reads as solid mass next to the open ring. */
export function DiscIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.2" fill="currentColor" />
    </Svg>
  );
}

/** ○ In your favour. */
export function RingIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.2" />
    </Svg>
  );
}

/** तराज़ू — the weighing scales the asymmetry meter is named for. */
export function ScalesIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 3v18M7 21h10M4 7h16M8 7l-4 7.5M4 14.5h8M8 7l4 7.5M16 7l-4 7.5M16 7l4 7.5M12 14.5h8" />
    </Svg>
  );
}

/** The disclosure caret. Rotated by CSS when the `<details>` element is open. */
export function CaretIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M9 5.5 16 12l-7 6.5" />
    </Svg>
  );
}

export function DownloadIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 3.5v11.5M7.5 10.5 12 15l4.5-4.5M4 19.5h16" />
    </Svg>
  );
}

export function ExternalIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7.5A1.5 1.5 0 0 1 5 6h5" />
    </Svg>
  );
}

/** Used only where a real statutory deadline is being shown. */
export function ClockIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.2 2" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </Svg>
  );
}

/** Marks a quote taken verbatim from the reader's own document. */
export function QuoteIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M9.5 6.5C6.5 8 5 10.3 5 13.2v4.3h5.2v-5.2H7.9c.1-1.9 1-3.3 2.6-4.2zM19.5 6.5c-3 1.5-4.5 3.8-4.5 6.7v4.3h5.2v-5.2h-2.3c.1-1.9 1-3.3 2.6-4.2z" />
    </Svg>
  );
}
