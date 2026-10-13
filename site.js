// ===== CẤU HÌNH TỪNG TOÀ NHÀ + LƯU TRỮ TẠI CHỖ =====
// Một bộ mã nguồn chạy cho nhiều toà nhà. Mọi thứ riêng của từng công trình nằm ở site.json,
// kỹ thuật viên sửa file đó khi lắp đặt, không phải sửa code và không phải build lại.
//
// Dữ liệu vận hành (xác nhận cảnh báo, phiếu công việc, sổ bàn giao, cấu hình) được ghi
// xuống máy chủ đặt tại toà nhà. Không có dữ liệu nào tự động chảy về máy chủ của nhà cung cấp.
window.SITE = (function(){

// giá trị mặc định khi chưa có site.json — cũng là danh sách đầy đủ những gì cá nhân hoá được
const DEFAULT = {
  building: { name:'Toà nhà chưa đặt tên', short:'BMS', code:'', address:'', floorsNote:'' },
  owner:    { name:'', logo:'', hotline:'', email:'' },          // chủ đầu tư / ban quản lý toà nhà
  vendor:   { name:'3AHOME Vietnam', site:'3ahome.vn', support:'' }, // đơn vị lắp đặt, chỉ hiện ở mục Giới thiệu
  theme:    { accent:'#27C8D6', logoText:'3A', dark:true },
  locale:   { tz:'Asia/Ho_Chi_Minh', currency:'VND', kwhPrice:3200, workDays:26 },
  ops:      { schedOn:'07:00', schedOff:'18:00', sat:true, sun:false },
  storage:  { mode:'local', api:'', cloud:'', push:'manual' },   // local | server ; cloud: đẩy lên internet
  auth:     { salt:'', users:[] },   // chỉ dùng khi chưa có máy chủ tại toà nhà (chế độ trình diễn)
};

let cfg = JSON.parse(JSON.stringify(DEFAULT));
const KEY = 'bms.site', DKEY = 'bms.data';
let apiOk = false;

const merge = (a,b)=>{ Object.keys(b||{}).forEach(k=>{
  if (b[k] && typeof b[k]==='object' && !Array.isArray(b[k])) merge(a[k]=a[k]||{}, b[k]);
  else if (b[k]!=null && b[k]!=='') a[k]=b[k]; }); return a; };

// Thứ tự nạp: site.json của công trình → máy chủ tại toà nhà → chỉnh tay lưu trên máy này
async function load(){
  try { const r = await fetch('site.json', {cache:'no-store'});
        if (r.ok) merge(cfg, await r.json()); } catch(e){}
  if (cfg.storage.api){
    try { const r = await fetch(cfg.storage.api.replace(/\/$/,'')+'/config', {cache:'no-store'});
          if (r.ok){ merge(cfg, await r.json()); apiOk=true; } } catch(e){}
  }
  try { const l = localStorage.getItem(KEY); if (l) merge(cfg, JSON.parse(l)); } catch(e){}
  apply(); return cfg;
}

// áp cấu hình vào giao diện: tên, logo, màu, tiêu đề trang
function apply(){
  const b=cfg.building, o=cfg.owner, t=cfg.theme;
  document.title = b.name;
  const set=(sel,txt)=>{ const e=document.querySelector(sel); if(e) e.textContent=txt; };
  set('#bldName', b.name);
  set('#bldSub', [o.name, b.code].filter(Boolean).join(' · ') || b.short);
  const li=document.querySelector('#bldLogo');
  if (li){ if (o.logo){ li.innerHTML=`<img src="${o.logo}" alt="">`; li.classList.add('img'); }
           else { li.textContent = t.logoText || 'BMS'; li.classList.remove('img'); } }
  if (t.accent) document.documentElement.style.setProperty('--accent', t.accent);
  const mt=document.querySelector('meta[name="theme-color"]'); if(mt&&!t.dark) mt.setAttribute('content','#FFFFFF');
}

function save(patch){
  merge(cfg, patch||{});
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch(e){}
  if (cfg.storage.api) push('/config', cfg).catch(()=>{});
  apply(); return cfg;
}
function reset(){ try{ localStorage.removeItem(KEY); }catch(e){}
  cfg = JSON.parse(JSON.stringify(DEFAULT)); load(); }

// ---------- lưu trữ dữ liệu vận hành ----------
// Mặc định ghi vào máy này. Khi có máy chủ tại toà nhà thì ghi thẳng lên đó.
// Dù ở chế độ nào, dữ liệu cũng nằm trong phạm vi toà nhà.
const queue = [];
let lastSync = null, syncErr = null;

async function push(path, body){
  if (!cfg.storage.api) throw new Error('chưa cấu hình máy chủ tại toà nhà');
  const r = await fetch(cfg.storage.api.replace(/\/$/,'')+path, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  if (!r.ok) throw new Error('HTTP '+r.status);
  lastSync=new Date(); syncErr=null; apiOk=true; return r;
}
function write(kind, rec){
  const row = {kind, at:new Date().toISOString(), rec};
  queue.push(row); if (queue.length>500) queue.shift();
  try { const d=JSON.parse(localStorage.getItem(DKEY)||'[]'); d.push(row);
        localStorage.setItem(DKEY, JSON.stringify(d.slice(-500))); } catch(e){}
  if (cfg.storage.api) push('/events', row).catch(e=>{ syncErr=e.message; apiOk=false; });
}
function stats(){
  let n=0; try{ n=(JSON.parse(localStorage.getItem(DKEY)||'[]')).length; }catch(e){}
  return { mode: cfg.storage.api ? (apiOk?'Máy chủ tại toà nhà':'Máy chủ tại toà nhà (chưa kết nối được)') : 'Trình duyệt trên máy này',
    api: cfg.storage.api||'', cloud: cfg.storage.cloud||'', records:n,
    queued:queue.length, lastSync, syncErr, push:cfg.storage.push };
}
function exportJSON(){
  let d=[]; try{ d=JSON.parse(localStorage.getItem(DKEY)||'[]'); }catch(e){}
  return JSON.stringify({site:cfg, exportedAt:new Date().toISOString(), events:d}, null, 2);
}
function clearData(){ try{ localStorage.removeItem(DKEY); }catch(e){} queue.length=0; }

return { load, save, reset, apply, write, stats, exportJSON, clearData, DEFAULT,
  get cfg(){ return cfg; }, get kwhPrice(){ return cfg.locale.kwhPrice; } };
})();
