import 'server-only';

/**
 * Format detection from the bytes themselves.
 *
 * The filename and the browser-supplied MIME type are both attacker-controlled and
 * both routinely wrong even when nobody is attacking: users rename files, and a
 * `Content-Type` of `application/octet-stream` is what several mobile browsers send for
 * everything. Dispatching a parser on either one means choosing which parser to run
 * based on a string a stranger typed, so neither is consulted here.
 *
 * Everything in this file is a pure function over a byte array. That keeps the
 * dangerous decision — which parser gets the bytes — testable with fixtures built in
 * the test file rather than with committed binaries.
 */

export type SniffedFormat =
  | 'pdf'
  /** A ZIP container. Whether it is a DOCX is a second question; see `inspectZip`. */
  | 'zip'
  /** Legacy Office (.doc/.xls) and encrypted OOXML both use this OLE container. */
  | 'ole'
  | 'unknown';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * Real-world PDFs sometimes carry a mail header or an HTTP preamble before `%PDF-`, and
 * every reader tolerates it, so the marker is searched for near the start rather than
 * required at offset zero. The window is small enough that a `%PDF-` buried deep inside
 * an unrelated file cannot masquerade as a header.
 */
const PDF_HEADER_WINDOW = 1024;

export function sniff(bytes: Uint8Array): SniffedFormat {
  if (startsWith(bytes, ZIP_MAGIC)) return 'zip';
  if (startsWith(bytes, OLE_MAGIC)) return 'ole';
  if (indexOfBytes(bytes.subarray(0, PDF_HEADER_WINDOW), PDF_MAGIC) !== -1) return 'pdf';
  return 'unknown';
}

export interface ZipInspection {
  /** True when the archive carries the OOXML word-processing main part. */
  readonly isWordProcessing: boolean;
  /** True when any local file header has the encryption bit set. */
  readonly encrypted: boolean;
}

/** "word/document.xml" — the part that makes a ZIP a Word document rather than an archive. */
const DOCX_MAIN_PART = [
  0x77, 0x6f, 0x72, 0x64, 0x2f, 0x64, 0x6f, 0x63, 0x75, 0x6d, 0x65, 0x6e, 0x74, 0x2e, 0x78, 0x6d,
  0x6c,
];

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const ENCRYPTED_FLAG = 0x0001;

/**
 * Decide what a ZIP actually contains.
 *
 * A `.docx` is a ZIP, but so is a `.xlsx`, a `.jar`, a source bundle and anything else
 * someone renames. Handing an arbitrary archive to a DOCX reader is how a zip-bomb or a
 * path-traversal entry gets a chance to run, so the archive has to prove it is a Word
 * document before `mammoth` is allowed near it.
 *
 * The proof is the presence of an entry literally named `word/document.xml`. Entry names
 * are stored uncompressed in ZIP, so scanning the raw bytes for that name finds it
 * without decompressing anything — which is the point: the check has to be cheaper than
 * the attack it prevents.
 */
export function inspectZip(bytes: Uint8Array): ZipInspection {
  return {
    isWordProcessing: indexOfBytes(bytes, DOCX_MAIN_PART) !== -1,
    encrypted: hasEncryptedEntry(bytes),
  };
}

/**
 * Read the general-purpose bit flag of the first local file header.
 *
 * Bit 0 is set on every entry of a password-protected archive. Only the first header is
 * read: it is at a known offset, and an archive whose first entry is encrypted is
 * encrypted as far as this product is concerned.
 */
function hasEncryptedEntry(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) return false;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE) return false;
  return (view.getUint16(6, true) & ENCRYPTED_FLAG) !== 0;
}

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.byteLength < magic.length) return false;
  return magic.every((byte, index) => bytes[index] === byte);
}

/** Naive search. Bounded by `LIMITS.maxUploadBytes`, which is checked before we get here. */
function indexOfBytes(haystack: Uint8Array, needle: readonly number[]): number {
  const first = needle[0];
  if (first === undefined) return -1;

  const last = haystack.byteLength - needle.length;
  for (let start = 0; start <= last; start += 1) {
    if (haystack[start] !== first) continue;
    if (needle.every((byte, index) => haystack[start + index] === byte)) return start;
  }
  return -1;
}
