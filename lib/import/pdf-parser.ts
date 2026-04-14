/**
 * PDF text extraction using pdfjs-dist.
 *
 * pdfjs-dist is lazy-loaded to avoid bundling issues with the worker file in
 * the Chrome extension context.  The worker is configured to run as a URL so
 * the main bundle stays clean.
 */

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

  const textParts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item): item is { str: string } => 'str' in item)
      .map((item) => item.str)
      .join(' ');
    textParts.push(pageText);
  }

  return textParts.join('\n');
}
