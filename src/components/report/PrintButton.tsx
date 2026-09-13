'use client';

import { useEffect, useState, type JSX } from 'react';

import { DownloadIcon } from '@/components/ui/Icons';

export interface PrintButtonProps {
  readonly label: string;
  readonly note: string;
}

/**
 * "Download this report" — which is the browser's own print dialogue, saved as a PDF.
 *
 * No server-side PDF renderer. Print CSS costs nothing, prints better than a generated
 * document, and keeps the report's links and text selectable in the saved file. The
 * print rules live at the bottom of `globals.css`.
 *
 * The button renders only after hydration. Printing cannot be triggered without
 * scripting, and a control that is visible but inert teaches the reader that the
 * interface lies to them — so where the capability is absent, so is the button. The
 * sentence beside it, which is the part that actually matters, is server-rendered in
 * the footer and is always there.
 */
export function PrintButton({ label, note }: PrintButtonProps): JSX.Element | null {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    setAvailable(true);
  }, []);

  if (!available) return null;

  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-2" data-print="hide">
      <button
        type="button"
        onClick={() => {
          window.print();
        }}
        className="border-rule-strong inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-medium"
      >
        <DownloadIcon className="h-4 w-4" />
        {label}
      </button>
      <span className="text-muted text-sm">{note}</span>
    </p>
  );
}
