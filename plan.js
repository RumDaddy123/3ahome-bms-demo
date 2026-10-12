// ===== MẶT BẰNG KIẾN TRÚC + THIẾT BỊ THEO BẢN VẼ DỰ ÁN =====
// Nguồn dữ liệu thiết bị: bản vẽ MEP phần chung của dự án (sơ đồ nguyên lý thông gió, hút khói, tăng áp)
// Mặt bằng: dựng theo lõi thang điển hình nhà cao tầng. Kích thước chờ bản vẽ kiến trúc để chuẩn hoá.
const BLD = {
  name: '3AHOME Building Test',
  W: 36, D: 24, H: 3.45, slab: .3,     // mét
  floors: [                             // theo danh sách tầng trong bản vẽ
    {id:'B2', name:'Hầm 2',  kind:'basement'},
    {id:'B1', name:'Hầm 1',  kind:'basement'},
    {id:'F1', name:'Tầng 1', kind:'lobby'},
    {id:'F2', name:'Tầng 2', kind:'office'},
    ...Array.from({length:23},(_,i)=>({id:'F'+(i+3), name:'Tầng '+(i+3), kind:'office'})),
    {id:'TUM', name:'Tum',   kind:'tech'},
    {id:'KTM', name:'KT thang máy', kind:'tech'},
    {id:'MAI', name:'Mái',   kind:'roof'},
  ],
};

// --- mặt bằng điển hình: lõi ở giữa, hành lang bao quanh, phòng ngoài chu vi ---
// hệ toạ độ: tâm sàn là (0,0); x ngang (36m), z dọc (24m)
const CORE = {x0:-7, x1:7, z0:-5, z1:5};
const COR  = 1.9;   // bề rộng hành lang
function planRooms(kind){
  const R=[], W=BLD.W, D=BLD.D;
  const add=(n,x0,z0,x1,z1,k,o={})=>R.push(Object.assign({n,x:x0,z:z0,w:x1-x0,d:z1-z0,kind:k,doors:[],glass:[],blank:[],open:[]},o));

  if (kind==='roof' || kind==='tech'){
    add('Sàn mái', -W/2,-D/2, W/2, D/2, 'roofdeck', {open:['n','e','s','w']});
    add('Buồng thang A', CORE.x0, CORE.z0, CORE.x0+4, CORE.z0+5.2, 'stair', {doors:[['e',.5]]});
    add('Buồng thang B', CORE.x1-4, CORE.z0, CORE.x1, CORE.z0+5.2, 'stair', {doors:[['w',.5]]});
    add('Phòng kỹ thuật thang máy', -3, CORE.z0, 3, CORE.z0+5.2, 'lifttech', {doors:[['n',.5]]});
    add('Phòng quạt', CORE.x0, 1, CORE.x0+6, 5, 'fanroom', {doors:[['e',.5]]});
    add('Phòng quạt 2', CORE.x1-6, 1, CORE.x1, 5, 'fanroom', {doors:[['w',.5]]});
    return R;
  }
  if (kind==='basement'){
    add('Gara', -W/2,-D/2, W/2, D/2, 'garage', {open:['n','e','s','w']});
    add('Thang bộ A', CORE.x0, CORE.z0, CORE.x0+4, CORE.z0+5.2, 'stair', {doors:[['e',.5]]});
    add('Thang bộ B', CORE.x1-4, CORE.z0, CORE.x1, CORE.z0+5.2, 'stair', {doors:[['w',.5]]});
    add('Sảnh thang máy', -3, CORE.z0, 3, CORE.z0+5.2, 'lift', {doors:[['n',.5]]});
    add('Phòng bơm / kỹ thuật', CORE.x0, 1, CORE.x0+7, 5, 'pump', {doors:[['e',.6]]});
    add('Phòng điện', CORE.x1-7, 1, CORE.x1, 5, 'elec', {doors:[['w',.4]]});
    return R;
  }
  // --- lõi (dùng cho tầng 1 và tầng điển hình) ---
  add('Thang bộ A', CORE.x0, CORE.z0, CORE.x0+3.6, CORE.z0+5.4, 'stair', {doors:[['e',.5]]});
  add('Thang bộ B', CORE.x1-3.6, CORE.z0, CORE.x1, CORE.z0+5.4, 'stair', {doors:[['w',.5]]});
  add('Sảnh thang máy', -3.4, CORE.z0, 3.4, CORE.z0+5.4, 'lift', {doors:[['n',.5]]});
  add('WC nam', CORE.x0+3.6, CORE.z0, -3.4, CORE.z0+2.6, 'wc', {doors:[['n',.5]]});
  add('WC nữ', 3.4, CORE.z0, CORE.x1-3.6, CORE.z0+2.6, 'wc', {doors:[['n',.5]]});
  add('Hộp gen tăng áp D1', CORE.x0+3.6, CORE.z0+2.6, CORE.x0+5.0, CORE.z1, 'shaft', {doors:[['e',.5]]});
  add('Hộp gen hút khói',   CORE.x0+5.0, CORE.z0+2.6, CORE.x0+6.6, CORE.z1, 'shaft', {doors:[['e',.5]]});
  add('Hộp gen điện TĐ',    CORE.x1-6.6, CORE.z0+2.6, CORE.x1-5.0, CORE.z1, 'elecshaft', {doors:[['w',.5]]});
  add('Hộp gen tăng áp D2', CORE.x1-5.0, CORE.z0+2.6, CORE.x1-3.6, CORE.z1, 'shaft', {doors:[['w',.5]]});
  add('Sảnh tầng', -3.4, CORE.z0+2.6, 3.4, CORE.z1, 'hall', {open:['n']});

  if (kind==='lobby'){
    add('Sảnh chính', -W/2, CORE.z1+COR, W/2, D/2, 'lobby', {glass:['n'], open:['s']});
    add('Quản lý toà nhà', -W/2, -D/2, -11, CORE.z0, 'office', {glass:['s','w'], doors:[['e',.5]]});
    add('Phòng kỹ thuật BMS', 11, -D/2, W/2, CORE.z0, 'bms', {glass:['s','e'], doors:[['w',.5]]});
    add('Khu thương mại', -11, -D/2, 11, CORE.z0, 'retail', {glass:['s'], open:['n']});
    return R;
  }
  // --- tầng điển hình: 8 phòng quanh chu vi ---
  const zN0 = CORE.z1 + COR, zS1 = CORE.z0 - COR;
  const cuts = [-W/2, -12, -4, 4, 12, W/2];
  const names = ['Phòng A','Phòng B','Phòng C','Phòng D','Phòng E'];
  for (let i=0;i<cuts.length-1;i++){
    add(names[i]+' (bắc)', cuts[i], zN0, cuts[i+1], D/2, 'office', {glass:['n'], doors:[['s',.5]]});
    add(names[i]+' (nam)', cuts[i], -D/2, cuts[i+1], zS1, 'office', {glass:['s'], doors:[['n',.5]]});
  }
  add('Phòng họp', -W/2, zS1, CORE.x0-COR, zN0, 'meeting', {glass:['w'], doors:[['e',.5]]});
  add('Pantry',     CORE.x1+COR, zS1, W/2, zN0, 'pantry', {glass:['e'], doors:[['w',.5]]});
  return R;
}

