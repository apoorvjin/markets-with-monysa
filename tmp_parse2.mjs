import { readFileSync } from 'fs';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const buf = readFileSync('/tmp/trump_latest.pdf');
const uint8 = new Uint8Array(buf);

const doc = await getDocument({ data: uint8 }).promise;
console.log('Pages:', doc.numPages);

let fullText = '';
for (let p = 1; p <= Math.min(doc.numPages, 20); p++) {
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  const lines = content.items.map(i => i.str).join(' ');
  fullText += `\n--- PAGE ${p} ---\n` + lines;
}
console.log(fullText.slice(0, 6000));
