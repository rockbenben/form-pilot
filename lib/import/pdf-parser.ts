/**
 * PDF text extraction using pdfjs-dist.
 *
 * pdfjs-dist is lazy-loaded to avoid bundling issues with the worker file in
 * the Chrome extension context.  The worker is configured to run as a URL so
 * the main bundle stays clean.
 */

interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  /** [a, b, c, d, e, f] — index 5 is the baseline Y in PDF user space. */
  transform?: number[];
}

/**
 * Rebuild visual lines from pdfjs text items.
 *
 * pdfjs hands back a flat run of positioned fragments, not lines. Joining them
 * all with a space — which this module used to do — collapsed an entire page
 * into a single enormous line, and `resume-extractor` matches line by line, so
 * everything depending on line structure (name, education entries, section
 * headings) silently extracted nothing. Only the whole-text regexes for email
 * and phone survived, which is exactly the failure real resumes exhibited: a
 * 3800-character CV importing as 3 lines with an empty name.
 *
 * Two signals mark a line end, because neither alone holds across producers:
 * the `hasEOL` flag when the producer sets it, and a shift in baseline Y for
 * the ones that never do.
 */
function itemsToLines(items: PdfTextItem[]): string[] {
  const lines: string[] = [];
  let current: string[] = [];
  let lastY: number | null = null;

  const flush = () => {
    const line = current.join(' ').replace(/\s+/g, ' ').trim();
    if (line) lines.push(line);
    current = [];
  };

  for (const item of items) {
    const y = Array.isArray(item.transform) ? item.transform[5] : null;
    // A shifted baseline means a new visual line. The tolerance keeps
    // superscripts and mixed font sizes on the line they belong to.
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) flush();

    current.push(item.str);
    if (item.hasEOL) flush();
    if (y !== null) lastY = y;
  }
  flush();

  return lines;
}

export async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  // Dynamic import keeps the worker-configuration side-effect out of the
  // module parse phase so Vite/WXT doesn't try to bundle the worker inline.
  const pdfjsLib = await import('pdfjs-dist');

  // Point the worker at the pre-built script shipped with pdfjs-dist.
  // In the extension build Vite will copy the asset; in tests we skip the
  // worker altogether by setting it to null (which triggers the legacy
  // single-threaded path).
  if (typeof window !== 'undefined') {
    const workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  } else {
    // Node / test environment — disable the worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  }

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const lines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    // pdfjs yields TextItem | TextMarkedContent; only the former carries `str`.
    const items = content.items.filter(
      (item): item is typeof item & PdfTextItem =>
        !!item && typeof item === 'object' && 'str' in item,
    );
    lines.push(...itemsToLines(items));
  }

  return lines.join('\n');
}
