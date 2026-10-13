// ===== PHÁT HIỆN LỖI TỰ ĐỘNG (FDD) =====
// Luật chạy trên dữ liệu điểm đang có. Mỗi lỗi: bằng chứng số liệu + khuyến nghị + ước tính lãng phí.
// Ngưỡng thời gian trong bản mẫu rút ngắn (giây) để demo; ngoài thực tế đặt theo phút.
window.FDD = (function(){
const GIA_DIEN = 3200;            // đồng/kWh, điện kinh doanh
const NGAY_LV  = 26, GIO_LV = 10; // ngày làm việc/tháng, giờ chạy/ngày
const vnd = n => n>=1e6 ? (n/1e6).toFixed(1).replace('.0','')+' triệu' : Math.round(n/1000)+ ' nghìn';

const CAT = {
  waste:  {name:'Lãng phí năng lượng', color:'#F5B23C'},
  broken: {name:'Thiết bị hỏng',       color:'#FF5A5A'},
  sensor: {name:'Cảm biến nghi ngờ',   color:'#8EC5FF'},
  comfort:{name:'Không đạt tiện nghi', color:'#27C8D6'},
};

// mỗi luật: test() trả về chuỗi bằng chứng nếu đang lỗi, null nếu bình thường
const RULES = [
  { id:'valve_stuck', cat:'broken', sev:2, hold:12,
    name:'Van nước lạnh kẹt mở',
    when:d=>d.t==='CV',
    test:(d,S)=>{ const v=d.st.open;
      if (v<92) return null;
      if (S.minOpen==null||v<S.minOpen) S.minOpen=v;
      return `Độ mở giữ ${Math.round(v)}% liên tục, tín hiệu điều khiển thay đổi nhưng van không đóng lại`; },
    fix:'Kiểm tra actuator và ty van, chạy tay đóng mở để xác nhận kẹt cơ khí.',
    kwh:()=>0.9*GIO_LV*NGAY_LV },                       // ~0,9 kW nhiệt dư

  { id:'fcu_nowater', cat:'broken', sev:2, hold:10,
    name:'FCU chạy nhưng không có nước lạnh',
    when:d=>d.t==='FCU',
    test:(d,S,C)=>{ if(!d.st.run||d.offline) return null;
      const cv=C.sibling(d,'CV'); if(!cv) return null;
      if (cv.st.open>8) return null;
      return `Quạt đang chạy ở mức ${d.st.fan} nhưng van ${cv.tag} chỉ mở ${Math.round(cv.st.open)}%`; },
    fix:'Kiểm tra van hai ngả, bơm thứ cấp và tín hiệu điều khiển từ DDC.',
    kwh:()=>0.25*GIO_LV*NGAY_LV },

  { id:'sensor_flat', cat:'sensor', sev:2, hold:3,
    name:'Cảm biến đứng giá trị',
    when:d=>d.t==='TS',
    test:(d,S)=>{ const v=+d.st.temp.toFixed(2);
      if (S.last===v){ S.same=(S.same||0)+1; } else { S.same=0; S.last=v; }
      return S.same>=7 ? `Nhiệt độ giữ nguyên ${v}°C qua ${S.same} lần đọc, không dao động như các phòng khác` : null; },
    fix:'Kiểm tra cáp tín hiệu và địa chỉ MSTP; nếu truyền tốt thì thay cảm biến.',
    kwh:()=>0 },

  { id:'sensor_drift', cat:'sensor', sev:3, hold:8,
    name:'Nghi cảm biến lệch chuẩn',
    when:d=>d.t==='TS',
    test:(d,S,C)=>{ const peers=C.peers(d); if(peers.length<3) return null;
      const avg=peers.reduce((s,x)=>s+x.st.temp,0)/peers.length;
      const dv=d.st.temp-avg;
      return Math.abs(dv)>2.2 ? `Lệch ${dv>0?'+':''}${dv.toFixed(1)}°C so với trung bình ${avg.toFixed(1)}°C của ${peers.length} phòng cùng tầng` : null; },
    fix:'Đối chiếu bằng nhiệt kế cầm tay, hiệu chuẩn hoặc thay cảm biến.',
    kwh:()=>0.4*GIO_LV*NGAY_LV },

  { id:'temp_off', cat:'comfort', sev:2, hold:16,
    name:'Phòng không đạt nhiệt độ cài đặt',
    when:d=>d.t==='TS',
    test:(d,S,C)=>{ const e=d.st.temp-d.st.sp;
      if (Math.abs(e)<=2) return null;
      const pe=C.peers(d); if(pe.length>=3){ const avg=pe.reduce((s,x)=>s+x.st.temp,0)/pe.length;
        if (Math.abs(d.st.temp-avg)>2.2) return null; }   // nghi cảm biến, đã có luật riêng
      return `Chênh ${e>0?'+':''}${e.toFixed(1)}°C so với cài đặt ${d.st.sp.toFixed(1)}°C, kéo dài`; },
    fix:'Kiểm tra lưu lượng nước lạnh, lọc gió và tải nhiệt thực tế của phòng.',
    kwh:()=>0 },

  { id:'after_hours', cat:'waste', sev:3, hold:8,
    name:'Thiết bị chạy ngoài giờ',
    when:d=>['FCU','SPF','SEF','MAF','EF'].includes(d.t),
    test:(d,S,C)=>{ if(C.inSchedule()) return null;
      const on = d.t==='FCU' ? d.st.run : d.st.run;
      return on ? `Đang chạy ngoài khung giờ vận hành ${C.sched()}` : null; },
    fix:'Rà lại lịch trong DDC và quyền ép chạy; gắn cảm biến hiện diện nếu hay quên.',
    kwh:d=>(d.t==='FCU'?0.25:2.2)*4*NGAY_LV },

  { id:'fan_nopress', cat:'broken', sev:1, hold:8,
    name:'Quạt chạy nhưng không tạo áp',
    when:d=>['SPF','SEF','MAF','EF'].includes(d.t),
    test:d=>d.st.run && d.st.pa<20 ? `Quạt báo chạy nhưng áp suất chỉ ${Math.round(d.st.pa)} Pa, dưới ngưỡng 35 Pa` : null,
    fix:'Kiểm tra dây đai, chiều quay động cơ và ống lấy áp của cảm biến. Hệ tăng áp cầu thang hỏng là lỗi an toàn.',
    kwh:d=>3.5*2*NGAY_LV },

  { id:'filter_dirty', cat:'waste', sev:3, hold:6,
    name:'Lọc gió bẩn',
    when:d=>d.t==='FCU',
    test:d=>d.st.filter>85 ? `Chênh áp lọc ${Math.round(d.st.filter)}%, vượt ngưỡng thay lọc 85%` : null,
    fix:'Vệ sinh hoặc thay lọc, ghi lại ngày thay để tính chu kỳ.',
    kwh:()=>0.05*GIO_LV*NGAY_LV },

  { id:'panel_over', cat:'broken', sev:2, hold:12,
    name:'Tủ điện tải cao kéo dài',
    when:d=>d.t==='PANEL',
    test:d=>d.st.amp>44 ? `Dòng tải ${Math.round(d.st.amp)} A duy trì trên ngưỡng 44 A` : null,
    fix:'Đo cân bằng pha, kiểm tra siết đầu cốt và nhiệt độ thanh cái.',
    kwh:()=>0 },

  { id:'comms_lost', cat:'broken', sev:1, hold:4,
    name:'Mất kết nối bộ điều khiển',
    when:d=>['FCU','TS','CV','DDC','PANEL','CTRL'].includes(d.t),
    test:d=>d.offline ? `Không phản hồi trên trục BACnet, điểm đã treo giá trị cuối` : null,
    fix:'Kiểm tra nguồn thiết bị, trở đầu cuối và địa chỉ trùng trên trục MSTP.',
    kwh:()=>0 },

  { id:'co2_high', cat:'comfort', sev:2, hold:10,
    name:'CO₂ cao, thiếu khí tươi',
    when:d=>d.t==='TS',
    test:d=>d.st.co2>1000 ? `CO₂ ${Math.round(d.st.co2)} ppm, vượt ngưỡng 1000 ppm` : null,
    fix:'Tăng lưu lượng khí tươi cho khu vực, kiểm tra damper gió tươi và bộ thu hồi nhiệt.',
    kwh:()=>0 },
];

const S = new Map();      // trạng thái từng luật-thiết bị
const found = new Map();  // lỗi đang mở
let ctx=null;

function evaluate(devices, c){
  ctx=c; const now=Date.now();
  devices.forEach(d=>{
    RULES.forEach(R=>{
      if (!R.when(d)) return;
      const key=R.id+':'+d.id;
      let st=S.get(key); if(!st){ st={}; S.set(key,st); }
      let ev=null; try{ ev=R.test(d,st,c); }catch(e){ ev=null; }
      const f=found.get(key);
      if (ev){
        if (!st.since) st.since=now;
        const held=(now-st.since)/1000;
        if (held>=R.hold){
          if (f && f.ignored) return;
          found.set(key, Object.assign(f||{id:key, rule:R, dev:d, first:st.since, ticket:null, ignored:false},
            {ev, last:now, held:Math.round(held), kwh:R.kwh(d)}));
        }
      } else { st.since=null; if(f && !f.ticket && !f.ignored) found.delete(key); }
    });
  });
}
function list(cat){
  let L=[...found.values()].filter(f=>!f.ignored || cat==='ignored');
  if (cat && cat!=='all' && cat!=='ignored') L=L.filter(f=>f.rule.cat===cat);
  if (cat==='ignored') L=[...found.values()].filter(f=>f.ignored);
  return L.sort((a,b)=> a.rule.sev-b.rule.sev || b.kwh-a.kwh); }
function stats(){
  const L=[...found.values()].filter(f=>!f.ignored);
  const kwh=L.reduce((s,f)=>s+f.kwh,0);
  return { n:L.length, kwh:Math.round(kwh), vnd:kwh*GIA_DIEN,
    byCat:Object.keys(CAT).map(k=>({k, n:L.filter(f=>f.rule.cat===k).length})),
    tickets:L.filter(f=>f.ticket).length }; }
function ignore(id){ const f=found.get(id); if(f){ f.ignored=true; f.ticket=null; } }
function unignore(id){ const f=found.get(id); if(f) f.ignored=false; }
function makeTicket(id, who){ const f=found.get(id); if(!f) return null;
  f.ticket={no:'WO-'+String(1000+[...found.values()].filter(x=>x.ticket).length+1), at:new Date(), who, done:false};
  return f.ticket; }
function closeTicket(id){ const f=found.get(id); if(f&&f.ticket) f.ticket.done=true; }
return { evaluate, list, stats, ignore, unignore, makeTicket, closeTicket, CAT, vnd, GIA_DIEN,
  get:(id)=>found.get(id), all:()=>[...found.values()] };
})();
