// ===== NĂNG LƯỢNG CÓ ĐƯỜNG CHUẨN =====
// Một con số kWh đứng một mình không nói lên điều gì. Phải so với mức đáng lẽ phải dùng
// ở nhiệt độ ngoài trời và số người đó, rồi tách riêng phần điện tiêu ngoài giờ.
window.EN = (function(){

const GIA = 3200;                                  // đồng/kWh
const BASE_DAY = 44, BASE_NIGHT = 20;              // phụ tải nền: thang máy, bơm, chiếu sáng công cộng
const KW_PER_DEG = 9.5;                            // mỗi độ ngoài trời trên 26°C
const KW_PER_OCC = 0.62;                           // mỗi phần trăm lấp đầy

// Đà Nẵng: nhiệt độ ngoài trời theo giờ, đáy lúc 5h, đỉnh lúc 14h
const oatAt = h => 27.5 + 5.2*Math.sin((h-9.5)/24*2*Math.PI);
// tỉ lệ lấp đầy theo giờ làm việc, trưa hụt xuống
function occAt(h, open){
  if (!open) return 4;
  if (h<7||h>=18) return 6;
  const core = h>=8 && h<17 ? 82 : 45;
  return h===12 ? core*0.55 : core;
}
// mức điện đáng lẽ phải dùng
function baseline(h, open){
  const oat=oatAt(h), occ=occAt(h,open);
  return (open?BASE_DAY:BASE_NIGHT) + Math.max(0, oat-26)*KW_PER_DEG*(occ/100*0.8+0.2)*(open?1:.25) + occ*KW_PER_OCC;
}

const day = [];        // 24 điểm giờ: {h, kw, base, open}
let acc = {kw:0, n:0}, curH = null;

// dựng sẵn lịch sử từ đầu ngày tới giờ để biểu đồ không trống khi vừa mở
function seed(schedOpenAt){
  const now=new Date(), H=now.getHours();
  day.length=0;
  for (let h=0; h<=H; h++){
    const open = schedOpenAt(h);
    const b = baseline(h, open);
    // thực tế lệch quanh chuẩn, ban đêm lệch dương vì có thiết bị quên tắt
    const dev = open ? (Math.random()*0.16-0.06) : (Math.random()*0.26+0.06);
    day.push({h, base:+b.toFixed(1), kw:+(b*(1+dev)).toFixed(1), open});
  }
  curH = H;
}

function sample(kwNow, open){
  const now=new Date(), h=now.getHours();
  if (curH==null) return;
  if (h!==curH){ curH=h; acc={kw:0,n:0};
    if (!day.find(x=>x.h===h)) day.push({h, base:+baseline(h,open).toFixed(1), kw:kwNow, open}); }
  acc.kw+=kwNow; acc.n++;
  const row=day.find(x=>x.h===h);
  if (row){ row.kw=+(acc.kw/acc.n).toFixed(1); row.base=+baseline(h,open).toFixed(1); row.open=open; }
}

function stats(){
  if (!day.length) return null;
  const kwh  = day.reduce((s,x)=>s+x.kw,0);
  const kwhB = day.reduce((s,x)=>s+x.base,0);
  const off  = day.filter(x=>!x.open).reduce((s,x)=>s+x.kw,0);
  const cur  = day[day.length-1];
  return {
    day, cur, kwh:Math.round(kwh), base:Math.round(kwhB),
    delta: kwhB? (kwh-kwhB)/kwhB*100 : 0,
    deltaNow: cur.base? (cur.kw-cur.base)/cur.base*100 : 0,
    offShare: kwh? off/kwh*100 : 0, offKwh:Math.round(off),
    excess: Math.round(kwh-kwhB), excessVnd: Math.round((kwh-kwhB)*GIA),
    oat:+oatAt(new Date().getHours()).toFixed(1), occ:Math.round(occAt(new Date().getHours(), cur.open)),
    monthVnd: Math.round((kwh-kwhB)*GIA*26) };
}

// biểu đồ 24 giờ: cột là điện thực tế, đường là mức chuẩn
function chartSVG(){
  const s=stats(); if(!s) return '';
  const W=320, H=96, PL=26, PB=14, pw=W-PL-4, ph=H-PB-8;
  const max=Math.max(...s.day.map(x=>Math.max(x.kw,x.base)))*1.12 || 1;
  const bw=pw/24;
  const y=v=>8+ph-(v/max)*ph;
  const bars=s.day.map(x=>{
    const over=x.kw>x.base*1.07;
    return `<rect x="${(PL+x.h*bw+1).toFixed(1)}" y="${y(x.kw).toFixed(1)}" width="${(bw-2).toFixed(1)}"
      height="${(8+ph-y(x.kw)).toFixed(1)}" rx="1.5" fill="${x.open?(over?'#F5B23C':'#27C8D6'):'#FF5A5A'}" opacity="${x.open?.92:.85}"/>`;
  }).join('');
  const lp=s.day.map(x=>`${(PL+x.h*bw+bw/2).toFixed(1)},${y(x.base).toFixed(1)}`).join(' ');
  const gl=[0,.5,1].map(f=>`<line x1="${PL}" x2="${W-4}" y1="${(8+ph-f*ph).toFixed(1)}" y2="${(8+ph-f*ph).toFixed(1)}" stroke="#232C3B"/>
     <text x="${PL-4}" y="${(12+ph-f*ph).toFixed(1)}" class="eg">${Math.round(max*f)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="echart">${gl}${bars}
    <polyline points="${lp}" fill="none" stroke="#E8ECF3" stroke-width="1.6" stroke-dasharray="3 2.5"/>
    ${[0,6,12,18].map(h=>`<text x="${(PL+h*bw+bw/2).toFixed(1)}" y="${H-3}" class="ex">${h}h</text>`).join('')}
  </svg>`;
}

return { seed, sample, stats, chartSVG, baseline, oatAt, occAt, GIA };
})();
