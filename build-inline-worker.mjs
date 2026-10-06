import fs from 'node:fs';
import path from 'node:path';

const worker = fs.readFileSync(path.join('dist', 'vendor', 'pdf.worker.mjs'));
const encoded = worker.toString('base64');
const output = [
  '// Generated from pdf.worker.mjs so file:// launches can create a Blob worker.',
  `const encoded = '${encoded}';`,
  'export const pdfWorkerSource = new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)));',
  '',
].join('\n');
fs.writeFileSync(path.join('dist', 'worker-inline.mjs'), output);

const pdfClassic = fs.readFileSync(path.join('dist', 'vendor', 'pdf.mjs'), 'utf8')
  .replace(/\nexport \{[^]*?\};\r?\n\r?\n\/\/# sourceMappingURL=[^\n]*\r?\n?$/, '\n')
  .replaceAll('import.meta.url', 'location.href');
fs.writeFileSync(path.join('dist', 'vendor', 'pdf.classic.js'), pdfClassic);

const workerClassic = worker.toString('utf8')
  .replace(/\nexport \{ WorkerMessageHandler \};\r?\n\r?\n\/\/# sourceMappingURL=[^\n]*\r?\n?$/, '\n')
  .replaceAll('import.meta.url', 'location.href');
fs.writeFileSync(path.join('dist', 'vendor', 'pdf.worker.classic.js'), `(function () {\n${workerClassic}\n})();\n`);

const parser = fs.readFileSync(path.join('dist', 'parser.mjs'), 'utf8').replaceAll('export ', '');
const app = fs.readFileSync(path.join('dist', 'app.mjs'), 'utf8')
  .replace("import * as pdfjs from './vendor/pdf.mjs';", 'const pdfjs = globalThis.pdfjsLib;')
  .replace("import {parseReceipt,summarize} from './parser.mjs';\n", '')
  .replace(/const pdfWorkerDataUrl=[^\n]*\n\s*pdfjs\.GlobalWorkerOptions\.workerSrc=pdfWorkerDataUrl;\n/, '');
fs.writeFileSync(path.join('dist', 'app.classic.js'), `${parser}\n${app}`);
