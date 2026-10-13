// ===== LƯU LỊCH SỬ DÀI HẠN =====
// Cứ mỗi giờ chốt một bản ghi, gộp lại thành ngày. Nhờ đó mới trả lời được những câu
// mà màn hình thời gian thực không trả lời nổi: tháng này so với tháng trước thế nào,
// sửa xong phiếu thì có hết lãng phí thật không, thiết bị nào lặp lỗi mãi không dứt.
window.HIST = (function(){

const KEY = 'bms.hist', MAX_DAYS = 400;
let days = [];                // [{d:'YYYY-MM-DD', kwh, base, offKwh, alarms, p1, acks, fdd, fddVnd, health, woOpen, woDone, offPts, hours}]
let curH = null, acc = null;
const api = () => (window.SITE && SITE.cfg.storage.api) ? SITE.cfg.storage.api.replace(/\/$/,'') : '';
const ymd = dt => dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');

function blank(d){ return {d, kwh:0, base:0, offKwh:0, alarms:0, p1:0, acks:0, fdd:0, fddVnd:0,
  health:100, woOpen:0, woDone:0, offPts:0, hours:0}; }

async function load(){
  try { const l=localStorage.getItem(KEY); if(l) days=JSON.parse(l); } catch(e){}
  if (api()){
    try { const r=await fetch(api()+'/history?days='+MAX_DAYS, {cache:'no-store'});
          if (r.ok){ const s=await r.json(); if (s.length) days=s; } } catch(e){}
  }
  if (!days.length) seed();
  return days;
}
function persist(){
  days = days.slice(-MAX_DAYS);
  try { localStorage.setItem(KEY, JSON.stringify(days)); } catch(e){}
}

// Chốt sổ mỗi khi sang giờ mới. Gọi từ vòng cập nhật của app.
function tick(ctx){
  const now=new Date(), h=now.getHours(), d=ymd(now);
  if (curH===null){ curH=h; acc=blank(d); }
  if (h!==curH){ flush(); curH=h; acc=blank(d); }
  if (acc.d!==d){ flush(); acc=blank(d); }
  const s=ctx(); if(!s) return;
  acc.hours++;
  acc.kwh   += s.kw/ (3600/1.5) * 1;          // mỗi mẫu cách nhau 1,5 giây
  acc.base  += s.base/(3600/1.5);
  if (!s.open) acc.offKwh += s.kw/(3600/1.5);
  acc.alarms = Math.max(acc.alarms, s.alarms);
  acc.p1     = Math.max(acc.p1, s.p1);
  acc.fdd    = Math.max(acc.fdd, s.fdd);
  acc.fddVnd = Math.max(acc.fddVnd, s.fddVnd);
  acc.health = Math.min(acc.health, s.health);
  acc.offPts = Math.max(acc.offPts, s.offPts);
  acc.woOpen = s.woOpen; acc.woDone = s.woDone;
  acc.acks   = s.acks;
  const row = days.find(x=>x.d===acc.d);
  if (row){ Object.assign(row, acc); delete row.demo; } else days.push({...acc});
}
function flush(){
  if (!acc || !acc.hours) return;
  const row = days.find(x=>x.d===acc.d);
  if (row){ Object.assign(row, acc); delete row.demo; } else days.push({...acc});
  persist();
  if (api()) fetch(api()+'/history', {method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify(row||acc)}).catch(()=>{});
}

// ---------- đọc lại ----------
const last = n => days.slice(-n);
function sum(rows, k){ return rows.reduce((s,x)=>s+(x[k]||0),0); }
function avg(rows, k){ return rows.length? sum(rows,k)/rows.length : 0; }

// so sánh 30 ngày gần nhất với 30 ngày trước đó
function compare(n=30){
  const a = days.slice(-n), b = days.slice(-2*n, -n);
  if (!a.length) return null;
  const pc = (x,y)=> y? (x-y)/y*100 : 0;
  return {
    n: a.length, prevN: b.length,
    kwh: sum(a,'kwh'), kwhPrev: sum(b,'kwh'), kwhPc: pc(sum(a,'kwh'), sum(b,'kwh')),
    excess: sum(a,'kwh')-sum(a,'base'), excessPrev: sum(b,'kwh')-sum(b,'base'),
    offShare: sum(a,'kwh')? sum(a,'offKwh')/sum(a,'kwh')*100 : 0,
    offSharePrev: sum(b,'kwh')? sum(b,'offKwh')/sum(b,'kwh')*100 : 0,
    alarms: sum(a,'alarms'), alarmsPrev: sum(b,'alarms'), alarmsPc: pc(sum(a,'alarms'), sum(b,'alarms')),
    health: avg(a,'health'), healthPrev: avg(b,'health'),
    woDone: sum(a,'woDone'), woDonePrev: sum(b,'woDone'),
    fddVnd: avg(a,'fddVnd'), fddVndPrev: avg(b,'fddVnd'),
  };
}

// biểu đồ cột theo ngày, có đường chuẩn chồng lên
const fmt = v => v>=1000 ? (v/1000).toFixed(1).replace('.0','')+'k' : String(Math.round(v));
function chart(key, n=30, baseKey){
  const rows = last(n); if (!rows.length) return '';
  const W=320, H=84, PL=28, PB=12, pw=W-PL-4, ph=H-PB-8;
  const max = Math.max(...rows.map(r=>Math.max(r[key]||0, baseKey?(r[baseKey]||0):0)))*1.1 || 1;
  const bw = pw/rows.length, y = v => 8+ph-(v/max)*ph;
  const bars = rows.map((r,i)=>{
    const over = baseKey && r[key] > r[baseKey]*1.05;
    return `<rect x="${(PL+i*bw+0.6).toFixed(1)}" y="${y(r[key]).toFixed(1)}" width="${Math.max(1.2,bw-1.2).toFixed(1)}"
      height="${Math.max(0,8+ph-y(r[key])).toFixed(1)}" rx="1" fill="${over?'#F5B23C':'#27C8D6'}" opacity=".92"/>`;
  }).join('');
  const line = baseKey ? `<polyline points="${rows.map((r,i)=>`${(PL+i*bw+bw/2).toFixed(1)},${y(r[baseKey]).toFixed(1)}`).join(' ')}"
      fill="none" stroke="#E8ECF3" stroke-width="1.4" stroke-dasharray="3 2.5"/>` : '';
  const gl = [0,1].map(f=>`<line x1="${PL}" x2="${W-4}" y1="${(8+ph-f*ph).toFixed(1)}" y2="${(8+ph-f*ph).toFixed(1)}" stroke="#232C3B"/>
    <text x="${PL-4}" y="${(12+ph-f*ph).toFixed(1)}" class="eg">${fmt(max*f)}</text>`).join('');
  const lb = [0, Math.floor(rows.length/2), rows.length-1].map(i=>
    `<text x="${(PL+i*bw+bw/2).toFixed(1)}" y="${H-2}" class="ex">${rows[i].d.slice(5).replace('-','/')}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="echart">${gl}${bars}${line}${lb}</svg>`;
}

// thiết bị lặp lỗi nhiều lần trong khoảng — thứ chỉ nhìn ra được khi có lịch sử
const repeats = [];      // {tag, floor, msg, n, lastAt}
function noteAlarm(a){
  const k = a.dev.tag+'|'+a.cond;
  let r = repeats.find(x=>x.k===k);
  if (!r){ repeats.push(r={k, tag:a.dev.tag, floor:a.dev.floor, msg:a.msg, n:0, lastAt:0, devId:a.dev.id}); }
  r.n++; r.lastAt=Date.now(); r.msg=a.msg;
}
const topRepeats = n => repeats.filter(r=>r.n>1).sort((a,b)=>b.n-a.n).slice(0, n||6);

// ---------- dữ liệu mô phỏng cho bản trình diễn ----------
// Toà nhà thật thì bảng này do chính phần mềm ghi ra mỗi ngày. Ở đây dựng 90 ngày
// để các màn so sánh có cái mà so. Giao diện nói rõ đây là số mô phỏng.
function seed(){
  const today=new Date(); days=[];
  for (let i=89; i>=0; i--){
    const dt=new Date(today); dt.setDate(dt.getDate()-i);
    const dow=dt.getDay(), work = dow!==0;
    // phần vượt chuẩn giảm dần từ 22% xuống 9% sau khi làm chẩn đoán và sửa phiếu
    const prog = 1 - (89-i)/89;
    const over = work ? 0.02 + 0.17*prog + (Math.random()*0.05-0.025) : 0.03;
    const base = work ? 1480 + Math.random()*150 : 520 + Math.random()*60;
    const kwh  = base*(1+over);
    days.push({ d: ymd(dt), kwh:+kwh.toFixed(0), base:+base.toFixed(0),
      offKwh:+(kwh*(work?0.17+0.05*prog:0.86)).toFixed(0),
      alarms: Math.round((work?9:4) + prog*7 + Math.random()*4),
      p1: Math.random()<(0.1+prog*0.2)?1:0,
      acks: Math.round((work?8:3)+Math.random()*4),
      fdd: Math.round(5 + prog*7 + Math.random()*3),
      fddVnd: Math.round((900000 + prog*1600000)*(0.85+Math.random()*0.3)),
      health: Math.round(74 + (1-prog)*14 + Math.random()*6),
      woOpen: Math.round(1+Math.random()*4), woDone: work? Math.round(Math.random()*3):0,
      offPts: Math.random()<0.3?Math.round(1+Math.random()*3):0, hours:24, demo:1 });
  }
  persist();
}

return { load, tick, flush, last, compare, chart, noteAlarm, topRepeats, seed,
  get days(){ return days; }, get seeded(){ return days.some(r=>r.demo); }, ymd };
})();
