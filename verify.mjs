import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseReceipt,summarize} from './dist/parser.mjs';
globalThis.DOMMatrix=class{};
const pdfjs=await import('./dist/vendor/pdf.mjs');
const receipts=[];
for(const filename of fs.readdirSync('..').filter(n=>n.endsWith('.pdf'))){
 const task=pdfjs.getDocument({data:new Uint8Array(fs.readFileSync('../'+filename)),useSystemFonts:true,isEvalSupported:false});
 const doc=await task.promise;const pages=[];
 for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i);pages.push({width:p.getViewport({scale:1}).width,items:(await p.getTextContent()).items});}
 const receipt=parseReceipt(pages,filename);receipts.push(receipt);
 assert.equal(receipt.total,3000000);assert.equal(receipt.campaignTotal,3000000);assert.deepEqual(receipt.warnings,[]);
 console.log(JSON.stringify({id:receipt.id,date:receipt.date,rows:receipt.campaigns.length,total:receipt.total,campaignTotal:receipt.campaignTotal,warnings:receipt.warnings}));
 await task.destroy();
}
const s=summarize(receipts);assert.equal(s.total,6000000);assert.equal(s.campaignTotal,6000000);
assert.equal(summarize([...receipts,receipts[0]]).total,6000000);
assert.throws(()=>parseReceipt([{width:100,items:[{str:'invalid'}]}],'bad.pdf'));
assert.throws(()=>parseReceipt([{width:100,items:[{str:'ใบเสร็จ Meta โฆษณา'}]}],'bad.pdf'));
console.log(JSON.stringify(s,null,2));
