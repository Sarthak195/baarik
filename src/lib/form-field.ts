/**
 * Reading one text field out of a posted form.
 *
 * `FormDataEntryValue` is `string | File`, and a `File` where a string was expected
 * means the request was malformed rather than that the field is empty — so it is
 * discarded rather than coerced into the string "[object File]".
 *
 * Shared by `/analyze` and `/api/ask`, which had a byte-identical copy each. Two
 * copies of a parser is two places for a rule about malformed input to drift, and this
 * project has already lost every file upload once to a form and a handler disagreeing
 * about a field.
 */
export function readField(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === 'string' ? value : undefined;
}

/**
 * The posted form, or `null` when the body was not one.
 *
 * `formData()` throws on a body whose content type it cannot parse. A browser always
 * sends the right one, so reaching the `null` is a hand-crafted request — but an uncaught
 * throw is a 500, which tells the caller the server broke when in fact their request did.
 */
export async function readForm(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}

/**
 * The answer to a body that was not a form.
 *
 * Plain text rather than a redirect, on both endpoints: a redirect carries the reader
 * back to a form, and whoever sent this was not using one.
 */
export function malformedBody(): Response {
  return new Response('That was not a form this endpoint can read.\n', {
    status: 400,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
