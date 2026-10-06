import fs from 'node:fs';
import {parseReceipt} from './dist/parser.mjs';
globalThis.DOMMatrix=class{};
const pdfjs=await import('./dist/vendor/pdf.mjs');
const filename='C:/Users/Acer/Downloads/Google Ads.pdf';
const task=pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(filename)),useSystemFonts:true});
const doc=await task.promise;
const pages=[];
for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);pages.push({width:page.getViewport({scale:1}).width,items:(await page.getTextContent()).items});}
for(const [pageNumber,page] of pages.entries()){const refs=page.items.filter(i=>/A|[0-9]{6}/.test(i.str));console.log(JSON.stringify({page:pageNumber+1,refs:refs.slice(-90).map(ref=>({ref:ref.str,x:ref.transform[4],y:ref.transform[5]}))},null,2));}
const receipt=parseReceipt(pages,'Google Ads.pdf');
console.log(JSON.stringify({type:receipt.type,group:receipt.group,payments:receipt.payments.length,total:receipt.total,first:receipt.payments[0]},null,2));
if(receipt.type!=='google'||receipt.payments.length!==11||receipt.total!==21877951)process.exitCode=1;
await task.destroy();
