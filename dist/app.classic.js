// Thai presentation glyphs used by older PDF fonts.
function normalize(s) {
  const map={'\uf700':'ั','\uf701':'ิ','\uf702':'ี','\uf703':'ึ','\uf704':'ื','\uf705':'่','\uf706':'้','\uf707':'๊','\uf708':'๋','\uf709':'์','\uf70a':'่','\uf70b':'้','\uf70c':'๊','\uf70d':'๋','\uf70e':'์','\uf70f':'ํ','\uf710':'ั','\uf711':'ิ','\uf712':'ี','\uf713':'ึ','\uf714':'ื','\uf715':'ุ','\uf716':'ู','\uf717':'ฺ','\uf718':'่','\uf719':'้','\uf71a':'๊','\uf71b':'๋','\uf71c':'์','\uf71d':'ํ'};
  return s.replace(/[\uf700-\uf71d]/g,c=>map[c]||c).replace(/\s+/g,' ').trim().normalize('NFC');
}
const moneyCents=s=>Math.round(Number(s.replace(/[^\d.]/g,''))*100);
function parseReceipt(pages,filename) {
  const all=pages.flatMap(p=>p.items).map(i=>normalize(i.str)).join('\n');
  if(!all.includes('Meta โฆษณา') || !all.includes('ใบเสร็จ')) throw new Error('รองรับใบเสร็จค่าโฆษณา Meta ตามรูปแบบตัวอย่างเท่านั้น');
  const id=all.match(/\b\d{14,22}-\d{14,22}\b/)?.[0];
  if(!id) throw new Error('ไม่พบ ID ธุรกรรม จึงยังไม่นำมารวมยอด');
  const first=pages[0].items.filter(i=>i.str.trim()).map(i=>({...i,str:normalize(i.str)}));
  const heading=first.find(i=>i.str==='แคมเปญ');
  const topAmounts=first.filter(i=>/^฿\s*[\d,]+\.\d{2}$/.test(i.str)&&(!heading||i.transform[5]>heading.transform[5]));
  topAmounts.sort((a,b)=>b.transform[5]-a.transform[5]);
  if(!topAmounts.length) throw new Error('ไม่พบยอดชำระบนใบเสร็จ');
  const total=moneyCents(topAmounts[0].str);
  const date=all.match(/(?:^|\n)(\d{1,2}\s+[ก-๙.]+\s+\d{4}\s+\d{2}:\d{2})(?:\n|$)/)?.[1]||'ไม่พบวันที่';
  const account=all.match(/ID บัญชี:\s*(\d+)/)?.[1]||'';
  const reference=all.match(/หมายเลขอ้างอิง:\s*([^\s]+)/)?.[1]||'';
  const invoice=all.match(/หมายเลขใบเรียกเก็บเงิน\s*(FBADS-[\d-]+)/)?.[1]||'';
  const note=all.match(/ใบเสร็จสำหรับ\s*([^\n]+)/)?.[1]||'';
  const card=all.match(/American Express\s*·+\s*(\d{4})/)?.[1]||'';
  const campaigns=[];
  let detailTotal=0;
  for(let pi=0;pi<pages.length;pi++) {
    const p=pages[pi];
    const items=p.items.filter(i=>i.str.trim()).map(i=>({...i,str:normalize(i.str)}));
    const periods=items.filter(i=>/^ตั้งแต่\s/.test(i.str)&&i.str.includes(' ถึง '));
    for(const period of periods) {
      const y=period.transform[5],x=period.transform[4];
      const names=items.filter(i=>i.transform[4]<p.width*.5&&Math.abs(i.transform[4]-x)<25&&i.transform[5]>y+2&&i.transform[5]<y+35&&!/^฿|^ตั้งแต่/.test(i.str));
      names.sort((a,b)=>a.transform[5]-b.transform[5]);
      const amounts=items.filter(i=>/^฿\s*[\d,]+\.\d{2}$/.test(i.str)&&i.transform[4]>p.width*.55&&i.transform[5]>y-2&&i.transform[5]<y+22);
      amounts.sort((a,b)=>Math.abs(a.transform[5]-(y+6))-Math.abs(b.transform[5]-(y+6)));
      if(!names[0]||!amounts[0]) throw new Error(`อ่านแคมเปญไม่ครบในหน้า ${pi+1} จึงยังไม่นำมารวมยอด`);
      campaigns.push({name:names[0].str,area:names[0].str.split('-')[0],amount:moneyCents(amounts[0].str),period:period.str,page:pi+1});
    }
    // Child ad costs are separate from campaign costs and never added twice.
    for(const impression of items.filter(i=>/อิมเพรสชัน/.test(i.str))) {
      const cost=items.find(i=>/^฿\s*[\d,]+\.\d{2}$/.test(i.str)&&i.transform[4]>p.width*.55&&Math.abs(i.transform[5]-impression.transform[5])<2);
      if(cost) detailTotal+=moneyCents(cost.str);
    }
  }
  if(!campaigns.length) throw new Error('ไม่พบรายการแคมเปญ ไฟล์สแกนรูปภาพยังไม่รองรับ');
  const campaignTotal=campaigns.reduce((s,c)=>s+c.amount,0);
  const warnings=[];
  if(campaignTotal!==total) warnings.push(`ยอดแคมเปญต่างจากยอดชำระ ${(campaignTotal-total)/100} บาท`);
  if(detailTotal!==campaignTotal) warnings.push('ยอดโฆษณาย่อยไม่ตรงกับยอดแคมเปญ โปรดตรวจไฟล์ต้นฉบับ');
  if(!all.includes('ชำระแล้ว')) warnings.push('ไม่พบข้อความยืนยันว่าชำระแล้ว');
  return {id,filename,total,date,account,reference,invoice,note,card,campaigns,campaignTotal,warnings};
}
function summarize(receipts) {
  const unique=[...new Map(receipts.map(r=>[r.id,r])).values()];
  const group=key=>{
    const m=new Map();
    for(const r of unique)for(const c of r.campaigns){const name=c[key];m.set(name,(m.get(name)||0)+c.amount);}
    return [...m].map(([name,amount])=>({name,amount})).sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name,'th'));
  };
  return {count:unique.length,total:unique.reduce((s,r)=>s+r.total,0),campaignTotal:unique.reduce((s,r)=>s+r.campaignTotal,0),campaigns:group('name'),areas:group('area')};
}

