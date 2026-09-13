import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Conditional class names, with later Tailwind utilities beating earlier ones.
 *
 * Without the merge step a component that sets `px-4` internally cannot be overridden
 * by a caller passing `px-6`: both classes land in the attribute and the winner is
 * decided by stylesheet order, which is unrelated to intent.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
