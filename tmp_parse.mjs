import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mod = require('pdf-parse');
const pdfParse = mod.default ?? mod;
const buf = readFileSync('/tmp/trump_latest.pdf');
pdfParse(buf).then(data => {
  console.log('Pages:', data.numpages);
  console.log(data.text.slice(0, 5000));
}).catch(e => console.error(e.message));