const pdfjs = globalThis.pdfjsLib;
import {pdfWorkerSource} from './worker-inline.mjs';
const workerUrl=URL.createObjectURL(new Blob([pdfWorkerSource],{type:'text/javascript'}));
pdfjs.GlobalWorkerOptions.workerPort=new Worker(workerUrl,{type:'module'});
const $=id=>document.getElementById(id);
const fmt=c=>new Intl.NumberFormat('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(c/100);
const receipts=[];let busy=false;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(text,type='info'){const p=document.createElement('div');p.className='message '+type;p.textContent=text;$('messages').append(p);}
function render(){
 const s=summarize(receipts);
 $('total').textContent='฿'+fmt(s.total);$('campaignTotal').textContent='฿'+fmt(s.campaignTotal);$('count').textContent=s.count;
 $('groupCount').textContent=`${s.areas.length} พื้นที่ · ${s.campaigns.length} แคมเปญ`;
 $('reconcile').textContent=!s.count?'รอใบเสร็จเพื่อเทียบยอด':s.total===s.campaignTotal?'ยอดแคมเปญตรงกับยอดชำระ':'ยอดต่างกัน ฿'+fmt(s.campaignTotal-s.total)+' · ตรวจใบเสร็จ';
 $('areasCount').textContent=`${s.areas.length} พื้นที่`;$('campaignsCount').textContent=`${s.campaigns.length} รายการ`;
 $('areas').innerHTML=s.areas.length?s.areas.map(a=>`<div class="area"><div class="area-line"><span>${esc(a.name)}</span><b>฿${fmt(a.amount)}</b></div><div class="track"><div class="bar" style="width:${s.campaignTotal?100*a.amount/s.campaignTotal:0}%"></div></div></div>`).join(''):'<div class="empty"><span>ยังไม่มีข้อมูลพื้นที่</span><p>เพิ่มใบเสร็จเพื่อดูว่าแต่ละพื้นที่ใช้ไปเท่าไร</p></div>';
 $('campaigns').innerHTML=s.campaigns.length?s.campaigns.map(c=>`<tr><td>${esc(c.name)}</td><td class="number">${fmt(c.amount)}</td></tr>`).join(''):'<tr><td colspan="2" class="empty">ยังไม่มีรายการแคมเปญ</td></tr>';
 const owner=$('owner').value.trim(),bank=$('bank').value.trim(),defaultNote=$('defaultNote').value.trim();
 $('claimRows').innerHTML=receipts.length?receipts.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(owner||'—')}</td><td>${esc(bank||'—')}</td><td>${esc(r.card||'—')}</td><td>${esc(r.reference||'—')}</td><td>${esc(r.invoice||'—')}</td><td class="number">${fmt(r.total)}</td><td>${esc(r.date.replace(/\s+\d{2}:\d{2}$/,''))}</td><td>${esc(defaultNote||r.note||'—')}</td></tr>`).join(''):'<tr><td colspan="9" class="empty">เพิ่มใบเสร็จเพื่อสร้างตารางเบิกจ่าย</td></tr>';
 $('claimTotal').textContent=fmt(s.total);
 $('claimTitle').textContent=receipts.length?`รายการค่า Ads Facebook · ${receipts[0].date.replace(/\s+\d{2}:\d{2}$/,'')}`:'รายการค่า Ads Facebook';
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
