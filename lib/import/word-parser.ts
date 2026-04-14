/**
 * Word (.docx) text extraction using mammoth.
 */

export async function extractTextFromWord(arrayBuffer: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}
