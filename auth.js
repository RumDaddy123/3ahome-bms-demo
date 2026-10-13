// ===== ĐĂNG NHẬP VÀ PHÂN QUYỀN =====
// Có máy chủ tại toà nhà: xác thực thật, mật khẩu băm kèm muối trên máy chủ, phiên có hạn.
// Chưa có máy chủ: chạy chế độ trình diễn, đối chiếu băm trong site.json — chỉ để xem thử,
// không dùng cho vận hành thật. Giao diện nói rõ điều này để không ai nhầm.
window.AUTH = (function(){

const KEY = 'bms.session';
const IDLE_MS = 30*60e3;          // không thao tác 30 phút thì khoá màn hình
const ROLE_VN = {admin:'Quản trị', tech:'Kỹ thuật', operator:'Vận hành', viewer:'Khách'};
const RANK = {viewer:0, operator:1, tech:2, admin:3};

let user = null, token = null, lastAct = Date.now(), locked = false, onChange = null;
const api = () => (window.SITE && SITE.cfg.storage.api) ? SITE.cfg.storage.api.replace(/\/$/,'') : '';

async function sha256(s){
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

// ---------- phiên làm việc ----------
function restore(){
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || 'null');
    if (s && s.exp > Date.now()){ user=s.user; token=s.token; lastAct=Date.now(); return true; } } catch(e){}
  return false;
}
function keep(remember){
  const s = {user, token, exp: Date.now()+12*3600e3};
  try { (remember?localStorage:sessionStorage).setItem(KEY, JSON.stringify(s)); } catch(e){}
}
function clear(){ try{ sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); }catch(e){} }

async function login(u, p, remember){
  u = (u||'').trim().toLowerCase();
  if (!u || !p) throw new Error('Nhập tên đăng nhập và mật khẩu');
  if (api()){
    const r = await fetch(api()+'/auth/login', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({u, p})});
    if (r.status===401) throw new Error('Sai tên đăng nhập hoặc mật khẩu');
    if (!r.ok) throw new Error('Máy chủ toà nhà không trả lời (HTTP '+r.status+')');
    const d = await r.json();
    if (d.disabled) throw new Error('Tài khoản đã bị khoá');
    user = d.user; token = d.token;
  } else {
    const list = (window.SITE && SITE.cfg.auth && SITE.cfg.auth.users) || [];
    const salt = (window.SITE && SITE.cfg.auth && SITE.cfg.auth.salt) || '';
    const row = list.find(x=>x.u===u);
    const h = await sha256(salt+p);
    if (!row || row.h!==h) throw new Error('Sai tên đăng nhập hoặc mật khẩu');
    user = {u:row.u, name:row.name, role:row.role}; token = 'demo';
  }
  lastAct=Date.now(); locked=false; keep(remember);
  log('auth.login', {u:user.u, name:user.name, role:user.role});
  if (onChange) onChange(user);
  return user;
}
function logout(){ const was=user; user=null; token=null; locked=false; clear();
  if (was) log('auth.logout', {u:was.u, name:was.name});
  if (onChange) onChange(null); }
function lock(){ if(user){ locked=true; if(onChange) onChange(user); } }
async function unlock(p){ if(!user) return false; await login(user.u, p, false); locked=false; return true; }

function touch(){ lastAct=Date.now(); }
function checkIdle(){
  if (user && !locked && Date.now()-lastAct > IDLE_MS){ lock(); return true; }
  return false;
}
function log(kind, rec){ if (window.SITE) SITE.write(kind, rec); }

// ---------- quyền ----------
// Khách chỉ xem. Vận hành ra lệnh thường. Kỹ thuật thêm lệnh an toàn và đổi lịch.
// Quản trị thêm quyền đổi nhận diện toà nhà, nơi lưu dữ liệu và quản lý người dùng.
const can = lvl => !!user && !locked && RANK[user.role] >= RANK[lvl];
const is  = r => !!user && user.role===r;

// ---------- quản lý người dùng (cần máy chủ tại toà nhà) ----------
async function users(){
  if (!api()) return (window.SITE && SITE.cfg.auth && SITE.cfg.auth.users || [])
    .map(x=>({u:x.u, name:x.name, role:x.role, disabled:0, demo:true}));
  const r = await fetch(api()+'/users', {headers:{'X-Token':token||''}});
  return r.ok ? r.json() : [];
}
async function saveUser(row){
  if (!api()) throw new Error('Cần máy chủ tại toà nhà mới thêm sửa người dùng được');
  const r = await fetch(api()+'/users', {method:'POST',
    headers:{'Content-Type':'application/json','X-Token':token||''}, body:JSON.stringify(row)});
  if (!r.ok) throw new Error('HTTP '+r.status);
  log('auth.user', {u:row.u, role:row.role, by:user&&user.name});
  return r.json();
}

return { login, logout, lock, unlock, restore, touch, checkIdle, can, is, users, saveUser,
  ROLE_VN, RANK, sha256,
  get user(){ return user; }, get token(){ return token; }, get locked(){ return locked; },
  get serverMode(){ return !!api(); },
  set onChange(f){ onChange=f; } };
})();