// --- thiết bị lấy từ bản vẽ, gán theo tầng ---
const DWG_DEVICES = {
  B2:  [['SEF-01','SEF'],['SEF-1','SEF'],['TĐ.TG1','PANEL'],['TĐK-01','CTRL']],
  B1:  [['SPF-S','SPF'],['TĐ.TG1-1','PANEL'],['TĐK-02','CTRL']],
  F1:  [['SEF-02','SEF'],['SEF-03','SEF'],['SPF-D3','SPF'],['TĐ.TG1-2','PANEL']],
  F2:  [['MAF-01','MAF'],['SEF-SH','SEF'],['TĐ.TG1-3','PANEL'],['TĐK-03','CTRL']],
  F15: [['SEF-2','SEF'],['TĐ.TG2-1','PANEL']],
  TUM: [['TĐ.TGTT','PANEL'],['SPF-T1','SPF']],
  KTM: [['MAF-02','MAF'],['SEF-04','SEF'],['TĐ.TG2-2','PANEL'],['TĐK-04','CTRL']],
  MAI: [['SPF-M','SPF'],['SPF-D1','SPF'],['SPF-D2','SPF'],['EF-R','EF'],['TĐ.TG2','PANEL'],['TĐ.TGSC','PANEL']],
};
const DEV_INFO = {
  SPF:  {name:'Quạt tăng áp cầu thang', proto:'BACnet MSTP qua TĐ', unit:'Pa'},
  SEF:  {name:'Quạt hút khói',          proto:'BACnet MSTP qua TĐ', unit:'Pa'},
  MAF:  {name:'Quạt cấp khí bù',        proto:'BACnet MSTP qua TĐ', unit:'Pa'},
  EF:   {name:'Quạt hút thải',          proto:'BACnet MSTP qua TĐ', unit:'Pa'},
  PANEL:{name:'Tủ điện điều khiển',     proto:'BACnet IP',          unit:'A'},
  CTRL: {name:'Tủ điều khiển van chặn lửa', proto:'BACnet MSTP',    unit:''},
  FCU:  {name:'FCU (dàn lạnh)',         proto:'BACnet MSTP',        unit:''},
  TS:   {name:'Cảm biến nhiệt độ / CO₂',proto:'BACnet MSTP',        unit:'°C'},
  CV:   {name:'Van điều khiển nước lạnh',proto:'0-10V qua DDC',     unit:'%'},
  DDC:  {name:'DDC điều khiển tầng',    proto:'BACnet IP',          unit:'%'},
  FD:   {name:'Van chặn lửa (FD)',      proto:'Tiếp điểm về DDC',   unit:''},
  SD:   {name:'Miệng gió hút khói',     proto:'Tiếp điểm về DDC',   unit:''},
};
