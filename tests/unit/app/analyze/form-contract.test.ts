import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The contract between a form and the handler it posts to, which is not a type.
 *
 * `route.test.ts` proves the wiring works today by driving a real `Request` through
 * `POST`. This proves nobody can quietly take it apart, which is a different property
 * and the one that actually failed: `PasteForm` posts the file under `documentFile`,
 * the handler read `form.get('document')`, and every upload was discarded in silence.
 *
 * The reason that defect survived review, a type checker, ESLint and 498 unit tests is
 * that a form field name is a string on one side and a string on the other, and nothing
 * in the toolchain relates them. TypeScript cannot: `FormData.get` takes `string` and
 * returns `FormDataEntryValue | null` by definition, so the wrong name is a perfectly
 * well-typed expression that returns `null` at runtime. A shared constant would help,
 * but only if both sides used it, and enforcing *that* is the same unsolved problem one
 * level up.
 *
 * So the two files are read as text and their field names compared. It is a blunt
 * instrument and it is aimed at exactly the thing that broke. The scrape is checked for
 * having found something before anything is concluded from it, because a regex that
 * silently matches nothing would turn this file into an expensive way of asserting that
 * the empty set is a subset of the empty set.
 */

const FORM_PATH = join(process.cwd(), 'src', 'components', 'upload', 'PasteForm.tsx');
const ROUTE_PATH = join(process.cwd(), 'src', 'app', 'analyze', 'route.ts');

/**
 * A file with its comments removed.
 *
 * Both of these modules explain themselves at length, and both explanations quote the
 * very field names being scraped — the handler's `extract` names `documentFile` in
 * prose directly above the line that reads it. Counting a comment as a submission or as
 * a read would make this file agree with itself no matter what the code did.
 *
 * The line-comment pass refuses to fire after a colon so that a `://` inside a URL is
 * left alone; both files carry one.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const form = code(readFileSync(FORM_PATH, 'utf8'));
const route = code(readFileSync(ROUTE_PATH, 'utf8'));

/** Every `name="..."` the form submits, which is what a browser puts on the wire. */
function postedFields(): ReadonlySet<string> {
  return new Set([...form.matchAll(/\bname="([^"]+)"/g)].map((match) => match[1] ?? ''));
}

/**
 * Every field name the handler looks up.
 *
 * Both spellings are collected: `form.get('x')` directly, and `readField(form, 'x')`,
 * the handler's own helper for the string case. `readField`'s internal `form.get(name)`
 * passes an identifier rather than a literal, so it contributes nothing and does not
 * need excluding.
 */
function readFields(): ReadonlySet<string> {
  const direct = [...route.matchAll(/\bform\.get\('([^']+)'\)/g)];
  const viaHelper = [...route.matchAll(/\breadField\(form,\s*'([^']+)'\)/g)];
  return new Set([...direct, ...viaHelper].map((match) => match[1] ?? ''));
}

/**
 * The three fields the handler has to understand for the page to work at all: the
 * textarea, the file input, and the language the answer is written in.
 */
const LOAD_BEARING = ['documentText', 'documentFile', 'lang'] as const;

/**
 * Posted by the form and read by nobody.
 *
 * Empty, and that is the point of keeping it. `documentType` lived here: a real, visible
 * `<select>` that `/analyze` never looked at, so the reader's answer was discarded and
 * the pipeline classified the document regardless. It is now read and passed as
 * `declaredType`, so the list is empty — which is what closing this class of defect looks
 * like.
 *
 * A new entry appearing here is a new inert control, and this test is where that becomes
 * visible instead of shipping.
 */
const POSTED_BUT_UNREAD: readonly string[] = [];

describe('the field names PasteForm posts and /analyze reads', () => {
  it('found field names on both sides, so nothing below is vacuous', () => {
    // If either scrape came back empty — an attribute written as `name={'x'}`, a handler
    // refactored onto a schema parser — every subset assertion in this file would pass
    // while checking nothing at all.
    expect(postedFields().size).toBeGreaterThanOrEqual(4);
    expect(readFields().size).toBeGreaterThanOrEqual(3);
  });

  it('reads nothing the form does not post', () => {
    const posted = postedFields();
    const unposted = [...readFields()].filter((name) => !posted.has(name));

    // This is the defect, stated as a set operation. `document` was read and never
    // posted, so `form.get` returned null on every upload and the handler fell through
    // to the empty-paste path with no error anywhere.
    expect(unposted).toEqual([]);
  });

  it('reads every field the analysis depends on', () => {
    const read = readFields();
    for (const name of LOAD_BEARING) {
      expect({ name, read: read.has(name) }).toEqual({ name, read: true });
    }
  });

  it('posts every field it reads, and no inert control beyond the known one', () => {
    const read = readFields();
    const ignored = [...postedFields()].filter((name) => !read.has(name)).sort();

    expect(ignored).toEqual([...POSTED_BUT_UNREAD]);
  });
});

describe('how PasteForm submits', () => {
  it('posts to the route this suite exercises', () => {
    // A form aimed somewhere else would make every assertion above true of two files
    // that never meet.
    expect(form).toContain('action="/analyze"');
    expect(form).toContain('method="post"');
  });

  it('encodes as multipart, without which no file is ever sent', () => {
    // `application/x-www-form-urlencoded` — the default — submits a file input as its
    // filename and nothing else. The bytes never leave the browser, and the failure
    // looks exactly like the field-name bug from the server's side.
    expect(form).toContain('encType="multipart/form-data"');
  });

  it('marks neither input required, so the server decides what arrived', () => {
    // The two inputs are alternatives and the browser cannot tell which one the reader
    // meant to use. A `required` on either would block a submission the handler can
    // describe far better than a native validation bubble can.
    expect(form).not.toMatch(/\brequired\b/);
  });
});
