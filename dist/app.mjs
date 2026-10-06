import * as pdfjs from './vendor/pdf.mjs';
import {parseReceipt,summarize} from './parser.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
const $=id=>document.getElementById(id);
const fmt=c=>new Intl.NumberFormat('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(c/100);
const receipts=[];let busy=false;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function claimMonthTitle(receipt){const m=(receipt?.date||'').match(/\d{1,2}\s+([ก-๙.]+)\s+(\d{4})/);return m?`รายการค่า Ads Facebook เดือน ${m[1]} ${m[2]}`:'รายการค่า Ads Facebook';}
function message(text,type='info'){const p=document.createElement('div');p.className='message '+type;p.textContent=text;$('messages').append(p);}
function claimRows(){const order=['PS Used Car2','PS Used Car1','Google Ads'];return receipts.flatMap(r=>r.type==='google'?(r.payments||[]).map(p=>({...p,group:'Google Ads',invoice:'',note:'Google Ads',bank:r.bank})):[{...r,group:r.group||r.note}]).sort((a,b)=>{const ai=order.indexOf(a.group),bi=order.indexOf(b.group);return (ai<0?99:ai)-(bi<0?99:bi);});}
function renderClaimRows(entries,owner,bank,defaultNote){
 if(!entries.length)return '<tr><td colspan="9" class="empty">เพิ่มใบเสร็จเพื่อสร้างตารางเบิกจ่าย</td></tr>';
 let html='',active='',number=0,subtotal=0,metaSubtotal=0;
 const flush=()=>{if(active)html+=`<tr class="subtotal-row"><td colspan="6">รวม ${esc(active)}</td><td class="number">${fmt(subtotal)}</td><td colspan="2"></td></tr>`;};
 for(const r of entries){
  const amount=r.amount??r.total;
  if(r.group!==active){flush();active=r.group;number=0;subtotal=0;html+=`<tr class="group-row"><td colspan="9">${esc(active)}</td></tr>`;}
  number++;subtotal+=amount;if(r.group!=='Google Ads')metaSubtotal+=amount;
  const first=number===1;
  html+=`<tr><td>${number}</td><td>${first?esc(owner||'—'):''}</td><td>${first?esc(bank||r.bank||'—'):''}</td><td>${first?esc(r.card||'—'):''}</td><td>${esc(r.reference||'—')}</td><td>${esc(r.invoice||'—')}</td><td class="number">${fmt(amount)}</td><td>${esc((r.date||'').replace(/\s+\d{2}:\d{2}$/,''))}</td><td>${esc(defaultNote||r.note||r.group)}</td></tr>`;
 }
 flush();
 if(metaSubtotal)html+=`<tr class="meta-total-row"><td colspan="6">รวมค่าโฆษณา Meta</td><td class="number">${fmt(metaSubtotal)}</td><td colspan="2"></td></tr>`;
 return html;
}
function render(){
 const s=summarize(receipts);
 $('total').textContent='฿'+fmt(s.total);$('campaignTotal').textContent='฿'+fmt(s.campaignTotal);$('count').textContent=s.count;
 $('groupCount').textContent=`${s.areas.length} พื้นที่ · ${s.campaigns.length} แคมเปญ`;
 $('reconcile').textContent=!s.count?'รอใบเสร็จเพื่อเทียบยอด':s.total===s.campaignTotal?'ยอดแคมเปญตรงกับยอดชำระ':'ยอดต่างกัน ฿'+fmt(s.campaignTotal-s.total)+' · ตรวจใบเสร็จ';
 $('areasCount').textContent=`${s.areas.length} พื้นที่`;$('campaignsCount').textContent=`${s.campaigns.length} รายการ`;
 $('areas').innerHTML=s.areas.length?s.areas.map(a=>`<div class="area"><div class="area-line"><span>${esc(a.name)}</span><b>฿${fmt(a.amount)}</b></div><div class="track"><div class="bar" style="width:${s.campaignTotal?100*a.amount/s.campaignTotal:0}%"></div></div></div>`).join(''):'<div class="empty"><span>ยังไม่มีข้อมูลพื้นที่</span><p>เพิ่มใบเสร็จเพื่อดูว่าแต่ละพื้นที่ใช้ไปเท่าไร</p></div>';
 $('campaigns').innerHTML=s.campaigns.length?s.campaigns.map(c=>`<tr><td>${esc(c.name)}</td><td class="number">${fmt(c.amount)}</td></tr>`).join(''):'<tr><td colspan="2" class="empty">ยังไม่มีรายการแคมเปญ</td></tr>';
 const owner=$('owner').value.trim(),bank=$('bank').value.trim(),defaultNote=$('defaultNote').value.trim(),entries=claimRows();
 $('claimRows').innerHTML=renderClaimRows(entries,owner,bank,defaultNote);
 $('claimTotal').textContent=fmt(s.total);
 $('claimTitle').textContent=claimMonthTitle(receipts[0]);
 $('receipts').innerHTML=receipts.length?receipts.map(r=>`<div class="receipt"><div><div class="receipt-name">${esc(r.filename)}</div><div class="receipt-meta">${esc(r.date)} · บัญชี ${esc(r.account)}<br>ID ${esc(r.id)}<br>${esc([...new Set(r.campaigns.map(c=>c.period))].join(' · '))}</div>${r.warnings.map(w=>`<div class="warning">${esc(w)}</div>`).join('')}</div><div class="receipt-amount">฿${fmt(r.total)}</div><button class="remove" data-id="${esc(r.id)}" aria-label="ลบ ${esc(r.filename)}">ลบไฟล์</button></div>`).join(''):'<p class="empty">ใบเสร็จที่อ่านสำเร็จจะแสดงที่นี่</p>';
}
async function addFiles(files){
 if(busy)return;
 busy=true;document.body.classList.add('busy');$('files').disabled=true;$('messages').replaceChildren();
 let added=0,duplicates=0;
 try{for(const file of files){
  if(!/\.pdf$/i.test(file.name)){message(`${file.name}: กรุณาเลือกไฟล์ PDF`,'error');continue;}
  if(file.size>30*1024*1024){message(`${file.name}: ไฟล์ใหญ่เกิน 30 MB`,'error');continue;}
  const progress=document.createElement('div');progress.className='message';progress.textContent='กำลังอ่าน '+file.name;$('messages').append(progress);
  let task;
  try{
   task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true,isEvalSupported:false});
   const doc=await task.promise;
   const pages=[];
   for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);const content=await page.getTextContent();pages.push({width:page.getViewport({scale:1}).width,items:content.items});}
   const r=parseReceipt(pages,file.name);
   const existing=receipts.find(o=>o.id===r.id);
   if(existing){duplicates++;if(existing.total!==r.total||existing.campaignTotal!==r.campaignTotal)message(`${file.name}: ID ซ้ำแต่ยอดไม่ตรงกับไฟล์เดิม กรุณาตรวจต้นฉบับ ไฟล์นี้ยังไม่รวมในยอด`,'warn');}
   else{receipts.push(r);added++;render();}
  }catch(e){message(`${file.name}: ${e.name==='PasswordException'?'ไฟล์มีรหัสผ่าน กรุณาใช้ไฟล์ที่ปลดรหัสแล้ว':e.message||'อ่านไฟล์ไม่สำเร็จ'}`,'error');}
  finally{progress.remove();if(task)await task.destroy().catch(()=>{});}
 }
 if(added)message(`เพิ่ม ${added} ใบเสร็จแล้ว`,'success');
 if(duplicates)message(`ข้าม ${duplicates} ไฟล์ที่มี ID ธุรกรรมซ้ำ ยอดรวมไม่ถูกนับเพิ่ม`,'warn');
 if(receipts.length>1)message('ช่วงโฆษณาอาจทับกัน ยอดนี้รวมตาม ID ใบเสร็จแต่ละใบ ไม่ใช่รายงานการใช้จ่ายรายวัน');
 }finally{busy=false;document.body.classList.remove('busy');$('files').disabled=false;$('files').value='';}
}
$('files').addEventListener('change',e=>addFiles([...e.target.files]));
for(const type of ['dragenter','dragover'])$('drop').addEventListener(type,e=>{e.preventDefault();$('drop').classList.add('drag');});
for(const type of ['dragleave','drop'])$('drop').addEventListener(type,e=>{e.preventDefault();$('drop').classList.remove('drag');});
$('drop').addEventListener('drop',e=>addFiles([...e.dataTransfer.files]));
document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>e.preventDefault());
$('receipts').addEventListener('click',e=>{const b=e.target.closest('button[data-id]');if(!b||busy)return;const index=receipts.findIndex(r=>r.id===b.dataset.id);if(index>=0){receipts.splice(index,1);$('messages').replaceChildren();render();}});
for(const id of ['owner','bank','defaultNote'])$(id).addEventListener('input',render);
$('print').addEventListener('click',()=>window.print());
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_receipt_summary',title:'อ่านสรุปยอดใบเสร็จ',description:'Read totals grouped by campaign and area from receipts currently imported on this page.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('Expected an empty object');return {currency:'THB',unit:'satang',...summarize(receipts)};}})).catch(()=>{});}catch{}}
render();
