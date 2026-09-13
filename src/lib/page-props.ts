/**
 * The two shapes every App Router page receives.
 *
 * Both are promises: route parameters and query strings are resolved asynchronously so
 * that a page can begin rendering before they are known. Declaring them once stops
 * every page from re-deriving the same type slightly differently.
 */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export type RouteParams<TKey extends string> = Promise<Record<TKey, string>>;
