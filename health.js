// ===== SỨC KHOẺ HỆ THỐNG =====
// Không nói về toà nhà nóng hay lạnh, mà nói về chính hệ BMS: điểm nào không về,
// điểm nào về nhưng số liệu chết, cảm biến không dây nào sắp hết pin.
window.HLT = (function(){

const STALE_N = 12;              // số lần đọc liên tiếp không đổi thì coi là số liệu chết
const hist = new Map();          // id -> {last, same, since}
let lastScan = null;

// Chỉ xét những điểm đáng lẽ phải nhúc nhích. Quạt đang dừng thì 0 Pa là đúng, không phải chết.
function moving(d){
  if (['TS','CV','DDC','PANEL'].includes(d.t)) return true;
  if (['SPF','SEF','MAF','EF'].includes(d.t)) return !!d.st.run;
  return false;
}
function observe(devices, mainVal){
  const now=Date.now();
  devices.forEach(d=>{
    if (d.offline || !moving(d)) { hist.delete(d.id); return; }
    const v = mainVal(d); if (v==null) return;
    const k = +v.toFixed(2);
    let h = hist.get(d.id); if(!h){ hist.set(d.id, {last:k, same:0, since:now}); return; }
    if (h.last===k){ h.same++; } else { h.last=k; h.same=0; h.since=now; }
  });
}

function scan(devices, floorOf){
  const now=Date.now();
  const off   = devices.filter(d=>d.offline);
  const stale = devices.filter(d=>{ const h=hist.get(d.id); return !d.offline && moving(d) && h && h.same>=STALE_N; })
                       .map(d=>({d, mins:Math.round((now-(hist.get(d.id).since))/60000)}));
  const batt  = devices.filter(d=>d.wireless)
                  .map(d=>({d, pct:d.batt, days: Math.max(0, Math.round((d.batt-5)/(d.battPerDay||0.1))) }))
                  .sort((a,b)=>a.pct-b.pct);
  const trunks = ['A','B'].map(id=>{
    const ds = devices.filter(d=>floorOf(d.floor).trunk===id);
    const o  = ds.filter(d=>d.offline).length;
    return { id, total:ds.length, off:o, avail: ds.length? (1-o/ds.length)*100 : 100,
             load: Math.min(100, ds.length/ (id==='A'?620:620) *100) };
  });
  const ddc = devices.filter(d=>d.t==='DDC');
  const out = {
    total: devices.length, online: devices.length-off.length,
    avail: ((devices.length-off.length)/devices.length)*100,
    off: off.map(d=>({d})), stale, batt,
    lowBatt: batt.filter(b=>b.pct<25).length,
    trunks,
    ddcBusy: ddc.filter(d=>d.st.cpu>82).length, ddcN: ddc.length,
    scanMs: Math.round(28 + devices.length*0.06 + (off.length*3)),   // chu kỳ quét ước tính
    at: now };
  lastScan = out; return out;
}

// điểm sức khoẻ 0–100 để treo lên đầu màn hình, trừ điểm theo từng loại vấn đề
function score(s){
  if(!s) return 100;
  let p = 100;
  p -= (100-s.avail)*4;                        // mất kết nối phạt nặng nhất
  p -= s.stale.length*3;
  p -= s.lowBatt*2;
  p -= s.ddcBusy*2;
  return Math.max(0, Math.round(p));
}
const grade = p => p>=90?['Tốt','ok'] : p>=75?['Cần theo dõi','warn'] : ['Kém, phải xử lý','alarm'];

return { observe, scan, score, grade, STALE_N, moving, last:()=>lastScan,
  staleOf:d=>{const h=hist.get(d.id); return h&&h.same>=STALE_N?h.same:0;} };
})();
