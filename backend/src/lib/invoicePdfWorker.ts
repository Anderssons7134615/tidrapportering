import { parentPort, workerData } from 'node:worker_threads';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// No URLs, OCR, rendering or document scripts are used by this worker.
globalThis.fetch = async () => { throw new Error('External resources are disabled'); };
const task = getDocument({ data: new Uint8Array(workerData.bytes), useWorkerFetch: false, useSystemFonts: false, disableFontFace: true, useWasm: false, enableXfa: false, verbosity: 0 });
try {
  const pdf = await task.promise;
  if (pdf.numPages > 25) throw new Error('PAGE_LIMIT');
  let text = '';
  for (let index = 1; index <= pdf.numPages; index++) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ');
      if (text.length > 200_000) throw new Error('TEXT_LIMIT');
    }
    // Preserve physical page boundaries for order source references.
    text += '\n\f';
    page.cleanup();
  }
  parentPort!.postMessage({ text, pages: pdf.numPages });
} catch (error) {
  const message = error instanceof Error ? error.message : '';
  parentPort!.postMessage({ error: message === 'PAGE_LIMIT' || message === 'TEXT_LIMIT' ? message : 'PDF_UNREADABLE' });
} finally {
  await task.destroy();
}
