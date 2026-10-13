// ===== QUẢN LÝ CẢNH BÁO =====
// Một thiết bị + một lý do = một dòng cảnh báo, lặp lại thì đếm thêm chứ không đẻ dòng mới.
// Có chống rung, ba mức ưu tiên, nhận xử lý, tạm ẩn và leo thang khi quá hạn.
window.AL = (function(){

// Ngưỡng rút ngắn cho bản mẫu. Ngoài thực tế: rung 5 lần/15 phút, leo thang 5/15 phút.
const CHATTER_WIN = 90e3, CHATTER_N = 4, CHATTER_CALM = 60e3;
const ESC = {1:[45,150], 2:[150,420], 3:[900,3600]};   // giây: leo thang cấp 1, cấp 2
const ESC_TO = ['', 'Trưởng ca', 'Quản lý kỹ thuật'];
const SHELVE_MAX = 8*3600e3;
// Sau khi đổi nhiệt độ cài đặt, phòng cần thời gian đuổi kịp. Báo động trong lúc đó là báo nhảm.
const SP_SETTLE = 90e3;          // thực tế đặt 10–20 phút tuỳ quán tính của phòng
// Độ trễ xác nhận: điều kiện phải giữ liên tục đủ lâu mới thành cảnh báo.
// Thiếu cái này thì mỗi lần giá trị chạm ngưỡng rồi lùi lại là một dòng mới, màn hình đầy rác.
const ON_DELAY = { temp:45e3, co2:45e3, valve:25e3, amp:25e3, cpu:30e3, filter:60e3,
                   comms:0, fault:0, press:0, fd:0, damper:0 };
const CONDS = Object.keys(ON_DELAY);

const pend  = new Map();         // key -> thời điểm điều kiện bắt đầu đúng, chưa đủ độ trễ
const rows  = new Map();         // key -> dòng cảnh báo
const byDev = new Map();         // id thiết bị -> tập key, để không phải quét cả bảng mỗi chu kỳ
const log   = [];                // nhật ký thao tác cảnh báo
let onEscalate = null;

// lý do chính của một thiết bị: [mã lý do, câu mô tả] hoặc null nếu bình thường
function reasonOf(d){
  if (d.offline) return ['comms','Mất kết nối trên trục BACnet'];
  if (d.fault)   return ['fault', d.fault];
  switch(d.t){
    case 'TS': { const e=d.st.temp-d.st.sp;
      const settling = d.spAt && Date.now()-d.spAt < SP_SETTLE;
      if (Math.abs(e)>1.4 && !settling) return ['temp',`Lệch nhiệt độ ${e>0?'+':''}${e.toFixed(1)}°C so với cài đặt`];
      if (d.st.co2>900)    return ['co2', `CO₂ ${Math.round(d.st.co2)} ppm, thiếu khí tươi`];
      return null; }
    case 'CV':    return d.st.open>92 ? ['valve', `Van mở ${Math.round(d.st.open)}%, gần hết hành trình`] : null;
    case 'FCU':   return d.st.filter>85 ? ['filter',`Chênh áp lọc gió ${Math.round(d.st.filter)}%`] : null;
    case 'DDC':   return d.st.cpu>82 ? ['cpu',  `CPU bộ điều khiển ${Math.round(d.st.cpu)}%`] : null;
    case 'PANEL': return d.st.amp>44 ? ['amp',  `Dòng tải ${Math.round(d.st.amp)} A`] : null;
    case 'CTRL':  return d.st.ok ? null : ['fd','Bộ điều khiển van chặn lửa báo lỗi'];
    case 'SD':    return d.st.open ? ['damper','Van chặn lửa đang mở'] : null;
    default:      return d.st.run && d.st.pa<20 ? ['press',`Quạt chạy nhưng áp suất chỉ ${Math.round(d.st.pa)} Pa`] : null;
  }
}

function sync(devices, prioOf){
  const now = Date.now();
  devices.forEach(d=>{
    const r = reasonOf(d);
    // lý do cũ đã hết thì đóng dòng tương ứng, kể cả khi thiết bị đang lỗi vì lý do khác
    for (const c of CONDS) if (!r || c!==r[0]) pend.delete(d.id+':'+c);
    const mine = byDev.get(d.id);
    if (mine) mine.forEach(k=>{ const a=rows.get(k);
      if (a && a.state==='active' && (!r || a.cond!==r[0])){
        a.state = a.ack ? 'done' : 'rtn';          // chưa xác nhận thì vẫn giữ lại để người trực thấy
        a.clearedAt = now; a.trans.push(now);
      } });
    if (r){
      const key = d.id+':'+r[0];
      let a = rows.get(key);
      if (!a){
        // chưa thành cảnh báo cho tới khi điều kiện giữ đủ độ trễ xác nhận
        const need = ON_DELAY[r[0]] ?? 0;
        if (need > 0){
          const t0 = pend.get(key); if (!t0){ pend.set(key, now); return; }
          if (now - t0 < need) return;
        }
        a = { key, dev:d, cond:r[0], msg:r[1], firstAt:now, lastAt:now, count:1,
              state:'active', prio:prioOf(d), lvl:d.status, trans:[now],
              ack:null, shelveUntil:0, shelveWhy:'', chatter:false, esc:0 };
        rows.set(key, a); pend.delete(key);
        let s=byDev.get(d.id); if(!s) byDev.set(d.id, s=new Set()); s.add(key);
      } else {
        a.msg = r[1]; a.lastAt = now; a.lvl = d.status;
        if (a.state !== 'active'){                       // lỗi quay lại sau khi đã hết
          a.state='active'; a.count++; a.trans.push(now);
          if (a.ack && a.ackedAt < a.trans[a.trans.length-1]) a.ack=null;   // lỗi mới thì phải xác nhận lại
        }
        const p = prioOf(d); if (p < a.prio) a.prio = p;  // chỉ cho nặng thêm, không tự hạ cấp
      }
      // chống rung: đổi trạng thái quá nhiều lần trong cửa sổ thì gộp lại một dòng, ngừng báo mới
      a.trans = a.trans.filter(t => now-t < CHATTER_WIN);
      if (a.trans.length >= CHATTER_N) { a.chatter=true; a.chatterAt=now; }
      else if (a.chatter && now-(a.chatterAt||0) > CHATTER_CALM) a.chatter=false;
      // leo thang khi quá hạn mà chưa ai nhận
      if (!a.ack && !shelved(a)){
        const [e1,e2] = ESC[a.prio] || ESC[3];
        const age = (now - a.firstAt)/1000;
        const lv = age>e2 ? 2 : age>e1 ? 1 : 0;
        if (lv > a.esc){ a.esc=lv; a.escAt=now;
          note(`Leo thang cấp ${lv} · ${a.dev.tag} · ${a.msg} · chuyển ${ESC_TO[lv]}`);
          if (onEscalate) onEscalate(a, lv); }
      }
    }
  });
  // dọn các dòng đã xong và đã nguội
  rows.forEach((a,k)=>{ if (a.state==='done' && now-a.clearedAt > 10*60e3){
    rows.delete(k); const s=byDev.get(a.dev.id); if(s) s.delete(k); } });
}

const shelved = a => a.shelveUntil > Date.now();
const live    = a => a.state!=='done' && !shelved(a) && !a.chatter;

function list(filter){
  const all=[...rows.values()];
  let L;
  switch(filter){
    case 'un':      L = all.filter(a=>live(a) && !a.ack); break;
    case 'p1':      L = all.filter(a=>live(a) && a.prio===1); break;
    case 'esc':     L = all.filter(a=>live(a) && a.esc>0); break;
    case 'chatter': L = all.filter(a=>a.chatter && a.state!=='done'); break;
    case 'shelved': L = all.filter(a=>shelved(a)); break;
    default:        L = all.filter(a=>live(a));
  }
  return L.sort((a,b)=> (a.ack?1:0)-(b.ack?1:0) || b.esc-a.esc || a.prio-b.prio || b.lastAt-a.lastAt);
}

function stats(){
  const all=[...rows.values()], L=all.filter(live);
  return { n:L.length, un:L.filter(a=>!a.ack).length, p1:L.filter(a=>a.prio===1).length,
    esc:L.filter(a=>a.esc>0).length, chatter:all.filter(a=>a.chatter&&a.state!=='done').length,
    shelved:all.filter(shelved).length, rtn:L.filter(a=>a.state==='rtn').length,
    worstEsc:L.reduce((m,a)=>Math.max(m,a.esc),0) };
}

// thời gian còn lại trước khi leo thang, để người trực biết mình còn bao lâu
function dueIn(a){
  if (a.ack || shelved(a) || a.state==='done') return null;
  const [e1,e2]=ESC[a.prio]||ESC[3], age=(Date.now()-a.firstAt)/1000;
  const nxt = a.esc===0?e1 : a.esc===1?e2 : null;
  return nxt==null ? null : Math.max(0, Math.round(nxt-age));
}

function ack(key, who, note_){
  const a=rows.get(key); if(!a) return null;
  a.ack={who, at:new Date(), note:note_||''}; a.ackedAt=Date.now();
  if (a.state==='rtn') a.state='done';
  note(`${who} nhận xử lý · ${a.dev.tag} · ${a.msg}${note_?' · '+note_:''}`);
  return a;
}
function ackAllOf(dev, who, note_){ let n=0; rows.forEach(a=>{ if(a.dev===dev && live(a) && !a.ack){ ack(a.key,who,note_); n++; } }); return n; }
function shelve(key, hours, why, who){
  const a=rows.get(key); if(!a) return null;
  a.shelveUntil = Date.now()+Math.min(hours*3600e3, SHELVE_MAX); a.shelveWhy=why||''; a.shelveBy=who;
  note(`${who} tạm ẩn ${hours} giờ · ${a.dev.tag}${why?' · lý do: '+why:''}`);
  return a;
}
function unshelve(key, who){ const a=rows.get(key); if(!a) return; a.shelveUntil=0;
  note(`${who} bỏ tạm ẩn · ${a.dev.tag}`); }
function note(txt){ log.unshift({t:new Date(), txt}); if(log.length>60) log.pop(); }

return { sync, list, stats, SP_SETTLE, ON_DELAY, ack, ackAllOf, shelve, unshelve, dueIn, reasonOf,
  shelved, live, log, get:k=>rows.get(k), all:()=>[...rows.values()],
  forDev:d=>[...rows.values()].filter(a=>a.dev===d && a.state!=='done'),
  set onEscalate(f){ onEscalate=f; }, ESC, ESC_TO, CHATTER_N };
})();
