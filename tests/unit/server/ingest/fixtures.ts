/**
 * Byte fixtures built in code rather than committed.
 *
 * The repository blocks binaries and lives under a 10 MB cap including history, so a
 * committed sample PDF is not an option. Generating them here is better anyway: the
 * test that asserts the scanned-document guard can say exactly how many characters a
 * page carries, which a checked-in file never could.
 *
 * Both builders emit the simplest structure the real parsers accept — an uncompressed
 * ZIP and a PDF with an honest cross-reference table — so a failure means the code
 * under test is wrong rather than the fixture being exotic.
 */

const ENCODER = new TextEncoder();

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

// --- ZIP ---------------------------------------------------------------------------

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  readonly name: string;
  readonly content: string;
  /** General-purpose bit flag. Bit 0 marks the entry encrypted. */
  readonly flags?: number;
}

/** A ZIP with every entry stored uncompressed, which is a shape every reader accepts. */
export function buildZip(entries: readonly ZipEntry[]): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = ENCODER.encode(entry.name);
    const data = ENCODER.encode(entry.content);
    const crc = crc32(data);
    const flags = entry.flags ?? 0;

    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, flags, true);
    header.setUint16(26, name.byteLength, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, data.byteLength, true);
    header.setUint32(22, data.byteLength, true);
    local.push(new Uint8Array(header.buffer), name, data);

    const directory = new DataView(new ArrayBuffer(46));
    directory.setUint32(0, 0x02014b50, true);
    directory.setUint16(4, 20, true);
    directory.setUint16(6, 20, true);
    directory.setUint16(8, flags, true);
    directory.setUint32(16, crc, true);
    directory.setUint32(20, data.byteLength, true);
    directory.setUint32(24, data.byteLength, true);
    directory.setUint16(28, name.byteLength, true);
    directory.setUint32(42, offset, true);
    central.push(new Uint8Array(directory.buffer), name);

    offset += 30 + name.byteLength + data.byteLength;
  }

  const centralBytes = concat(central);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralBytes.byteLength, true);
  end.setUint32(16, offset, true);

  return concat([concat(local), centralBytes, new Uint8Array(end.buffer)]);
}

const CONTENT_TYPES =
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '</Types>';

const ROOT_RELS =
  '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>';

/** A DOCX carrying one paragraph per string. */
export function buildDocx(paragraphs: readonly string[]): Uint8Array {
  const body = paragraphs
    .map((paragraph) => `<w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p>`)
    .join('');
  const document =
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}</w:body></w:document>`;

  return buildZip([
    { name: '[Content_Types].xml', content: CONTENT_TYPES },
    { name: '_rels/.rels', content: ROOT_RELS },
    { name: 'word/document.xml', content: document },
  ]);
}

// --- PDF ---------------------------------------------------------------------------

/**
 * Text is drawn as one `Tj` per line, 11pt at 14pt leading from the top of the page.
 * PDF.js discards glyphs positioned off the page, so a fixture that needs its text back
 * verbatim has to use short lines and few of them.
 */
function contentStream(pageText: string): string {
  const lines = pageText.split('\n');
  const drawn = lines.map((line) => `(${line.replace(/([\\()])/g, '\\$1')}) Tj T*\n`).join('');
  return `BT /F1 11 Tf 14 TL 40 740 Td\n${drawn}ET\n`;
}

/** A PDF with one page per string and a valid cross-reference table. */
export function buildPdf(pageTexts: readonly string[]): Uint8Array {
  const fontId = 3 + pageTexts.length * 2;
  const kids = pageTexts.map((_page, index) => `${String(3 + index * 2)} 0 R`).join(' ');

  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${String(pageTexts.length)} >>`,
  ];

  for (const [index, pageText] of pageTexts.entries()) {
    const contentId = 3 + index * 2 + 1;
    objects.push(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
        `/Resources << /Font << /F1 ${String(fontId)} 0 R >> >> /Contents ${String(contentId)} 0 R >>`,
    );
    const stream = contentStream(pageText);
    objects.push(
      `<< /Length ${String(ENCODER.encode(stream).byteLength)} >>\nstream\n${stream}endstream`,
    );
  }

  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(ENCODER.encode(body).byteLength);
    body += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  }

  const startxref = ENCODER.encode(body).byteLength;
  const size = objects.length + 1;
  const table = offsets.map((entry) => `${String(entry).padStart(10, '0')} 00000 n \n`).join('');

  body += `xref\n0 ${String(size)}\n0000000000 65535 f \n${table}`;
  body += `trailer\n<< /Size ${String(size)} /Root 1 0 R >>\nstartxref\n${String(startxref)}\n%%EOF\n`;

  return ENCODER.encode(body);
}

/** Lines dense enough that a page clears the scanned-document threshold comfortably. */
export function densePage(marker: string, lines = 8): string {
  return Array.from(
    { length: lines },
    (_unused, index) => `${marker}${String(index + 1)}: the Tenant shall pay the rent monthly.`,
  ).join('\n');
}
