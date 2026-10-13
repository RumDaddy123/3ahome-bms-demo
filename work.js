// ===== PHIẾU CÔNG VIỆC VÀ BẢO TRÌ =====
// Cảnh báo hay lỗi chẩn đoán chỉ có giá trị khi thành một việc có người nhận và có hạn.
// Bảo trì tính theo giờ chạy thực của thiết bị chứ không theo lịch cố định.
window.WK = (function(){

const TEAM = ['Chưa giao','Anh Dũng (cơ điện)','Anh Hải (điều khiển)','Nhà thầu ABB','Tổ vệ sinh'];
const ST_VN = {new:'Mới', doing:'Đang làm', done:'Đã xong'};
const HAN = {1:4, 2:24, 3:72};               // giờ: hạn xử lý theo mức ưu tiên

// chu kỳ bảo trì theo giờ chạy tích luỹ
const PM = {
  FCU: [{h:2000, w:'Vệ sinh lọc gió và khay nước ngưng'}, {h:8000, w:'Vệ sinh dàn trao đổi nhiệt, kiểm tra bạc quạt'}],
  SPF: [{h:4000, w:'Kiểm tra dây đai, bạc đạn, căn tâm động cơ'}],
  SEF: [{h:4000, w:'Kiểm tra dây đai, bạc đạn, căn tâm động cơ'}],
  MAF: [{h:4000, w:'Kiểm tra dây đai, bạc đạn, căn tâm động cơ'}],
  EF:  [{h:6000, w:'Vệ sinh cánh quạt, siết lại đầu cốt'}],
};

const wos = [];
let seq = 1000;

function create({title, dev, src, prio=2, detail='', who='Chưa giao', by='Vận hành'}){
  const now=new Date();
  const wo = { no:'WO-'+(++seq), title, dev, src, prio, detail, who, by,
    state:'new', at:now, due:new Date(now.getTime()+(HAN[prio]||24)*3600e3), log:[{t:now, txt:`${by} tạo phiếu`}] };
  wos.unshift(wo); return wo;
}
function assign(no, who, by){ const w=get(no); if(!w) return;
  w.who=who; if(w.state==='new') w.state='doing';
  w.log.unshift({t:new Date(), txt:`${by} giao cho ${who}`}); return w; }
function setState(no, st, by){ const w=get(no); if(!w) return;
  w.state=st; w.log.unshift({t:new Date(), txt:`${by} chuyển sang ${ST_VN[st]}`});
  if(st==='done') w.doneAt=new Date(); return w; }
const get = no => wos.find(w=>w.no===no);
const overdue = w => w.state!=='done' && Date.now()>w.due.getTime();

function list(filter){
  let L=wos;
  if (filter==='open')    L=wos.filter(w=>w.state!=='done');
  if (filter==='mine')    L=wos.filter(w=>w.who!=='Chưa giao' && w.state!=='done');
  if (filter==='unassigned') L=wos.filter(w=>w.who==='Chưa giao' && w.state!=='done');
  if (filter==='late')    L=wos.filter(overdue);
  if (filter==='done')    L=wos.filter(w=>w.state==='done');
  return L.slice().sort((a,b)=> (a.state==='done'?1:0)-(b.state==='done'?1:0)
    || (overdue(b)?1:0)-(overdue(a)?1:0) || a.prio-b.prio || a.due-b.due);
}
function stats(){ return { n:wos.length, open:wos.filter(w=>w.state!=='done').length,
  late:wos.filter(overdue).length, unassigned:wos.filter(w=>w.who==='Chưa giao'&&w.state!=='done').length,
  done:wos.filter(w=>w.state==='done').length }; }

// danh sách bảo trì tới hạn, tính từ giờ chạy tích luỹ của từng thiết bị
function due(devices){
  const out=[];
  devices.forEach(d=>{
    const plan=PM[d.t]; if(!plan || d.st.hours==null) return;
    plan.forEach(p=>{
      const done = Math.floor(d.st.hours/p.h);          // đã qua bao nhiêu chu kỳ
      const next = (done+1)*p.h;
      const left = next - d.st.hours;
      const pct  = (d.st.hours - done*p.h)/p.h*100;
      if (pct>72) out.push({ d, work:p.w, every:p.h, left:Math.round(left), pct:Math.round(pct),
        days: Math.max(0, Math.round(left/10)),          // ước 10 giờ chạy mỗi ngày
        hasWo: wos.some(w=>w.dev===d && w.src==='pm' && w.state!=='done') });
    });
  });
  return out.sort((a,b)=>a.left-b.left);
}

return { create, assign, setState, get, list, stats, due, overdue, TEAM, ST_VN, PM, all:()=>wos };
})();
