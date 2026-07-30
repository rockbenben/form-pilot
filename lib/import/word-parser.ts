/**
 * Word text extraction.
 *
 * A `.doc` extension says almost nothing about the bytes behind it. Chinese
 * job boards routinely export "Word resumes" that are actually Word-flavoured
 * HTML with a `.doc` name, and mammoth — which only reads the OOXML zip — fails
 * on those with an opaque "Could not find file in options". So the format is
 * sniffed from the magic bytes rather than trusted from the filename.
 */

/** Thrown for the one format we genuinely cannot read in the browser. */
export const LEGACY_DOC_ERROR = 'LEGACY_DOC';

/**
 * Word-exported HTML opens with a large <head> of Office metadata — author
 * names, revision counts, save timestamps, word counts. Feeding that to the
 * field extractor is worse than useless: it matched the metadata block first
 * and produced a 20-character "name" before the real content was ever reached.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<xml[\s\S]*?<\/xml>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    // Block-level ends become line breaks so the extractor's line-by-line
    // matching has something to work with.
    .replace(/<\/(p|div|tr|li|h[1-6]|table|td|th)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Ampersand last, so the entities above are not corrupted first.
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Decode HTML bytes, honouring a declared charset. Word on a Chinese locale
 * still emits GB2312/GBK, which would otherwise decode to mojibake and match
 * nothing.
 */
function decodeHtml(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  const declared = utf8.match(/charset\s*=\s*["']?\s*([\w-]+)/i)?.[1]?.toLowerCase();
  if (!declared || declared === 'utf-8' || declared === 'utf8') return utf8;
  try {
    return new TextDecoder(declared).decode(buffer);
  } catch {
    // Unknown label — the utf-8 read is still the best available answer.
    return utf8;
  }
}

function magic(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer.slice(0, 8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function extractTextFromWord(arrayBuffer: ArrayBuffer): Promise<string> {
  const head = magic(arrayBuffer);

  // PK zip header — a genuine .docx.
  if (head.startsWith('504b')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  // OLE2 compound file — the pre-2007 binary .doc. No browser-side reader
  // exists for it, so fail with something the user can act on rather than
  // letting mammoth throw about zip internals.
  if (head.startsWith('d0cf11e0')) {
    throw new Error(LEGACY_DOC_ERROR);
  }

  // Anything else is treated as Word-exported HTML, which is what job boards
  // actually hand out under a .doc name.
  return htmlToText(decodeHtml(arrayBuffer));
}
