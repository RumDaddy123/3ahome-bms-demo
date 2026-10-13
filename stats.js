// ===== THỐNG KÊ, PHÂN TÍCH VÀ DỰ BÁO =====
// Phần này không phục vụ người trực ca mà phục vụ người ra quyết định: chủ đầu tư,
// ban quản lý, và chính mình khi đi chào hàng. Mọi con số dự báo đều ghi rõ cách tính.
window.STATS = (function(){

const M2_PHONG = 28;                     // diện tích trung bình một phòng có điều hoà, m²

// ---------- phân rã phụ tải ----------
// Toà nhà chưa gắn đồng hồ đo riêng từng nhánh, nên đây là ước tính theo trạng thái
// thiết bị đang chạy. Khi lắp đồng hồ phụ tải thì thay hàm này bằng số đo thật.
function breakdown(devices, kwNow){
  const fcuOn = devices.filter(d=>d.t==='FCU' && d.st.run && !d.offline).length;
  const fcuAll= devices.filter(d=>d.t==='FCU').length || 1;
  const fanOn = devices.filter(d=>['SPF','SEF','MAF','EF'].includes(d.t) && d.st.run).length;
  const vAvg  = (()=>{ const v=devices.filter(d=>d.t==='CV'); return v.length? v.reduce((s,d)=>s+d.st.open,0)/v.length/100 : 0; })();
  const cool  = kwNow * (0.30 + 0.34*(fcuOn/fcuAll) * (0.5+vAvg*0.5));
  const fan   = Math.min(kwNow*0.18, 2.6*fanOn + kwNow*0.06);
  const lift  = kwNow * 0.09;
  const light = Math.max(0, kwNow - cool - fan - lift);
  return [
    {k:'cool',  n:'Điều hoà', v:cool,  c:'#27C8D6'},
    {k:'light', n:'Chiếu sáng và ổ cắm', v:light, c:'#F5B23C'},
    {k:'fan',   n:'Thông gió', v:fan,  c:'#8EC5FF'},
    {k:'lift',  n:'Thang máy và bơm', v:lift, c:'#C77DFF'},
  ];
}

// ---------- dự báo phụ tải 24 giờ tới ----------
// Lấy mô hình đường chuẩn theo nhiệt độ ngoài trời và lịch, rồi hiệu chỉnh bằng
// sai lệch thực tế mấy giờ gần nhất. Cách này đơn giản nhưng bám sát và giải thích được.
function forecast(openAt){
  if (!window.EN) return null;
  const e = EN.stats(); if(!e) return null;
  const recent = e.day.slice(-4).filter(x=>x.base>0);
  const bias = recent.length ? recent.reduce((s,x)=>s+x.kw/x.base,0)/recent.length : 1;
  const h0 = new Date().getHours();
  const out = [];
  for (let i=1; i<=24; i++){
    const h=(h0+i)%24, open=openAt(h);
    const base=EN.baseline(h, open);
    out.push({h, open, base:+base.toFixed(1), kw:+(base*bias).toFixed(1),
      lo:+(base*bias*0.92).toFixed(1), hi:+(base*bias*1.09).toFixed(1)});
  }
  return { rows:out, bias, peak: out.reduce((m,x)=>x.kw>m.kw?x:m, out[0]),
    kwh: out.reduce((s,x)=>s+x.kw,0) };
}

// ---------- dự phóng hoá đơn cuối tháng ----------
function monthBill(gia){
  if (!window.HIST) return null;
  const now=new Date(), ym = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const inM = HIST.days.filter(d=>d.d.startsWith(ym));
  const dim = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const done = inM.length || 1;
  const kwh = inM.reduce((s,d)=>s+d.kwh,0);
  const perDay = kwh/done;
  const proj = kwh + perDay*(dim-done);
  const base = inM.reduce((s,d)=>s+d.base,0) / done * dim;
  return { done, dim, kwh:Math.round(kwh), proj:Math.round(proj), base:Math.round(base),
    vnd:Math.round(proj*gia), overVnd:Math.round((proj-base)*gia),
    pc: base? (proj-base)/base*100 : 0 };
}

// ---------- tiện nghi ----------
// Tỉ lệ phòng đang nằm trong dải mục tiêu. Đây là thứ khách thuê cảm nhận được,
// khác với số kWh mà chỉ kế toán quan tâm.
function comfort(devices){
  const ts = devices.filter(d=>d.t==='TS' && !d.offline);
  if (!ts.length) return {temp:100, co2:100, n:0};
  const okT = ts.filter(d=>Math.abs(d.st.temp-d.st.sp)<=1.4).length;
  const okC = ts.filter(d=>d.st.co2<=900).length;
  const okH = ts.filter(d=>d.st.rh>=45 && d.st.rh<=65).length;
  return { temp: okT/ts.length*100, co2: okC/ts.length*100, rh: okH/ts.length*100, n: ts.length };
}

// ---------- cường độ năng lượng ----------
// Tính trên diện tích có điều hoà chứ không phải diện tích bao của toà nhà,
// vì phần hành lang, thang và hộp kỹ thuật không tiêu thụ theo cách như phòng làm việc.
function intensity(kwNow, devices){
  const m2 = Math.max(1, devices.filter(d=>d.t==='TS').length * M2_PHONG);
  return { kwm2: kwNow/m2*1000, m2 };
}

// ---------- bản đồ nhiệt theo tầng ----------
// Dữ liệu thật đang đo được, không phải số dựng thêm: mỗi ô là một phòng,
// màu theo chênh lệch so với nhiệt độ cài đặt.
function heat(devices, floorOf, BLD, maxF, metric){
  const rows=[];
  BLD.floors.forEach(f=>{
    const ts = devices.filter(d=>d.t==='TS' && d.floor===f.id);
    if (!ts.length) return;
    rows.push({ id:f.id, name:f.name,
      cells: ts.slice(0,12).map(d=>{
        const room=(floorOf(d.floor).rooms[d.room]||{n:''}).n;
        if (d.offline) return {id:d.id, v:null, room, txt:'mất kết nối'};
        if (metric==='co2') return {id:d.id, v:d.st.co2, room, txt:Math.round(d.st.co2)+' ppm'};
        if (metric==='occ'){ const n=Math.max(0, Math.round((d.st.co2-455)/72));
          return {id:d.id, v:n, room, txt: n? n+' người':'trống'}; }
        const e=d.st.temp-d.st.sp;
        return {id:d.id, v:e, room, txt:(e>0?'+':'')+e.toFixed(1)+'°C · cài '+d.st.sp.toFixed(0)+'°C'};
      }) });
  });
  return rows.slice(0, maxF||14);
}

// thang màu riêng cho từng lớp, để màu nói đúng điều cần nói
const HEAT_SCALE = {
  temp: v => v==null?null : v> 2?'#FF5A5A' : v> 1.2?'#F5B23C' : v> .6?'#E3D27A'
            : v<-2?'#4F8CFF' : v<-1.2?'#6FA6C9' : v<-.6?'#7FD4C1' : '#2BD37A',
  co2:  v => v==null?null : v>1100?'#FF5A5A' : v>900?'#F5B23C' : v>750?'#E3D27A'
            : v>620?'#7FD4C1' : v>500?'#4FB8A8' : '#2E6E63',
  occ:  v => v==null?null : v>=8?'#27C8D6' : v>=5?'#3FA3C9' : v>=3?'#4F8CFF'
            : v>=1?'#3D5B8C' : '#232C3B',
};
const HEAT_LEGEND = {
  temp: [['#4F8CFF','lạnh hơn cài đặt'],['#2BD37A','đúng dải'],['#FF5A5A','nóng hơn cài đặt']],
  co2:  [['#2E6E63','dưới 500 ppm'],['#7FD4C1','khoảng 700'],['#F5B23C','trên 900'],['#FF5A5A','trên 1100']],
  occ:  [['#232C3B','phòng trống'],['#3D5B8C','vài người'],['#27C8D6','đông']],
};

// ---------- dự đoán rủi ro hỏng hóc ----------
// Chấm điểm theo ba dấu hiệu cộng lại: đã chạy quá chu kỳ bảo trì, đang có triệu chứng
// trong chẩn đoán, và từng lặp lỗi nhiều lần. Đây là suy đoán có căn cứ, không phải lời tiên tri.
function risk(devices){
  const out=[];
  const pm = window.WK ? WK.due(devices) : [];
  const fd = window.FDD ? FDD.list('all') : [];
  const rp = window.HIST ? HIST.topRepeats(30) : [];
  const add=(d, pts, why, kind, days)=>{ let r=out.find(x=>x.d===d); if(!r) out.push(r={d, pts:0, why:[], kinds:new Set(), days:null});
    r.pts+=pts; r.why.push(why); r.kinds.add(kind);
    if (days!=null) r.days = r.days==null ? days : Math.min(r.days, days); };
  // Tới hạn bảo trì là việc đã lên kế hoạch, tự nó không phải nguy cơ hỏng.
  // Nó chỉ nặng lên khi đi kèm triệu chứng thật hoặc tiền sử lặp lỗi.
  pm.forEach(x=>{ if(x.pct>95) add(x.d, 16, `đã quá chu kỳ ${x.work.toLowerCase()}`, 'pm', 0);
    else if(x.pct>85) add(x.d, 9, `sắp tới hạn ${x.work.toLowerCase()}, còn ${x.left} giờ chạy`, 'pm', x.days); });
  fd.forEach(f=>{ if(f.ignored) return;
    add(f.dev, f.rule.sev===1?48:f.rule.sev===2?30:15, f.rule.name.toLowerCase(), 'fdd'); });
  rp.forEach(r=>{ const d=devices.find(x=>x.id===r.devId); if(d&&r.n>=3) add(d, Math.min(32, r.n*7), `lặp lỗi ${r.n} lần`, 'rep'); });
  devices.filter(d=>d.st.hours>8500).forEach(d=>add(d, 8, `đã chạy ${d.st.hours.toLocaleString('vi-VN')} giờ`, 'age'));
  return out.map(r=>{
      const pts=Math.min(100, r.pts), k=r.kinds.size;
      // "cao" đòi hỏi ít nhất hai loại dấu hiệu khác nhau, tránh cả danh sách cùng đỏ vì một lý do
      const lvl = (pts>=55 && k>=2) ? 'cao' : (pts>=30 || k>=2) ? 'vừa' : 'thấp';
      // Câu hành động nói thẳng việc phải làm. Chỉ nêu số ngày khi có căn cứ từ giờ chạy còn lại.
      const act = r.kinds.has('fdd') && lvl!=='thấp' ? 'xử lý trong ca này'
                : r.days===0 ? 'đã quá hạn bảo trì, xếp lịch ngay'
                : r.days!=null ? `còn khoảng ${r.days} ngày chạy nữa là tới hạn`
                : 'đưa vào kế hoạch bảo trì kỳ tới';
      return { ...r, pts, k, lvl, act };
    })
    .sort((a,b)=> b.k-a.k || b.pts-a.pts).slice(0,5);
}

// ---------- xếp hạng tầng tốn điện ----------
function floorRank(devices, BLD, n){
  return BLD.floors.map(f=>({ f,
      kw: devices.filter(d=>d.floor===f.id && d.t==='PANEL').reduce((s,d)=>s+d.st.amp*.38*1.73,0) }))
    .filter(x=>x.kw>0).sort((a,b)=>b.kw-a.kw).slice(0, n||6);
}

return { breakdown, forecast, monthBill, comfort, intensity, heat, risk, floorRank, M2_PHONG,
  HEAT_SCALE, HEAT_LEGEND };
})();
