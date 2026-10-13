// ===== ĐIỀU KHIỂN THEO CHIẾM DỤNG =====
// Hai thứ tốn tiền nhất mà không ai thấy: phòng họp đặt rồi không ai đến,
// và phòng trống vẫn giữ nguyên nhiệt độ cài đặt như lúc đông người.
window.OCC = (function(){

const NO_SHOW_MIN = 10;          // phút sau giờ bắt đầu mà không có người thì trả phòng
const VACANT_MIN  = 3;           // phút trống liên tục thì lùi cài đặt (rút ngắn cho bản mẫu, thực tế 15)
const SETBACK     = 3;           // °C lùi lại khi phòng trống
const KW_ROOM     = 1.15;        // công suất làm lạnh trung bình một phòng

const rooms = [];                // {dev(TS), fid, ri, name, kind, cap, people, since, book, mode, savedMin}
const events = [];               // nhật ký hành động tự động
let enabled = true, savedMin = 0;

const NAMES = ['Họp kinh doanh','Phỏng vấn','Đào tạo nội bộ','Họp dự án TGSC','Nghiệm thu nhà thầu','Họp giao ban'];

function init(devices, floorOf){
  rooms.length=0;
  devices.filter(d=>d.t==='TS').forEach(d=>{
    const f=floorOf(d.floor), r=f.rooms[d.room]; if(!r) return;
    const meeting = r.kind==='meeting';
    const o = { dev:d, fid:d.floor, ri:d.room, name:r.n, kind:r.kind, meeting,
      cap: d.cap||12, people:0, mode:'normal', book:null, savedMin:0,
      // phòng đã trống từ trước khi mở app, không phải thế giới bắt đầu lúc ta bấm F5
      since: Date.now() - Math.round(Math.random()*12*60e3) };
    if (meeting && Math.random()<0.55) o.book = mkBook();
    rooms.push(o);
  });
  // cộng dồn phần đã tiết kiệm từ đầu ca để con số không bắt đầu từ 0 khi vừa mở app
  const h = Math.max(0, new Date().getHours()-7 + new Date().getMinutes()/60);
  savedMin = Math.round(h*60*0.34*Math.max(1, Math.round(rooms.length*0.11)));
}
function mkBook(){
  const now=new Date(); const start=new Date(now);
  const off=[-25,-15,-12,20,45,90][Math.floor(Math.random()*6)];
  start.setMinutes(start.getMinutes()+off, 0, 0);
  return { who:['P. Kinh doanh','P. Kỹ thuật','Ban giám đốc','P. Nhân sự'][Math.floor(Math.random()*4)],
    title:NAMES[Math.floor(Math.random()*NAMES.length)], start,
    end:new Date(start.getTime()+60*60e3), released:false };
}

// ước lượng số người trong phòng từ CO2 — đúng cách các toà nhà không gắn cảm biến hiện diện vẫn làm được
function sense(o, open){
  const co2=o.dev.st.co2;
  const est = Math.max(0, Math.round((co2-455)/72));
  const target = open ? Math.min(o.cap, est) : 0;
  const had = o.people>0;
  o.people = target;
  if (had !== (o.people>0)) o.since = Date.now();
  return o.people;
}

function run(devices, floorOf, open, applySetpoint){
  if (!rooms.length) init(devices, floorOf);
  const now=Date.now();
  rooms.forEach(o=>{
    sense(o, open);
    const vacantMin = o.people>0 ? 0 : (now-o.since)/60000;

    // 1. phòng họp đặt mà không ai đến thì trả lại lịch
    if (o.book && !o.book.released && o.book.start<=new Date() && o.book.end>new Date()){
      const late=(now-o.book.start.getTime())/60000;
      if (late>=NO_SHOW_MIN && o.people===0){
        o.book.released=true; o.book.releasedAt=new Date();
        log(o, `Trả lại phòng đặt: ${o.book.title} (${o.book.who}) quá ${Math.round(late)} phút không có người`);
      }
    }
    // 2. phòng trống đủ lâu thì lùi cài đặt
    const booked = o.book && !o.book.released && o.book.start<=new Date() && o.book.end>new Date();
    const want = (!enabled || !open) ? 'normal'
               : (booked && o.people===0) ? 'hold'
               : (vacantMin>=VACANT_MIN) ? 'setback' : 'normal';
    if (want!==o.mode){
      o.mode=want; o.modeAt=now;
      if (want==='setback'){ log(o, `Lùi cài đặt +${SETBACK}°C, phòng trống ${Math.round(vacantMin)} phút`); }
      else if (want==='normal' && o.people>0) log(o, 'Có người trở lại, trả cài đặt về bình thường');
      if (applySetpoint) applySetpoint(o.dev, want==='setback' ? SETBACK : 0);
    }
    if (o.mode==='setback'){ o.savedMin += 1.5/60; savedMin += 1.5/60; }
  });
}
function log(o, txt){ events.unshift({t:new Date(), room:o, txt}); if(events.length>40) events.pop(); }

function stats(){
  const now=new Date();
  const booked = rooms.filter(o=>o.book);
  const active = booked.filter(o=>!o.book.released && o.book.start<=now && o.book.end>now);
  const released = booked.filter(o=>o.book.released);
  const back = rooms.filter(o=>o.mode==='setback');
  const kwh = savedMin/60*KW_ROOM;
  return { rooms:rooms.length, occupied:rooms.filter(o=>o.people>0).length,
    people:rooms.reduce((s,o)=>s+o.people,0),
    booked:booked.length, active:active.length, released:released.length,
    setback:back.length, savedMin:Math.round(savedMin), kwh:+kwh.toFixed(1),
    vnd:Math.round(kwh*3200), monthVnd:Math.round(kwh*3200*26) };
}
const list = () => rooms.filter(o=>o.meeting || o.mode==='setback' || o.people>0)
  .sort((a,b)=> (b.book?1:0)-(a.book?1:0) || (b.mode==='setback'?1:0)-(a.mode==='setback'?1:0) || b.people-a.people);

return { init, run, stats, list, events, rooms,
  get enabled(){return enabled;}, set enabled(v){enabled=v;},
  NO_SHOW_MIN, VACANT_MIN, SETBACK };
})();
