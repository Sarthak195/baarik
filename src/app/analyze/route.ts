import { DEFAULT_REPORT_ID } from '@/lib/demo';
import { parseLanguage, withLanguage } from '@/i18n';

/**
 * Where the landing form posts.
 *
 * A route handler rather than a Server Action, deliberately. A Server Action degrades
 * to a plain POST when scripting is unavailable, but only because the framework
 * arranges it; this is a plain POST because that is all it ever was. The distinction
 * matters when the requirement is "works with JavaScript switched off" rather than
 * "usually works" — there is nothing here to degrade.
 *
 * The answer is a 303, so the browser follows it with a GET. That keeps the report
 * URL shareable and reloadable, and keeps a refresh from re-posting the document.
 *
 * This handler imports nothing from `src/server`. The analysis pipeline lands in a
 * separate commit and will be called from exactly here; until then the redirect
 * resolves to a demonstration report, and the report page says as much on its face.
 */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const language = parseLanguage(readField(form, 'lang'));

  const target = withLanguage(`/report/${DEFAULT_REPORT_ID}`, language);
  return Response.redirect(new URL(target, request.url), 303);
}

/**
 * `FormDataEntryValue` is `string | File`, and a `File` where a string was expected
 * means the request was malformed rather than that the field is empty — so it is
 * discarded rather than coerced into the string "[object File]".
 */
function readField(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === 'string' ? value : undefined;
}
