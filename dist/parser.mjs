// Thai presentation glyphs used by older PDF fonts.
export function normalize(s) {
  const map={'\uf700':'ั','\uf701':'ิ','\uf702':'ี','\uf703':'ึ','\uf704':'ื','\uf705':'่','\uf706':'้','\uf707':'๊','\uf708':'๋','\uf709':'์','\uf70a':'่','\uf70b':'้','\uf70c':'๊','\uf70d':'๋','\uf70e':'์','\uf70f':'ํ','\uf710':'ั','\uf711':'ิ','\uf712':'ี','\uf713':'ึ','\uf714':'ื','\uf715':'ุ','\uf716':'ู','\uf717':'ฺ','\uf718':'่','\uf719':'้','\uf71a':'๊','\uf71b':'๋','\uf71c':'์','\uf71d':'ํ'};
  return s.replace(/[\uf700-\uf71d]/g,c=>map[c]||c).replace(/\s+/g,' ').trim().normalize('NFC');
}
export const moneyCents=s=>Math.round(Number(s.replace(/[^\d.]/g,''))*100);
export function parseReceipt(pages,filename) {
  const all=pages.flatMap(p=>p.items).map(i=>normalize(i.str)).join('\n');
  if(all.includes('Google Ads')) return parseGoogle(pages,all,filename);
  if(!all.includes('Meta โฆษณา') || !all.includes('ใบเสร็จ')) throw new Error('รองรับใบเสร็จ Meta และ Statement ของ Google Ads ตามรูปแบบตัวอย่างเท่านั้น');
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
  return {type:'meta',group:note,filename,id,total,date,account,reference,invoice,note,card,bank:'American Express',campaigns,campaignTotal,warnings};
}
function parseGoogle(pages,all,filename){
  const account=all.match(/บัญชี:\s*([^\n]+)/)?.[1]||'Google Ads';
  const period=all.match(/(\d{1,2}\s+[ก-๙.]+\s+\d{4}\s*-\s*\d{1,2}\s+[ก-๙.]+\s+\d{4})/)?.[1]||'';
  const year=all.match(/\b25\d{2}\b/)?.[0]||'';
  const rows=[];
  for(const page of pages){const items=page.items.map(i=>({...i,str:normalize(i.str)}));for(const ref of items){const found=ref.str.match(/(\d{4})\s+(A\d{14,20})/);if(!found)continue;const same=items.filter(i=>Math.abs(i.transform[5]-ref.transform[5])<3);const amount=same.find(i=>/-?[\d,]+\.\d{2}$/.test(i.str)&&i.transform[4]>ref.transform[4]);const dateText=same.filter(i=>i.transform[4]<90).sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join('');const dateMatch=dateText.match(/(\d{1,2})\s*([ก-๙.]+)/);const date=dateMatch?`${dateMatch[1]} ${dateMatch[2]}${year?` ${year}`:''}`:'';if(amount)rows.push({date,card:found[1],reference:found[2],amount:Math.abs(moneyCents(amount.str))});}}
  if(!rows.length)throw new Error('ไม่พบรายการชำระเงินใน Statement ของ Google Ads');
  const total=rows.reduce((sum,row)=>sum+row.amount,0);
  return {type:'google',group:'Google Ads',id:`google:${account}:${period}:${filename}`,filename,total,date:period,account,reference:'',invoice:'',note:'Google Ads',card:rows[0].card,bank:'American Express',payments:rows,campaigns:[{name:'Google Ads',area:'Google Ads',amount:total,period}],campaignTotal:total,warnings:[]};
}
export function summarize(receipts) {
  const unique=[...new Map(receipts.map(r=>[r.id,r])).values()];
  const group=key=>{
    const m=new Map();
    for(const r of unique)for(const c of r.campaigns){const name=c[key];m.set(name,(m.get(name)||0)+c.amount);}
    return [...m].map(([name,amount])=>({name,amount})).sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name,'th'));
  };
  return {count:unique.length,total:unique.reduce((s,r)=>s+r.total,0),campaignTotal:unique.reduce((s,r)=>s+r.campaignTotal,0),campaigns:group('name'),areas:group('area')};
}
