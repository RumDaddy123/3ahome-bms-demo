// ===================== BMS vận hành: 3D tổng quan + mặt bằng 2D + sơ đồ trục =====================
window.__initBMS = function(){
const $ = s => document.querySelector(s);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const rnd=(a,b)=>a+Math.random()*(b-a);
const COL={ok:'#2BD37A', warn:'#F5B23C', alarm:'#FF5A5A', off:'#5A6678'};
const HEX={ok:0x2BD37A, warn:0xF5B23C, alarm:0xFF5A5A, off:0x5A6678};
const ST_VN={ok:'Bình thường', warn:'Cảnh báo', alarm:'Sự cố', off:'Mất kết nối'};
const worstOf = ds => ds.reduce((m,d)=>d.status==='alarm'?'alarm':((d.status==='warn'||d.status==='off')&&m!=='alarm'?(d.status==='off'?'off':'warn'):m),'ok');

const view={tab:'tower', floor:'F10', sub:'plan', sel:null, alFilter:'all', ackFor:null,
  shelveFor:null, opSub:'health', wkFilter:'open', wkFor:null, fddCat:'all'};
const OPS = { role:'operator', connected:true, lastTick:Date.now(), kwh:0,
  sched:{on:'07:00', off:'18:00', mode:'auto', sat:true, sun:false},
  handover:[{t:new Date(Date.now()-3600*1000*5), who:'Ca sáng', txt:'Đã kiểm tra chiller 1, dầu bình thường. FCU tầng 3 còn kêu, đã báo kỹ thuật.'}] };
const ROLE_VN={operator:'Vận hành',tech:'Kỹ thuật',viewer:'Khách'};
if (window.SITE){ const c=SITE.cfg;
  BLD.name = c.building.name || BLD.name;
  OPS.sched.on=c.ops.schedOn; OPS.sched.off=c.ops.schedOff; OPS.sched.sat=c.ops.sat; OPS.sched.sun=c.ops.sun; }
const GIA_KWH = (window.SITE?SITE.kwhPrice:0) || 3200;
const logSite = (kind,rec)=>{ if(window.SITE) SITE.write(kind, rec); };
const hhmm = d => String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
function inSchedule(){ const now=new Date(), dow=now.getDay(), t=hhmm(now);
  if (OPS.sched.mode==='on') return true; if (OPS.sched.mode==='off') return false;
  if (dow===0 && !OPS.sched.sun) return false; if (dow===6 && !OPS.sched.sat) return false;
  return t>=OPS.sched.on && t<OPS.sched.off; }
function prioOf(d){
  if (['SPF','SEF','MAF','CTRL','SD'].includes(d.t) && d.status==='alarm') return 1;      // hệ cứu hoả
  if (d.t==='PANEL' && d.status==='alarm') return 1;                                       // mất pha / tủ điện
  if (d.status==='off' && ['DDC','PANEL'].includes(d.t)) return 1;
  if (d.status==='alarm') return inSchedule()?2:3;
  return 3; }
const PRIO_VN={1:'P1 khẩn',2:'P2 cần xử lý',3:'P3 theo dõi'};
const canCmd = lvl => OPS.role==='tech' || (OPS.role==='operator' && lvl!=='tech');
function initF3(){ if(initF3.done||!window.F3) return; initF3.done=true;
  F3.init({devices, floorOf, HEX, worstOf, selected:()=>view.sel, onPick:d=>openDev(d)}); }

// ---------- dữ liệu ----------
const devices=[], auditLog=[]; let uid=0;
const mk=o=>{o.id='d'+(uid++); o.hist=[]; o.status='ok'; devices.push(o); return o;};
const floorOf=id=>BLD.floors.find(f=>f.id===id);
// trục đứng: 2 trục BACnet MSTP (trục A: hầm→tầng 12, trục B: tầng 13→mái) + trục IP về server
BLD.floors.forEach((f,i)=>{ f.idx=i; f.trunk = i<=13 ? 'A' : 'B'; f.rooms = planRooms(f.kind); });
BLD.floors.forEach(f=>{
  f.rooms.forEach((r,ri)=>{
    if (['office','meeting','retail','lobby','pantry','bms'].includes(r.kind)){
      mk({t:'FCU',floor:f.id,room:ri,tag:`${f.id}-${String(ri+1).padStart(2,'0')}-FCU`,st:{run:true,fan:['Thấp','Vừa','Cao'][ri%3],hours:Math.round(rnd(800,9000)),filter:rnd(12,72)}});
      mk({t:'TS', floor:f.id,room:ri,tag:`${f.id}-${String(ri+1).padStart(2,'0')}-TS`, meeting:r.kind==='meeting',
        cap:{meeting:10,office:16,lobby:30,retail:20,pantry:8,bms:3}[r.kind]||10,
        st:{temp:24+rnd(-.8,.8),sp:24,rh:rnd(52,64),co2:rnd(430,760)}});
      mk({t:'CV', floor:f.id,room:ri,tag:`${f.id}-${String(ri+1).padStart(2,'0')}-CV`, st:{open:rnd(25,70),dp:rnd(38,62)}});
    }
    if (r.kind==='stair') mk({t:'SD',floor:f.id,room:ri,tag:`${f.id}-${r.n.includes('A')?'A':'B'}-FD`,st:{open:false}});
  });
  if (!['roof','tech'].includes(f.kind)){
    const ri=f.rooms.findIndex(r=>['elecshaft','elec','hall','lift'].includes(r.kind));
    mk({t:'DDC',floor:f.id,room:Math.max(0,ri),tag:`${f.id}-DDC-01`,st:{cpu:rnd(18,44),pts:f.rooms.length*6+10}});
  }
  (DWG_DEVICES[f.id]||[]).forEach(([tag,kind])=>{
    const want = (kind==='PANEL'||kind==='CTRL') ? ['elecshaft','elec','pump','fanroom','hall','lifttech'] : ['shaft','fanroom','stair','roofdeck','garage','lifttech'];
    let ri=f.rooms.findIndex(r=>want.includes(r.kind)); if(ri<0) ri=0;
    const st = kind==='PANEL'?{amp:rnd(12,48),v:rnd(376,392)} : kind==='CTRL'?{fd:Math.round(rnd(6,14)),ok:true} : {run:false,pa:rnd(0,6),hours:Math.round(rnd(100,2600))};
    mk({t:kind,floor:f.id,room:ri,tag,fromDwg:true,st});
  });
});
(()=>{ const f=t=>devices.filter(d=>d.t===t);
  const cv=f('CV'); if(cv[11]){cv[11].fault='Van kẹt 100%'; cv[11].st.open=100;}
  const fc=f('FCU'); if(fc[6]){fc[6].fault='Chênh áp lọc gió cao'; fc[6].st.filter=96;}
  if(fc[23]){fc[23].offline=true; fc[23].fault='Mất kết nối MSTP';}
  if(fc[24]){fc[24].offline=true; fc[24].fault='Mất kết nối MSTP';}
  const ts=f('TS'); if(ts[9]) ts[9].drift=3.2; if(ts[31]) ts[31].drift=1.8;
  const p=devices.find(d=>d.tag==='TĐ.TG1-3'); if(p) p.fault='Mất pha L2';
  if(ts[17]){ ts[17].flat=true; ts[17].st.temp=23.6; }            // cảm biến treo giá trị
  ts.forEach((d,i)=>{ if(i%7===3){ d.wireless=true; d.batt=Math.round(rnd(18,100)); d.battPerDay=+rnd(.06,.16).toFixed(3); } });
  if(ts[3]) ts[3].batt=9; if(ts[10]) ts[10].batt=16;               // hai cảm biến sắp hết pin
  const nw=fc[14]; if(nw){ const v=devices.find(x=>x.t==='CV'&&x.floor===nw.floor&&x.room===nw.room);
    if(v){ v.fault='Van không mở'; v.st.open=2; } }                // FCU chạy mà không có nước lạnh
  const sp=devices.find(d=>d.t==='SPF'); if(sp){ sp.st.run=true; sp.st.pa=5; sp.stuckPa=true; }
  const ts2=f('TS'); if(ts2[41]){ ts2[41].stuffy=true; ts2[41].st.co2=1280; }   // phòng đông người, thiếu khí tươi
  const pn=f('PANEL'); if(pn[2]){ pn[2].heavy=true; pn[2].st.amp=47; }          // tủ điện tải cao kéo dài
})();
function statusOf(d){ if(d.offline) return 'off';
  switch(d.t){
    case 'TS':{const e=Math.abs(d.st.temp-d.st.sp); return e>2.5||d.st.co2>1100?'alarm':(e>1.4||d.st.co2>900?'warn':'ok');}
    case 'CV': return d.fault?'alarm':(d.st.open>92?'warn':'ok');
    case 'FCU': return d.fault?(d.st.filter>95?'alarm':'warn'):(d.st.filter>85?'warn':'ok');
    case 'DDC': return d.st.cpu>82?'warn':'ok';
    case 'PANEL': return d.fault?'alarm':(d.st.amp>44?'warn':'ok');
    case 'CTRL': return d.st.ok?'ok':'alarm';
    case 'SD': return d.st.open?'warn':'ok';
    default: return d.fault?'alarm':(d.st.run?'warn':'ok');
  } }
const mainVal=d=>({TS:d.st.temp,CV:d.st.open,FCU:d.st.filter,DDC:d.st.cpu,PANEL:d.st.amp}[d.t] ?? (d.st.pa!=null?d.st.pa:null));
function mainTxt(d){ switch(d.t){
  case 'TS': return d.st.temp.toFixed(1)+'°C'; case 'CV': return Math.round(d.st.open)+'%';
  case 'FCU': return d.offline?'mất KN':(d.st.run?d.st.fan:'Tắt'); case 'DDC': return Math.round(d.st.cpu)+'%';
  case 'PANEL': return Math.round(d.st.amp)+' A'; case 'CTRL': return d.st.fd+' FD';
  case 'SD': return d.st.open?'Mở':'Đóng'; default: return d.st.run?Math.round(d.st.pa)+' Pa':'Dừng'; } }
const logCmd=t=>{auditLog.unshift({t:new Date(),txt:t}); if(auditLog.length>40) auditLog.pop();};
function tick(){
  if(!OPS.connected) return;                       // mô phỏng mất kết nối: dữ liệu đứng yên
  OPS.lastTick=Date.now();
  const open=inSchedule();
  const kwTgt = (window.EN?EN.baseline(new Date().getHours(), open):120)*(open?1.02:1.2);
  const ampTgt = kwTgt/(PANEL_N*.38*1.73);
  OPS.kwh += devices.filter(d=>d.t==='PANEL').reduce((s,d)=>s+d.st.amp*.38*1.73,0)*(1.5/3600);
  devices.forEach(d=>{ if(d.offline) return;
    if(d.t==='FCU' && !d.fault){ d.st.run=open; }
    if(d.t==='TS'){ const ns=(open?24:28)+(d.setback||0);
      if(ns!==d.st.sp){ d.st.sp=ns; d.spAt=Date.now(); } }
  switch(d.t){
    case 'TS':{const tg=d.st.sp+(d.drift||0); if(!d.flat) d.st.temp+=(tg-d.st.temp)*.12+rnd(-.09,.09);
      d.st.rh=clamp(d.st.rh+rnd(-.5,.5),45,72);
      const nw=Date.now();
      if(d.occT==null||nw>d.occT){
        const p = open ? (d.meeting?.34:.72) : .03;
        d.occN = d.stuffy ? d.cap : (Math.random()<p ? Math.round(rnd(1,d.cap)) : 0);
        d.occT = nw + (d.occN ? rnd(120,420) : rnd(240,660))*1000; }
      const ctg = 420 + (d.occN||0)/d.cap*(d.stuffy?900:370);
      d.st.co2=clamp(d.st.co2+(ctg-d.st.co2)*.09+rnd(-7,7),400,1700); break;}
    case 'CV': if(!d.fault) d.st.open=clamp(d.st.open+rnd(-4,4),8,95); d.st.dp=clamp(d.st.dp+rnd(-1.5,1.5),30,70); break;
    case 'FCU': if(!d.fault) d.st.filter=clamp(d.st.filter+.02,5,99); break;
    case 'DDC': d.st.cpu=clamp(d.st.cpu+rnd(-3,3),10,92); break;
    case 'PANEL': { const tgt = ampTgt*(d.heavy?1.75:1)*rnd(.88,1.12);
      d.st.amp=clamp(d.st.amp+(tgt-d.st.amp)*.14+rnd(-1.2,1.2),2,56);
      d.st.v=clamp(d.st.v+rnd(-2,2),370,400); break; }
    case 'SPF': case 'SEF': case 'MAF': case 'EF': d.st.pa = d.stuckPa?clamp(d.st.pa+rnd(-1,1),2,9)
        : d.st.run?clamp((d.st.pa||40)+rnd(-3,3),35,62):clamp(d.st.pa*.8,0,6); break;
  }
  d.status=statusOf(d);
  const v=mainVal(d); if(v!=null){ d.hist.push(v); if(d.hist.length>90) d.hist.shift(); } });
  runModules(open); }
function runModules(open){
  if(window.AL)  AL.sync(devices, prioOf);
  if(window.HLT) HLT.observe(devices, mainVal);
  if(window.EN)  EN.sample(devices.filter(d=>d.t==='PANEL').reduce((s,d)=>s+d.st.amp*.38*1.73,0), open);
  if(window.OCC) OCC.run(devices, floorOf, open, (dev,back)=>{ dev.setback=back; });
}
devices.forEach(d=>{ d.status=statusOf(d); });
const PANEL_N = Math.max(1, devices.filter(d=>d.t==='PANEL').length);
const floorDevs = id => devices.filter(d=>d.floor===id);

// ---------- 3D: chỉ dùng cho tổng quan toà nhà ----------
const stage=$('#stage');
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
renderer.outputEncoding=THREE.sRGBEncoding; renderer.setClearColor(0x000000,0);
stage.insertBefore(renderer.domElement, stage.firstChild);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(36,1,.5,1200);
const orbit={th:.7,ph:1.14,dist:200,tgt:new THREE.Vector3()};
scene.add(new THREE.HemisphereLight(0xA9BCD8,0x0B0F16,1.05));
const kl=new THREE.DirectionalLight(0xffffff,.5); kl.position.set(70,140,60); scene.add(kl);
const H=BLD.H, N=BLD.floors.length, TH=N*H;
const slabGeo=new THREE.BoxGeometry(BLD.W+.6,BLD.slab,BLD.D+.6);
const slabMat=new THREE.MeshStandardMaterial({color:0x33415A,roughness:.95});
const slabs=new THREE.InstancedMesh(slabGeo,slabMat,N); slabs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
const _m=new THREE.Matrix4(),_p=new THREE.Vector3(),_q=new THREE.Quaternion(),_s=new THREE.Vector3(1,1,1),_c=new THREE.Color();
BLD.floors.forEach((f,i)=>{ _p.set(0,i*H,0); _m.compose(_p,_q,_s); slabs.setMatrixAt(i,_m); });
slabs.instanceMatrix.needsUpdate=true; scene.add(slabs);
const core=new THREE.Mesh(new THREE.BoxGeometry(14,TH,10),new THREE.MeshStandardMaterial({color:0x8C98AE,roughness:.9}));
core.position.y=TH/2; scene.add(core);
const glass=new THREE.Mesh(new THREE.BoxGeometry(BLD.W,TH-.4,BLD.D),new THREE.MeshStandardMaterial({color:0x6FA6C9,transparent:true,opacity:.13,roughness:.1,metalness:.5,side:THREE.DoubleSide,depthWrite:false}));
glass.position.y=TH/2; scene.add(glass);
const grid=new THREE.GridHelper(260,30,0x1C2634,0x161E2A); grid.position.y=-.5; scene.add(grid);
// cột cảnh báo nổi bên cạnh toà nhà
const markGeo=new THREE.SphereGeometry(1.25,12,10);
const marks=new THREE.InstancedMesh(markGeo,new THREE.MeshBasicMaterial({color:0xffffff}),N);
marks.count=0; scene.add(marks);
let dirty=true;
function paint3D(){
  let m=0;
  BLD.floors.forEach((f,i)=>{
    const w=worstOf(floorDevs(f.id));
    _c.set(w==='ok'?'#33415A':COL[w]); slabs.setColorAt(i,_c);
    if (w!=='ok'){ _p.set(BLD.W/2+3.2, i*H+1.2, 0); _m.compose(_p,_q,_s); marks.setMatrixAt(m,_m); marks.setColorAt(m,_c); m++; }
  });
  marks.count=m; slabs.instanceColor.needsUpdate=true;
  if (marks.instanceColor) marks.instanceColor.needsUpdate=true;
  marks.instanceMatrix.needsUpdate=true; dirty=true;
}
function updateCam(){ const {th,ph,dist,tgt}=orbit;
  camera.position.set(tgt.x+dist*Math.sin(ph)*Math.sin(th),tgt.y+dist*Math.cos(ph),tgt.z+dist*Math.sin(ph)*Math.cos(th)); camera.lookAt(tgt); }
function fit3D(){ const asp=Math.max(.35,(stage.clientWidth||1)/(stage.clientHeight||1));
  const R=Math.sqrt((BLD.W/2)**2+(BLD.D/2)**2+(TH/2)**2);
  orbit.dist=clamp(R/Math.sin(camera.fov*Math.PI/360)*(asp<1?1.12:.98),40,900); orbit.tgt.set(0,TH/2,0); dirty=true; }
function resize3D(){ const w=stage.clientWidth,h=stage.clientHeight; if(!w||!h) return;
  renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); dirty=true; }
new ResizeObserver(()=>{resize3D(); fit3D();}).observe(stage);
const ptrs=new Map(); let drag=null,moved=0,pinch=null; const el=renderer.domElement; el.style.cursor='grab';
el.addEventListener('pointerdown',e=>{ el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptrs.size===1){drag={x:e.clientX,y:e.clientY,th:orbit.th,ph:orbit.ph}; moved=0;}
  else if(ptrs.size===2){const [a,b]=[...ptrs.values()]; pinch={d:Math.hypot(a.x-b.x,a.y-b.y),dist:orbit.dist}; drag=null;} });
el.addEventListener('pointermove',e=>{ if(!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&ptrs.size===2){const [a,b]=[...ptrs.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y); orbit.dist=clamp(pinch.dist*pinch.d/Math.max(d,1),25,900); dirty=true; return;}
  if(!drag) return; const dx=e.clientX-drag.x,dy=e.clientY-drag.y; moved=Math.max(moved,Math.abs(dx)+Math.abs(dy));
  orbit.th=drag.th-dx*.006; orbit.ph=clamp(drag.ph-dy*.005,.15,1.5); dirty=true; });
function endP(e){ ptrs.delete(e.pointerId); if(ptrs.size<2) pinch=null; if(drag&&moved<7) pick3D(e); drag=null; }
el.addEventListener('pointerup',endP); el.addEventListener('pointercancel',endP);
el.addEventListener('wheel',e=>{e.preventDefault(); orbit.dist=clamp(orbit.dist*(1+Math.sign(e.deltaY)*.09),25,900); dirty=true;},{passive:false});
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
function pick3D(e){ const r=el.getBoundingClientRect(); ndc.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);
  ray.setFromCamera(ndc,camera); const hit=ray.intersectObject(slabs,false)[0];
  if(hit) openFloor(BLD.floors[hit.instanceId].id); }
let visible=true; new IntersectionObserver(en=>{visible=en[0].isIntersecting; if(visible) dirty=true;}).observe(stage);
let last=performance.now(),fAcc=0,fCnt=0,drawn=0,samples=[],bench={on:false};
(function loop(now){ requestAnimationFrame(loop); now=now||performance.now(); const dt=now-last; last=now;
  if(bench.on){ orbit.th+=dt*.00028; dirty=true; samples.push(dt); }
  fAcc+=dt; fCnt++;
  if(fAcc>=600){ const fe=$('#fps'), info=renderer.info.render;
    if(document.hidden||view.tab!=='tower') fe.textContent='';
    else if(drawn<2) fe.innerHTML=`Nghỉ · ${info.calls} lệnh vẽ`;
    else { const f=Math.round(1000*fCnt/fAcc); fe.innerHTML=`FPS <b>${f}</b> · ${(info.triangles/1000).toFixed(0)}k tam giác · ${info.calls} lệnh vẽ`; }
    fAcc=0;fCnt=0;drawn=0; }
  if(!visible||!dirty||view.tab!=='tower') return; dirty=false; drawn++; updateCam(); renderer.render(scene,camera);
})();

// ---------- trạng thái giao diện ----------
const toast=t=>{const e=$('#toast'); e.textContent=t; e.classList.add('show'); clearTimeout(e._h); e._h=setTimeout(()=>e.classList.remove('show'),2200);};

// ---------- MẶT BẰNG 2D (SVG) ----------
const ICON={FCU:'▭', TS:'◗', CV:'◆', DDC:'▣', PANEL:'▤', CTRL:'▥', SD:'◍', SPF:'✛', SEF:'✛', MAF:'✛', EF:'✛'};
function planSVG(fid){
  const f=floorOf(fid), pad=14, SC=19;             // 19 px / m
  const W=BLD.W*SC+pad*2, Hh=BLD.D*SC+pad*2;
  const X=x=>pad+(x+BLD.W/2)*SC, Y=z=>pad+(z+BLD.D/2)*SC;
  let s=`<svg viewBox="0 0 ${W} ${Hh}" class="plan" preserveAspectRatio="xMidYMid meet">`;
  s+=`<rect x="2" y="2" width="${W-4}" height="${Hh-4}" rx="8" fill="#0E131C" stroke="#232C3B"/>`;
  // phòng
  f.rooms.forEach((r,ri)=>{
    const ds=floorDevs(fid).filter(d=>d.room===ri), w=worstOf(ds);
    const fill = w==='ok' ? '#182233' : (w==='alarm'?'rgba(255,90,90,.20)':w==='off'?'rgba(90,102,120,.22)':'rgba(245,178,60,.18)');
    const stroke = w==='ok' ? '#2B3purposes' : COL[w];
    s+=`<g class="room" data-ri="${ri}">`;
    s+=`<rect x="${X(r.x)}" y="${Y(r.z)}" width="${r.w*SC}" height="${r.d*SC}" fill="${fill}" stroke="${w==='ok'?'#30405C':COL[w]}" stroke-width="${w==='ok'?1:2}"/>`;
    if (r.kind==='stair'){ for(let i=1;i<8;i++){ const y=Y(r.z)+i*(r.d*SC/8); s+=`<line x1="${X(r.x)+3}" y1="${y}" x2="${X(r.x+r.w)-3}" y2="${y}" stroke="#44556F" stroke-width="1"/>`; } }
    if (r.kind==='lift'){ for(let i=0;i<4;i++){ const x=X(r.x)+8+i*((r.w*SC-16)/4); s+=`<rect x="${x}" y="${Y(r.z)+4}" width="${(r.w*SC-16)/4-5}" height="16" fill="none" stroke="#5A6B86"/>`; } }
    if (r.kind==='shaft'||r.kind==='elecshaft'){ s+=`<line x1="${X(r.x)}" y1="${Y(r.z)}" x2="${X(r.x+r.w)}" y2="${Y(r.z+r.d)}" stroke="#55difference" />`; }
    const cx=X(r.x+r.w/2), cy=Y(r.z+r.d/2);
    if (r.w*SC>58) s+=`<text x="${cx}" y="${cy-2}" class="rn">${r.n}</text>`;
    s+=`</g>`;
    // cửa
    r.doors.forEach(([sd,p])=>{
      const dw=1.0*SC;
      if(sd==='n'||sd==='s'){ const x=X(r.x+p*r.w), y=Y(sd==='n'?r.z:r.z+r.d);
        s+=`<line x1="${x-dw/2}" y1="${y}" x2="${x+dw/2}" y2="${y}" stroke="#0E131C" stroke-width="4"/><path d="M${x-dw/2} ${y} a${dw} ${dw} 0 0 1 ${dw} ${sd==='n'?dw:-dw}" fill="none" stroke="#6B7C96"/>`; }
      else { const y=Y(r.z+p*r.d), x=X(sd==='w'?r.x:r.x+r.w);
        s+=`<line x1="${x}" y1="${y-dw/2}" x2="${x}" y2="${y+dw/2}" stroke="#0E131C" stroke-width="4"/><path d="M${x} ${y-dw/2} a${dw} ${dw} 0 0 1 ${sd==='w'?dw:-dw} ${dw}" fill="none" stroke="#6B7C96"/>`; }
    });
  });
  // thiết bị
  floorDevs(fid).forEach(d=>{
    const r=f.rooms[d.room]; if(!r) return;
    const o = devOffset(d, r);
    const x=X(o.x), y=Y(o.z), c=COL[d.status];
    const sz = d.fromDwg?9:6.5;
    s+=`<g class="dev ${d.status!=='ok'?'hot':''} ${view.sel===d?'sel':''}" data-id="${d.id}">`;
    s+=`<rect x="${x-sz}" y="${y-sz}" width="${sz*2}" height="${sz*2}" rx="${d.t==='TS'?sz:3}" fill="${c}" opacity="${d.status==='ok'?.85:1}" stroke="#0E131C" stroke-width="1.5"/>`;
    if (d.fromDwg && (d.status!=='ok' || r.w*19>70)) s+=`<text x="${x}" y="${y-12}" class="dt">${d.tag}</text>`;
    s+=`<title>${d.tag} · ${ST_VN[d.status]} · ${mainTxt(d)}</title></g>`;
  });
  s+='</svg>';
  return s.replace('#2B3purposes','#30405C').replace('stroke="#55difference" ','stroke="#3A4A66" stroke-dasharray="3 3"');
}
function devOffset(d,r){
  const cx=r.x+r.w/2, cz=r.z+r.d/2;
  switch(d.t){ case 'FCU': return {x:cx, z:cz-.6}; case 'TS': return {x:r.x+.8, z:cz};
    case 'CV': return {x:cx+1.4, z:cz-.6}; case 'DDC': return {x:r.x+r.w-.8, z:cz};
    case 'SD': return {x:cx, z:r.z+.7}; case 'PANEL': return {x:r.x+1.0, z:r.z+.9};
    case 'CTRL': return {x:r.x+2.4, z:r.z+.9}; default: return {x:cx, z:cz+1.0}; }
}
// ---------- SƠ ĐỒ TRỤC (SVG) ----------
function riserSVG(fid){
  const f=floorOf(fid), ds=floorDevs(fid);
  const ddc=ds.find(d=>d.t==='DDC'), panel=ds.find(d=>d.t==='PANEL');
  const groups={}; ds.filter(d=>['FCU','TS','CV','SD'].includes(d.t)).forEach(d=>{ const r=f.rooms[d.room]; (groups[r?r.n:'—']=groups[r?r.n:'—']||[]).push(d); });
  const fans = ds.filter(d=>['SPF','SEF','MAF','EF'].includes(d.t));
  const rows=Object.entries(groups); const W=560, rowH=34, H2=120+rows.length*rowH+fans.length*rowH+30;
  const trunkX=96, ddcX=210, devX=330;
  const trunkOk = ddc ? ddc.status!=='off' : true;
  let s=`<svg viewBox="0 0 ${W} ${H2}" class="riser" preserveAspectRatio="xMinYMin meet">`;
  s+=`<defs><marker id="ar" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#6B7C96"/></marker></defs>`;
  // trục đứng
  s+=`<rect x="${trunkX-26}" y="14" width="52" height="${H2-28}" rx="8" fill="#141C28" stroke="#2F3A4D"/>`;
  s+=`<text x="${trunkX}" y="34" class="rt">TRỤC ${f.trunk}</text><text x="${trunkX}" y="50" class="rs">BACnet MSTP</text>`;
  s+=`<line x1="${trunkX}" y1="58" x2="${trunkX}" y2="${H2-40}" stroke="${trunkOk?COL.ok:COL.off}" stroke-width="4"/>`;
  s+=`<text x="${trunkX}" y="${H2-22}" class="rs">↓ tủ trung tâm · BMS server</text>`;
  // DDC tầng
  const ddcY=84;
  if (ddc){
    s+=`<g class="dev" data-id="${ddc.id}"><rect x="${ddcX-54}" y="${ddcY-20}" width="108" height="40" rx="8" fill="#1A2230" stroke="${COL[ddc.status]}" stroke-width="2"/>`;
    s+=`<text x="${ddcX}" y="${ddcY-4}" class="rl">DDC tầng</text><text x="${ddcX}" y="${ddcY+12}" class="rv">${ddc.tag}</text></g>`;
    s+=`<line x1="${trunkX+26}" y1="${ddcY}" x2="${ddcX-54}" y2="${ddcY}" stroke="${COL[ddc.status]}" stroke-width="3" marker-end="url(#ar)"/>`;
  }
  if (panel){
    s+=`<g class="dev" data-id="${panel.id}"><rect x="${ddcX-54}" y="${ddcY+30}" width="108" height="34" rx="8" fill="#1A2230" stroke="${COL[panel.status]}" stroke-width="2"/>`;
    s+=`<text x="${ddcX}" y="${ddcY+52}" class="rv">${panel.tag} · ${Math.round(panel.st.amp)}A</text></g>`;
    s+=`<line x1="${trunkX+26}" y1="${ddcY+47}" x2="${ddcX-54}" y2="${ddcY+47}" stroke="${COL[panel.status]}" stroke-width="3" marker-end="url(#ar)"/>`;
  }
  // nhánh tới phòng
  let y=150;
  rows.forEach(([rn,list])=>{
    const w=worstOf(list);
    s+=`<line x1="${ddcX+54}" y1="${ddcY}" x2="${devX-12}" y2="${y}" stroke="${w==='ok'?'#39465C':COL[w]}" stroke-width="${w==='ok'?1.5:2.5}"/>`;
    s+=`<g class="row" data-room="${rn}"><rect x="${devX-12}" y="${y-14}" width="${W-devX-6}" height="28" rx="7" fill="#151C27" stroke="${w==='ok'?'#2B3purposes':COL[w]}"/>`;
    s+=`<text x="${devX}" y="${y+5}" class="rl2">${rn}</text>`;
    list.forEach((d,i)=>{ const cx=devX+150+i*34;
      s+=`<g class="dev" data-id="${d.id}"><rect x="${cx-13}" y="${y-11}" width="26" height="22" rx="5" fill="${COL[d.status]}" opacity="${d.status==='ok'?.8:1}"/>`;
      s+=`<text x="${cx}" y="${y+4}" class="rb">${d.t}</text><title>${d.tag} · ${mainTxt(d)}</title></g>`; });
    s+=`</g>`; y+=rowH;
  });
  fans.forEach(d=>{
    s+=`<line x1="${trunkX+26}" y1="${y}" x2="${devX-12}" y2="${y}" stroke="${COL[d.status]}" stroke-width="2.5" stroke-dasharray="6 4"/>`;
    s+=`<g class="dev" data-id="${d.id}"><rect x="${devX-12}" y="${y-14}" width="${W-devX-6}" height="28" rx="7" fill="#151C27" stroke="${COL[d.status]}"/>`;
    s+=`<text x="${devX}" y="${y+5}" class="rl2">${d.tag}</text><text x="${W-20}" y="${y+5}" class="rr">${mainTxt(d)}</text></g>`;
    y+=rowH;
  });
  s+='</svg>';
  return s.replace(/#2B3purposes/g,'#2B3647');
}
// ---------- render các tab ----------
function renderTower(){
  const byType={}; devices.forEach(d=>{ const k=d.t; byType[k]=byType[k]||{n:0,bad:0}; byType[k].n++; if(d.status!=='ok') byType[k].bad++; });
  const bad = BLD.floors.map(f=>({f, ds:floorDevs(f.id).filter(d=>d.status!=='ok')})).filter(x=>x.ds.length)
    .sort((a,b)=>b.ds.filter(d=>d.status==='alarm').length-a.ds.filter(d=>d.status==='alarm').length || b.ds.length-a.ds.length);
  const trunk = t => { const ds=devices.filter(d=>floorOf(d.floor).trunk===t); return {n:ds.length, bad:ds.filter(d=>d.status!=='ok').length, off:ds.filter(d=>d.status==='off').length}; };
  const tA=trunk('A'), tB=trunk('B');
  $('#ovBody').innerHTML = `
    <div class="ovsec"><div class="ovh">Trục truyền thông</div>
      ${[['A',tA,'Hầm 2 → Tầng 12'],['B',tB,'Tầng 13 → Mái']].map(([k,t,rg])=>`
        <div class="trunk ${t.off?'off':t.bad?'warn':'ok'}"><b>Trục ${k}</b><span>${rg}</span>
          <i>${t.n} điểm${t.off?` · ${t.off} mất kết nối`:t.bad?` · ${t.bad} cảnh báo`:' · bình thường'}</i></div>`).join('')}
    </div>
    <div class="ovsec"><div class="ovh">Lỗi theo tầng (${bad.length} tầng)</div>
      ${bad.length? bad.slice(0,12).map(x=>{
        const al=x.ds.filter(d=>d.status==='alarm').length, of=x.ds.filter(d=>d.status==='off').length;
        return `<button class="frow" data-floor="${x.f.id}"><span class="dot" style="background:${al?COL.alarm:of?COL.off:COL.warn}"></span>
          <b>${x.f.name}</b><span class="fm">${x.ds.slice(0,2).map(d=>d.tag).join(', ')}${x.ds.length>2?` +${x.ds.length-2}`:''}</span>
          <i>${al?al+' sự cố':''}${al&&(x.ds.length-al)?' · ':''}${x.ds.length-al?(x.ds.length-al)+' cảnh báo':''}</i></button>`;
      }).join('') : '<p class="muted">Toàn bộ thiết bị bình thường.</p>'}
    </div>
    <div class="ovsec"><div class="ovh">Sức khoẻ hệ thống & năng lượng</div>
      ${(()=>{ const h=window.HLT&&HLT.last(), e=window.EN&&EN.stats(); if(!h||!e) return '';
        const p=HLT.score(h), [g,cls]=HLT.grade(p);
        return `<button class="frow" data-ops="health"><span class="dot" style="background:${COL[cls==='ok'?'ok':cls==='warn'?'warn':'alarm']}"></span>
            <b>Hệ BMS ${p}/100</b><span class="fm">${h.off.length} mất kết nối · ${h.stale.length} số liệu chết · ${h.lowBatt} pin yếu</span><i>xem →</i></button>
          <button class="frow" data-ops="energy"><span class="dot" style="background:${e.deltaNow>7?COL.warn:COL.ok}"></span>
            <b>${e.cur.kw.toFixed(0)} kW</b><span class="fm">${e.deltaNow>0?'+':''}${e.deltaNow.toFixed(0)}% so với chuẩn · ngoài giờ ${e.offShare.toFixed(0)}%</span><i>xem →</i></button>`; })()}
    </div>
    <div class="ovsec"><div class="ovh">Chẩn đoán tự động</div>
      ${(()=>{ const st=window.FDD?FDD.stats():{n:0,vnd:0};
        return st.n? `<button class="frow" id="goFdd"><span class="dot" style="background:var(--warn)"></span><b>${st.n} lỗi</b>
          <span class="fm">ước tính ${FDD.vnd(st.vnd)} đồng/tháng</span><i>xem →</i></button>`
        : '<p class="muted">Chưa phát hiện lỗi nào.</p>'; })()}
    </div>
    <div class="ovsec"><div class="ovh">Thiết bị theo loại</div>
      <div class="tgrid">${Object.entries(byType).map(([k,v])=>`<div class="tcell ${v.bad?'bad':''}"><b>${v.n}</b><span>${(DEV_INFO[k]||{name:k}).name.split('(')[0].trim()}</span>${v.bad?`<i>${v.bad}</i>`:''}</div>`).join('')}</div>
    </div>`;
  $('#ovBody').querySelectorAll('[data-floor]').forEach(b=>b.onclick=()=>openFloor(b.dataset.floor));
  const gf=$('#goFdd'); if(gf) gf.onclick=()=>setTab('fdd');
  $('#ovBody').querySelectorAll('[data-ops]').forEach(b=>b.onclick=()=>{ view.opSub=b.dataset.ops; setTab('ops'); });
}
function renderFloor(){
  const f=floorOf(view.floor), ds=floorDevs(view.floor);
  $('#flName').textContent=f.name;
  $('#flMeta').textContent=`${ds.length} điểm · trục ${f.trunk} · ${f.rooms.length} phòng`;
  const bad=ds.filter(d=>d.status!=='ok');
  $('#flBad').innerHTML = bad.length? bad.map(d=>`<button class="chipbad ${d.status}" data-id="${d.id}">${d.tag} · ${mainTxt(d)}</button>`).join('') : '<span class="muted">Không có lỗi trên tầng này</span>';
  const is3d = view.sub==='3d';
  $('#fl3d').hidden = !is3d; $('#flView').hidden = is3d;
  if (is3d){ initF3(); if(F3.isBuilt()!==view.floor) F3.build(view.floor); else { F3.paint(); F3.resize(); F3.fit(); } }
  else $('#flView').innerHTML = view.sub==='plan' ? planSVG(view.floor) : riserSVG(view.floor);
  $('#flView').querySelectorAll('[data-id]').forEach(g=>g.onclick=()=>{ const d=devices.find(x=>x.id===g.dataset.id); if(d) openDev(d); });
  $('#flView').querySelectorAll('.room').forEach(g=>g.onclick=e=>{ if(e.target.closest('[data-id]')) return;
    const list=floorDevs(view.floor).filter(d=>d.room===+g.dataset.ri); if(list.length) openDev(list[0]); });
  $('#flBad').querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>openDev(devices.find(x=>x.id===b.dataset.id)));
  document.querySelectorAll('#flSub button').forEach(b=>b.classList.toggle('on', b.dataset.sub===view.sub));
}
function fmtAge(ms){ const m=Math.round(ms/60000); return m<1?'vừa xong':m<60?m+' phút':Math.floor(m/60)+'h'+String(m%60).padStart(2,'0'); }

function renderAlarms(){
  const st=AL.stats(), L=AL.list(view.alFilter);
  const chip=(k,lb,n)=>`<button class="fchip ${view.alFilter===k?'on':''}" data-f="${k}">${lb}${n!=null?` <i>${n}</i>`:''}</button>`;
  $('#alBody').innerHTML = `
    <div class="fchips">${chip('all','Đang mở',st.n)}${chip('un','Chưa nhận',st.un)}${chip('p1','P1 khẩn',st.p1)}${chip('esc','Đã leo thang',st.esc)}${chip('chatter','Đang rung',st.chatter)}${chip('shelved','Tạm ẩn',st.shelved)}</div>
    ${st.esc?`<div class="escbar">⚠ ${st.esc} cảnh báo quá hạn chưa ai nhận, đã chuyển lên ${AL.ESC_TO[st.worstEsc]}</div>`:''}
    ${L.length?`<div class="list">${L.slice(0,40).map(a=>{
      const due=AL.dueIn(a), fl=floorOf(a.dev.floor), r=fl.rooms[a.dev.room];
      return `<div class="alrow p${a.prio} ${a.ack?'acked':''} ${a.esc?'esc':''}">
        <button class="alopen" data-id="${a.dev.id}">
          <span class="pbadge p${a.prio}">P${a.prio}</span>
          <span class="t"><b>${a.msg}</b>
            <span>${a.dev.tag} · ${fl.name}${r?' · '+r.n:''}</span></span>
          <span class="v">${new Date(a.firstAt).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</span></button>
        <div class="altags">
          <span class="atag">${fmtAge(Date.now()-a.firstAt)}</span>
          ${a.count>1?`<span class="atag rep">lặp ${a.count} lần</span>`:''}
          ${a.chatter?`<span class="atag chat">đang rung, đã gộp lại</span>`:''}
          ${a.state==='rtn'?`<span class="atag rtn">đã tự hết, chờ xác nhận</span>`:''}
          ${a.esc?`<span class="atag esc">leo thang cấp ${a.esc} → ${AL.ESC_TO[a.esc]}</span>`
            :(due!=null?`<span class="atag">còn ${due}s trước khi leo thang</span>`:'')}
          ${AL.shelved(a)?`<span class="atag shv">ẩn tới ${new Date(a.shelveUntil).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}${a.shelveWhy?' · '+a.shelveWhy:''}</span>`:''}
          ${a.ack?`<span class="atag ok">✓ ${a.ack.who} nhận lúc ${a.ack.at.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}${a.ack.note?' · '+a.ack.note:''}</span>`:''}
        </div>
        <div class="alacts">
          ${a.ack?'':`<button class="mini on" data-ackopen="${a.key}">Nhận xử lý</button>`}
          ${AL.shelved(a)?`<button class="mini" data-unshelve="${a.key}">Bỏ tạm ẩn</button>`:`<button class="mini" data-shvopen="${a.key}">Tạm ẩn</button>`}
          <button class="mini" data-mkwo="${a.key}">Tạo phiếu</button>
          <button class="mini" data-id="${a.dev.id}">Mở thiết bị</button>
        </div>
        ${view.ackFor===a.key?`<div class="ackbox"><input id="ackNote" placeholder="Ghi chú: đã gọi kỹ thuật, chờ vật tư…" autocomplete="off"><button class="mini on" data-ackdo="${a.key}">Lưu</button><button class="mini" data-ackcancel="1">Bỏ</button></div>`:''}
        ${view.shelveFor===a.key?`<div class="ackbox"><input id="shvWhy" placeholder="Lý do tạm ẩn, bắt buộc ghi" autocomplete="off">${[1,4,8].map(h=>`<button class="mini" data-shvdo="${a.key}" data-h="${h}">${h}h</button>`).join('')}<button class="mini" data-shvcancel="1">Bỏ</button></div>`:''}
        </div>`; }).join('')}</div>`
      : '<p class="muted">Không có cảnh báo nào trong nhóm này.</p>'}
    <div><div class="muted" style="margin:12px 0 6px">Nhật ký xử lý cảnh báo</div>
      ${AL.log.length?AL.log.slice(0,12).map(l=>`<div class="logline"><em>${l.t.toLocaleTimeString('vi-VN')}</em> · ${l.txt}</div>`).join(''):'<p class="muted">Chưa có thao tác nào.</p>'}</div>
    <div><div class="muted" style="margin:12px 0 6px">Nhật ký lệnh điều khiển</div>
      ${auditLog.length?auditLog.slice(0,10).map(l=>`<div class="logline"><em>${l.t.toLocaleTimeString('vi-VN')}</em> · ${l.txt}</div>`).join(''):'<p class="muted">Chưa có lệnh.</p>'}</div>`;
  const B=$('#alBody');
  B.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>openDev(devices.find(x=>x.id===b.dataset.id)));
  B.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{ view.alFilter=b.dataset.f; renderAlarms(); });
  B.querySelectorAll('[data-ackopen]').forEach(b=>b.onclick=()=>{
    if(OPS.role==='viewer'){ toast('Vai trò Khách không nhận xử lý được'); return; }
    view.ackFor=b.dataset.ackopen; view.shelveFor=null; renderAlarms(); const i=$('#ackNote'); if(i) i.focus(); });
  B.querySelectorAll('[data-ackcancel]').forEach(b=>b.onclick=()=>{ view.ackFor=null; renderAlarms(); });
  B.querySelectorAll('[data-ackdo]').forEach(b=>b.onclick=()=>{ const n=$('#ackNote');
    const aa=AL.ack(b.dataset.ackdo, ROLE_VN[OPS.role], n?n.value.trim():'');
    if(aa) logSite('alarm.ack', {tag:aa.dev.tag, msg:aa.msg, by:ROLE_VN[OPS.role], note:n?n.value.trim():''});
    view.ackFor=null; renderAlarms(); renderHeader(); toast('Đã nhận xử lý'); });
  B.querySelectorAll('[data-shvopen]').forEach(b=>b.onclick=()=>{
    if(OPS.role==='viewer'){ toast('Vai trò Khách không tạm ẩn được'); return; }
    view.shelveFor=b.dataset.shvopen; view.ackFor=null; renderAlarms(); const i=$('#shvWhy'); if(i) i.focus(); });
  B.querySelectorAll('[data-shvcancel]').forEach(b=>b.onclick=()=>{ view.shelveFor=null; renderAlarms(); });
  B.querySelectorAll('[data-shvdo]').forEach(b=>b.onclick=()=>{ const w=$('#shvWhy'), why=w?w.value.trim():'';
    if(!why){ toast('Phải ghi lý do thì mới tạm ẩn được'); return; }
    const sa=AL.shelve(b.dataset.shvdo, +b.dataset.h, why, ROLE_VN[OPS.role]);
    if(sa) logSite('alarm.shelve', {tag:sa.dev.tag, hours:+b.dataset.h, why, by:ROLE_VN[OPS.role]});
    view.shelveFor=null; renderAlarms(); renderHeader();
    toast(`Đã tạm ẩn ${b.dataset.h} giờ, hết hạn sẽ báo lại`); });
  B.querySelectorAll('[data-unshelve]').forEach(b=>b.onclick=()=>{ AL.unshelve(b.dataset.unshelve, ROLE_VN[OPS.role]); renderAlarms(); renderHeader(); });
  B.querySelectorAll('[data-mkwo]').forEach(b=>b.onclick=()=>woFromAlarm(b.dataset.mkwo));
}
function woFromAlarm(key){
  if(OPS.role==='viewer'){ toast('Vai trò Khách không tạo phiếu được'); return; }
  const a=AL.get(key); if(!a) return;
  const fl=floorOf(a.dev.floor), r=fl.rooms[a.dev.room];
  const w=WK.create({title:a.msg, dev:a.dev, src:'alarm', prio:a.prio, by:ROLE_VN[OPS.role],
    detail:`${a.dev.tag} · ${fl.name}${r?' · '+r.n:''} · phát sinh ${new Date(a.firstAt).toLocaleString('vi-VN')}`});
  a.wo=w.no; logCmd(`Tạo phiếu ${w.no} từ cảnh báo ${a.dev.tag}`);
  logSite('wo.create', {no:w.no, title:w.title, tag:a.dev.tag, src:'alarm', by:ROLE_VN[OPS.role]});
  renderAlarms(); toast('Đã tạo '+w.no+', xem ở Vận hành › Công việc');
}
function renderHeader(){
  const on=devices.filter(d=>!d.offline).length;
  $('#kOnline').textContent=on+'/'+devices.length;
  $('#kWarn').textContent=devices.filter(d=>d.status==='warn').length;
  $('#kAlarm').textContent=devices.filter(d=>['alarm','off'].includes(d.status)).length;
  $('#kPower').textContent=Math.round(devices.filter(d=>d.t==='PANEL').reduce((s,d)=>s+d.st.amp*.38*1.73,0));
  const hs=window.HLT&&HLT.last(); const kh=$('#kHealth');
  if(kh&&hs){ const p=HLT.score(hs); kh.textContent=p; kh.parentElement.className='kpi '+HLT.grade(p)[1]; }
  const n=window.AL?AL.stats().un:0;
  const b=$('#tabBadge'); b.hidden=!n; b.textContent=n;
  const age=Math.round((Date.now()-OPS.lastTick)/1000);
  const st=$('#connState'); if(st){ st.textContent = OPS.connected?`cập nhật ${age}s trước`:'MẤT KẾT NỐI'; st.className='conn '+(OPS.connected?(age>20?'stale':'ok'):'bad'); }
  const rl=$('#roleChip'); if(rl) rl.textContent=ROLE_VN[OPS.role];
}
function renderRail(){
  $('#floors').innerHTML = BLD.floors.slice().reverse().map(f=>{
    const w=worstOf(floorDevs(f.id));
    return `<button data-f="${f.id}" class="${view.tab==='floor'&&view.floor===f.id?'on':''}">${f.id.replace('F','')}${w!=='ok'?`<span class="dot" style="background:${COL[w]}"></span>`:''}</button>`;
  }).join('');
}
// ---------- điều hướng ----------
function setTab(t){ view.tab=t;
  ['tower','floor','alarms','fdd','ops'].forEach(k=>{ const p=$('#pane-'+k); if(p) p.hidden = k!==t; });
  document.querySelectorAll('.tabbar button').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
  const rail=$('#floors'); rail.hidden = t!=='floor' && t!=='tower';
  const host = t==='tower' ? $('#stage') : $('#pane-floor');
  if (!rail.hidden && rail.parentElement!==host) host.appendChild(rail);
  if(t==='tower'){ dirty=true; resize3D(); fit3D(); renderTower(); }
  if(t==='floor') renderFloor();
  if(t==='alarms') renderAlarms();
  if(t==='fdd') renderFDD();
  if(t==='ops') renderOps();
  renderRail();
}
function openFloor(fid){ view.floor=fid; setTab('floor'); }
function openDev(d){ if(!d) return; view.sel=d;
  if (view.floor!==d.floor || view.tab!=='floor'){ view.floor=d.floor; setTab('floor'); }
  else renderFloor();
  if (view.sub==='3d' && window.F3) F3.paint();
  renderSheet(d); $('#sheet').classList.add('open');
  toast(`${floorOf(d.floor).name} · ${d.tag}`); }
$('#shClose').onclick=()=>{ $('#sheet').classList.remove('open'); view.sel=null; };
$('#floors').addEventListener('click',e=>{const b=e.target.closest('[data-f]'); if(b) openFloor(b.dataset.f);});
document.querySelectorAll('.tabbar button').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
$('#flSub').addEventListener('click',e=>{const b=e.target.closest('[data-sub]'); if(!b) return; view.sub=b.dataset.sub; renderFloor();});
$('#flBack').onclick=()=>setTab('tower');

// ---------- bảng chi tiết thiết bị ----------
function spark(cv,h){ const w=cv.width=cv.clientWidth*2, hh=cv.height=120, g=cv.getContext('2d'); g.clearRect(0,0,w,hh);
  if(h.length<2) return; const mn=Math.min(...h),mx=Math.max(...h),pd=(mx-mn)*.2+.001,lo=mn-pd,hi=mx+pd;
  const X=i=>i/(h.length-1)*w, Y=v=>hh-(v-lo)/(hi-lo)*hh;
  const gr=g.createLinearGradient(0,0,0,hh); gr.addColorStop(0,'rgba(39,200,214,.3)'); gr.addColorStop(1,'rgba(39,200,214,0)');
  g.beginPath(); g.moveTo(0,hh); h.forEach((v,i)=>g.lineTo(X(i),Y(v))); g.lineTo(w,hh); g.closePath(); g.fillStyle=gr; g.fill();
  g.beginPath(); h.forEach((v,i)=>i?g.lineTo(X(i),Y(v)):g.moveTo(X(i),Y(v))); g.strokeStyle='#27C8D6'; g.lineWidth=3; g.stroke(); }
function renderSheet(d){
  const f=floorOf(d.floor), r=f.rooms[d.room], info=DEV_INFO[d.t]||{name:d.t,proto:''};
  $('#shTitle').textContent = d.fromDwg? info.name : `${r?r.n:''} · ${info.name}`;
  $('#shTag').innerHTML = `${d.tag} · ${info.proto}${d.fromDwg?' · <b style="color:var(--accent)">theo bản vẽ</b>':''}`;
  const p=$('#shPill'); p.hidden=false; p.className='pill '+d.status; p.textContent=ST_VN[d.status];
  const V=(l,v,u='')=>`<div class="val"><span>${l}</span><b>${v}<small>${u}</small></b></div>`;
  let vals='';
  if(d.t==='TS') vals=V('Nhiệt độ',d.st.temp.toFixed(1),'°C')+V('Cài đặt',d.st.sp.toFixed(1),'°C')+V('Độ ẩm',Math.round(d.st.rh),'%')+V('CO₂',Math.round(d.st.co2),' ppm');
  if(d.t==='FCU') vals=V('Trạng thái',d.offline?'Mất kết nối':(d.st.run?'Chạy':'Dừng'))+V('Quạt',d.st.fan)+V('Giờ chạy',d.st.hours.toLocaleString('vi-VN'),' h')+V('Chênh áp lọc',Math.round(d.st.filter),'%');
  if(d.t==='CV') vals=V('Độ mở van',Math.round(d.st.open),'%')+V('Chênh áp',Math.round(d.st.dp),' kPa');
  if(d.t==='DDC') vals=V('Tải CPU',Math.round(d.st.cpu),'%')+V('Số điểm',d.st.pts)+V('Trục',f.trunk)+V('Kết nối','Online');
  if(d.t==='PANEL') vals=V('Dòng tải',Math.round(d.st.amp),' A')+V('Điện áp',Math.round(d.st.v),' V')+V('Tầng',f.name)+V('Vị trí',r?r.n:'-');
  if(d.t==='CTRL') vals=V('Van chặn lửa',d.st.fd,' bộ')+V('Trạng thái',d.st.ok?'Sẵn sàng':'Lỗi');
  if(d.t==='SD') vals=V('Miệng hút khói',d.st.open?'Mở':'Đóng')+V('Tầng',f.name);
  if(['SPF','SEF','MAF','EF'].includes(d.t)) vals=V('Trạng thái',d.st.run?'Đang chạy':'Dừng')+V('Áp suất',Math.round(d.st.pa),' Pa')+V('Giờ chạy',d.st.hours.toLocaleString('vi-VN'),' h')+V('Tầng',f.name);
  let ctl='';
  if(d.t==='TS') ctl=`<div class="ctl"><div class="row"><b>Nhiệt độ cài đặt</b><div class="step"><button data-cmd="sp-">−</button><b>${d.st.sp.toFixed(1)}°C</b><button data-cmd="sp+">+</button></div></div></div>`;
  if(d.t==='FCU') ctl=`<div class="ctl"><div class="row"><b>Tốc độ quạt</b></div><div class="seg">${['Tắt','Thấp','Vừa','Cao'].map(x=>`<button data-cmd="fan:${x}" class="${(d.st.run?d.st.fan:'Tắt')===x?'on':''}">${x}</button>`).join('')}</div></div>`;
  if(['SPF','SEF','MAF','EF'].includes(d.t)) ctl=`<div class="ctl"><div class="row"><b>Lệnh quạt</b></div><div class="seg"><button data-cmd="fanon" class="${d.st.run?'on':''}">Chạy</button><button data-cmd="fanoff" class="${!d.st.run?'on':''}">Dừng</button></div><p class="muted">Khi có cháy, tín hiệu từ tủ báo cháy ưu tiên hơn lệnh tay.</p></div>`;
  const chain = `<div class="ctl"><div class="row"><b>Đường kết nối</b></div><div class="chain">
      <span class="${d.status==='off'?'bad':''}">${d.tag}</span><i>→</i>
      <span>${(floorDevs(d.floor).find(x=>x.t==='DDC')||{tag:'DDC tầng'}).tag}</span><i>→</i>
      <span>Trục ${f.trunk}</span><i>→</i><span>Tủ trung tâm</span><i>→</i><span>BMS server</span></div></div>`;
  $('#shBody').innerHTML = `${d.fault?`<div class="ctl" style="border-color:rgba(255,90,90,.35)"><div class="row"><b style="color:var(--alarm)">${d.fault}</b></div><button class="btn danger full" data-cmd="ack">Xác nhận đã xem</button></div>`:''}
    <div class="vals">${vals}</div>
    ${mainVal(d)!=null?`<div class="trend"><div class="lb"><span>Xu hướng 90 giây</span><span class="mono">${mainTxt(d)}</span></div><canvas id="spark"></canvas></div>`:''}
    ${ctl}${chain}
    <div class="ctl"><div class="row"><b>Vị trí</b><span class="muted">${f.name}${r?' · '+r.n:''}</span></div>
    ${d.fromDwg?'<p class="muted">Mã và tầng lấy từ bản vẽ MEP của dự án. Vị trí trong mặt bằng là tạm, chờ bản vẽ kiến trúc.</p>':''}</div>`;
  const cv=$('#spark'); if(cv) spark(cv,d.hist);
  $('#shBody').querySelectorAll('[data-cmd]').forEach(b=>b.onclick=()=>cmd(d,b.dataset.cmd));
}
function cmd(d,c){
  const needTech = ['fanon','fanoff'].includes(c);
  if (OPS.role==='viewer'){ toast('Vai trò Khách chỉ được xem'); return; }
  if (needTech && !canCmd('tech')){ toast('Lệnh quạt cần vai trò Kỹ thuật'); return; }
  if(c==='sp-'||c==='sp+'){ d.st.sp=clamp(d.st.sp+(c==='sp+'?.5:-.5),18,30); logCmd(`${d.tag} · setpoint ${d.st.sp.toFixed(1)}°C`); toast('Đã gửi lệnh setpoint'); }
  else if(c.startsWith('fan:')){ const v=c.slice(4); d.st.run=v!=='Tắt'; if(d.st.run) d.st.fan=v; logCmd(`${d.tag} · quạt ${v}`); toast('Đã gửi lệnh quạt '+v); }
  else if(c==='fanon'){ d.st.run=true; d.st.pa=45; logCmd(`${d.tag} · chạy quạt`); toast('Đã gửi lệnh chạy'); }
  else if(c==='fanoff'){ d.st.run=false; logCmd(`${d.tag} · dừng quạt`); toast('Đã gửi lệnh dừng'); }
  else if(c==='ack'){ const n=AL.ackAllOf(d, ROLE_VN[OPS.role], ''); logCmd(`${d.tag} · nhận xử lý ${n} cảnh báo`); renderHeader(); toast(n?`Đã nhận ${n} cảnh báo`:'Thiết bị này không có cảnh báo nào đang mở'); }
  d.status=statusOf(d); refresh(); renderSheet(d);
}
// ---------- hiệu năng ----------
const OPSUB=[['health','Sức khoẻ'],['energy','Năng lượng'],['work','Công việc'],['occ','Chiếm dụng'],['set','Cài đặt']];
function renderOps(){
  const nav=`<div class="subnav">${OPSUB.map(([k,v])=>{
    let n=0;
    if(k==='work'&&window.WK) n=WK.stats().open;
    if(k==='health'&&window.HLT){ const h=HLT.last(); n=h?h.off.length+h.stale.length+h.lowBatt:0; }
    return `<button data-os="${k}" class="${view.opSub===k?'on':''}">${v}${n?`<i>${n}</i>`:''}</button>`;}).join('')}</div>`;
  const body = view.opSub==='energy'?opEnergy(): view.opSub==='work'?opWork():
               view.opSub==='occ'?opOcc(): view.opSub==='set'?opSet(): opHealth();
  $('#opBody').innerHTML = nav + body;
  const B=$('#opBody');
  B.querySelectorAll('[data-os]').forEach(x=>x.onclick=()=>{ view.opSub=x.dataset.os; renderOps(); });
  B.querySelectorAll('[data-id]').forEach(x=>x.onclick=()=>openDev(devices.find(y=>y.id===x.dataset.id)));
  B.querySelectorAll('[data-floor]').forEach(x=>x.onclick=()=>openFloor(x.dataset.floor));
  const ef=B.querySelector('#enFind'); if(ef) ef.onclick=()=>{ view.fddCat='waste'; setTab('fdd');
    toast(inSchedule()?'Đang trong giờ vận hành, phần ngoài giờ xem lại sau 18:00':'Đang lọc nhóm lãng phí năng lượng'); };
  ({health:bindHealth, energy:()=>{}, work:bindWork, occ:bindOcc, set:bindSet}[view.opSub]||(()=>{}))(B);
}

// ---------- Vận hành › Sức khoẻ hệ thống ----------
function opHealth(){
  const h=HLT.scan(devices, floorOf), p=HLT.score(h), [g,cls]=HLT.grade(p);
  const row=(d,right,sub)=>`<button class="item" data-id="${d.id}">
    <span class="dot" style="background:${COL[d.status]}"></span>
    <span class="t"><b>${d.tag}</b><span>${floorOf(d.floor).name}${sub?' · '+sub:''}</span></span>
    <span class="v">${right}</span></button>`;
  return `
  <div class="card"><div class="ch">Điểm sức khoẻ hệ BMS</div>
    <div class="bigrow"><div><b class="${cls==='ok'?'cok':cls==='warn'?'cwarn':'calarm'}">${p}</b><span>${g}</span></div>
      <div><b>${h.avail.toFixed(1)}%</b><span>điểm về đủ</span></div>
      <div><b>${h.scanMs}</b><span>ms mỗi vòng quét</span></div></div>
    <p class="muted">Điểm trừ theo: mất kết nối, số liệu đứng yên, pin yếu, bộ điều khiển quá tải.</p></div>

  <div class="card"><div class="ch">Trục truyền thông</div>
    ${h.trunks.map(t=>`<div class="hbar"><span>Trục ${t.id}</span>
      <div class="bar"><i style="width:${t.avail.toFixed(0)}%;background:${t.off?'var(--warn)':'var(--ok)'}"></i></div>
      <b class="mono">${t.total-t.off}/${t.total}</b></div>`).join('')}
    <p class="muted">Tải trục: ${h.trunks.map(t=>`trục ${t.id} ${t.load.toFixed(0)}%`).join(', ')}. Trên 80% nên tách trục mới.</p></div>

  <div class="card"><div class="ch">Điểm mất kết nối (${h.off.length})</div>
    ${h.off.length?`<div class="list">${h.off.slice(0,8).map(x=>row(x.d,'mất KN', 'trục '+floorOf(x.d.floor).trunk)).join('')}</div>`
      :'<p class="muted">Tất cả điểm đang về đủ.</p>'}</div>

  <div class="card"><div class="ch">Số liệu đứng yên (${h.stale.length})</div>
    <p class="muted">Điểm vẫn trả lời nhưng giá trị không đổi qua ${HLT.STALE_N} lần đọc. Đây là loại hỏng nguy hiểm nhất vì màn hình vẫn xanh.</p>
    ${h.stale.length?`<div class="list">${h.stale.slice(0,8).map(x=>row(x.d, x.mins+' phút', 'đứng yên')).join('')}</div>`
      :'<p class="muted">Không có điểm nào đứng yên.</p>'}</div>

  <div class="card"><div class="ch">Pin cảm biến không dây (${h.batt.length} cảm biến)</div>
    ${h.batt.slice(0,8).map(x=>`<div class="hbar"><span class="mono" style="font-size:11px">${x.d.tag}</span>
      <div class="bar"><i style="width:${x.pct}%;background:${x.pct<15?'var(--alarm)':x.pct<25?'var(--warn)':'var(--ok)'}"></i></div>
      <b class="mono">${x.pct}% · ${x.days>365?'>1 năm':x.days+' ngày'}</b></div>`).join('')}
    ${h.lowBatt?`<button class="btn full" id="battWo">Tạo phiếu thay pin cho ${h.lowBatt} cảm biến dưới 25%</button>`:''}</div>`;
}
function bindHealth(B){ const b=B.querySelector('#battWo'); if(b) b.onclick=()=>{
  if(OPS.role==='viewer'){ toast('Vai trò Khách không tạo phiếu được'); return; }
  const h=HLT.last(), low=h.batt.filter(x=>x.pct<25);
  low.forEach(x=>WK.create({title:'Thay pin cảm biến không dây', dev:x.d, src:'health', prio:3,
    by:ROLE_VN[OPS.role], who:'Anh Hải (điều khiển)', detail:`Pin còn ${x.pct}%, ước tính hết sau ${x.days} ngày`}));
  logCmd(`Tạo ${low.length} phiếu thay pin cảm biến`); view.opSub='work'; renderOps(); toast(`Đã tạo ${low.length} phiếu`); }; }

// ---------- Vận hành › Năng lượng ----------
function opEnergy(){
  const e=EN.stats(); if(!e) return '<p class="muted">Đang gom dữ liệu…</p>';
  const over=e.deltaNow>7, sign=v=>(v>0?'+':'')+v.toFixed(0);
  return `
  <div class="card"><div class="ch">So với mức đáng lẽ phải dùng</div>
    <div class="bigrow">
      <div><b class="${over?'cwarn':'cok'}">${e.cur.kw.toFixed(0)}</b><span>kW hiện tại</span></div>
      <div><b>${e.cur.base.toFixed(0)}</b><span>kW mức chuẩn</span></div>
      <div><b class="${over?'cwarn':'cok'}">${sign(e.deltaNow)}%</b><span>chênh lệch</span></div></div>
    <p class="muted">Mức chuẩn tính theo nhiệt độ ngoài trời ${e.oat}°C và tỉ lệ lấp đầy ${e.occ}% của khung giờ này, không phải so với hôm qua.</p></div>

  <div class="card"><div class="ch">Hôm nay</div>
    ${EN.chartSVG()}
    <div class="elg"><span><i style="background:#27C8D6"></i>trong giờ</span><span><i style="background:#F5B23C"></i>vượt chuẩn</span><span><i style="background:#FF5A5A"></i>ngoài giờ</span><span><i class="dash"></i>mức chuẩn</span></div>
    <div class="row2"><span>Điện năng đã dùng</span><b class="mono">${e.kwh.toLocaleString('vi-VN')} kWh</b></div>
    <div class="row2"><span>Mức chuẩn tương ứng</span><b class="mono">${e.base.toLocaleString('vi-VN')} kWh</b></div>
    <div class="row2"><span>Phần vượt</span><b class="mono" style="color:${e.excess>0?'var(--warn)':'var(--ok)'}">${sign(e.excess)} kWh · ${(e.excessVnd/1000).toFixed(0)} nghìn đ</b></div></div>

  <div class="card"><div class="ch">Điện tiêu ngoài giờ</div>
    <div class="bigrow"><div><b class="${e.offShare>30?'calarm':e.offShare>20?'cwarn':'cok'}">${e.offShare.toFixed(0)}%</b><span>tổng điện cả ngày</span></div>
      <div><b>${e.offKwh}</b><span>kWh ngoài giờ</span></div>
      <div><b>${(e.offKwh*EN.GIA/1000).toFixed(0)}</b><span>nghìn đồng</span></div></div>
    <p class="muted">Tính từ 0h đến bây giờ, nên buổi sáng tỉ lệ này luôn cao rồi giảm dần trong ngày. Toà nhà văn phòng chạy tốt thường dưới 20% vì ban đêm vẫn còn thang máy, bơm và chiếu sáng công cộng. Trên 30% gần như chắc chắn có thiết bị quên tắt hoặc lịch sai.</p>
    <button class="btn full" id="enFind">Tìm thiết bị đang chạy ngoài giờ</button></div>

  <div class="card"><div class="ch">Phụ tải theo tầng</div>
    ${BLD.floors.map(f=>({f,kw:devices.filter(d=>d.floor===f.id&&d.t==='PANEL').reduce((s,d)=>s+d.st.amp*.38*1.73,0)}))
      .filter(x=>x.kw>0).sort((a,b)=>b.kw-a.kw).slice(0,5)
      .map(x=>`<button class="frow" data-floor="${x.f.id}"><span class="dot" style="background:var(--accent)"></span>
        <b>${x.f.name}</b><span class="fm">${Math.round(x.kw)} kW</span><i>mở →</i></button>`).join('')}</div>`;
}

// ---------- Vận hành › Công việc ----------
function opWork(){
  const st=WK.stats(), L=WK.list(view.wkFilter), pm=WK.due(devices);
  const chip=(k,lb,n)=>`<button class="fchip ${view.wkFilter===k?'on':''}" data-wf="${k}">${lb}${n!=null?` <i>${n}</i>`:''}</button>`;
  return `
  <div class="card"><div class="ch">Phiếu công việc</div>
    <div class="bigrow"><div><b>${st.open}</b><span>đang mở</span></div>
      <div><b class="${st.late?'calarm':''}">${st.late}</b><span>quá hạn</span></div>
      <div><b class="${st.unassigned?'cwarn':''}">${st.unassigned}</b><span>chưa giao</span></div></div></div>
  <div class="fchips">${chip('open','Đang mở',st.open)}${chip('unassigned','Chưa giao',st.unassigned)}${chip('late','Quá hạn',st.late)}${chip('done','Đã xong',st.done)}</div>
  ${L.length? L.map(w=>`<div class="fcard sev${w.prio} ${w.state==='done'?'wdone':''}">
      <div class="fh"><span class="pbadge p${w.prio}">P${w.prio}</span><b>${w.title}</b>
        <span class="waste mono">${w.no}</span></div>
      <div class="floc">${w.dev?w.dev.tag+' · '+floorOf(w.dev.floor).name:'—'} · ${({alarm:'từ cảnh báo',fdd:'từ chẩn đoán',pm:'bảo trì định kỳ',health:'sức khoẻ hệ thống'})[w.src]||'thủ công'}</div>
      ${w.detail?`<div class="fev">${w.detail}</div>`:''}
      <div class="altags"><span class="atag ${w.who==='Chưa giao'?'rep':'ok'}">${w.who}</span>
        <span class="atag ${WK.overdue(w)?'esc':''}">hạn ${w.due.toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})}${WK.overdue(w)?' · quá hạn':''}</span>
        <span class="atag">${WK.ST_VN[w.state]}</span></div>
      <div class="alacts">
        ${w.state!=='done'?`<button class="mini" data-asg="${w.no}">Giao việc</button>`:''}
        ${w.state==='new'?`<button class="mini" data-stw="${w.no}" data-s="doing">Bắt đầu</button>`:''}
        ${w.state!=='done'?`<button class="mini on" data-stw="${w.no}" data-s="done">Báo xong</button>`:`<button class="mini" data-stw="${w.no}" data-s="doing">Mở lại</button>`}
        ${w.dev?`<button class="mini" data-id="${w.dev.id}">Mở thiết bị</button>`:''}</div>
      ${view.wkFor===w.no?`<div class="ackbox wrap">${WK.TEAM.map(t=>`<button class="mini" data-asgdo="${w.no}" data-who="${t}">${t}</button>`).join('')}</div>`:''}
      <div class="wlog">${w.log.slice(0,3).map(l=>`${l.t.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})} · ${l.txt}`).join('<br>')}</div>
    </div>`).join('')
    : '<p class="muted">Không có phiếu nào trong nhóm này.</p>'}

  <div class="card"><div class="ch">Bảo trì theo giờ chạy (${pm.length} thiết bị sắp tới hạn)</div>
    <p class="muted">Tính theo giờ chạy tích luỹ thật của từng máy, không theo lịch cố định. Máy chạy ít thì chưa cần đụng vào.</p>
    ${pm.slice(0,8).map(x=>`<div class="pmrow">
      <div class="pmh"><b>${x.d.tag}</b><span class="mono">${x.d.st.hours.toLocaleString('vi-VN')} h</span></div>
      <div class="bar"><i style="width:${Math.min(100,x.pct)}%;background:${x.pct>95?'var(--alarm)':'var(--warn)'}"></i></div>
      <div class="pmf"><span>${x.work} · mỗi ${x.every.toLocaleString('vi-VN')} h</span>
        <span>${x.left<=0?'đã quá hạn':`còn ${x.left} h ≈ ${x.days} ngày`}</span></div>
      ${x.hasWo?'<span class="atag ok">đã có phiếu</span>':`<button class="mini" data-pm="${x.d.id}" data-w="${encodeURIComponent(x.work)}">Tạo phiếu bảo trì</button>`}
    </div>`).join('')}</div>`;
}
function bindWork(B){
  B.querySelectorAll('[data-wf]').forEach(x=>x.onclick=()=>{ view.wkFilter=x.dataset.wf; renderOps(); });
  B.querySelectorAll('[data-asg]').forEach(x=>x.onclick=()=>{ view.wkFor=view.wkFor===x.dataset.asg?null:x.dataset.asg; renderOps(); });
  B.querySelectorAll('[data-asgdo]').forEach(x=>x.onclick=()=>{ WK.assign(x.dataset.asgdo, x.dataset.who, ROLE_VN[OPS.role]);
    view.wkFor=null; logCmd(`${x.dataset.asgdo} · giao cho ${x.dataset.who}`); renderOps(); toast('Đã giao việc'); });
  B.querySelectorAll('[data-stw]').forEach(x=>x.onclick=()=>{
    if(OPS.role==='viewer'){ toast('Vai trò Khách không đổi được trạng thái phiếu'); return; }
    WK.setState(x.dataset.stw, x.dataset.s, ROLE_VN[OPS.role]); logCmd(`${x.dataset.stw} · ${WK.ST_VN[x.dataset.s]}`); renderOps(); });
  B.querySelectorAll('[data-pm]').forEach(x=>x.onclick=()=>{
    if(OPS.role==='viewer'){ toast('Vai trò Khách không tạo phiếu được'); return; }
    const d=devices.find(y=>y.id===x.dataset.pm);
    const w=WK.create({title:decodeURIComponent(x.dataset.w), dev:d, src:'pm', prio:3, by:ROLE_VN[OPS.role],
      detail:`Giờ chạy tích luỹ ${d.st.hours.toLocaleString('vi-VN')} h`});
    logCmd(`Tạo phiếu bảo trì ${w.no} · ${d.tag}`); renderOps(); toast('Đã tạo '+w.no); });
}

// ---------- Vận hành › Chiếm dụng ----------
function opOcc(){
  const o=OCC.stats(), L=OCC.list();
  const now=new Date();
  return `
  <div class="card"><div class="ch">Điều khiển theo chiếm dụng</div>
    <div class="row2"><span>Trạng thái</span>
      <button class="mini ${OCC.enabled?'on':''}" id="occTog">${OCC.enabled?'Đang bật':'Đang tắt'}</button></div>
    <div class="bigrow"><div><b>${o.occupied}/${o.rooms}</b><span>phòng có người</span></div>
      <div><b class="cwarn">${o.setback}</b><span>phòng đang lùi cài đặt</span></div>
      <div><b class="cok">${o.released}</b><span>lịch đặt đã trả lại</span></div></div>
    <p class="muted">Phòng đặt mà quá ${OCC.NO_SHOW_MIN} phút không có người thì trả lại lịch. Phòng trống quá ${OCC.VACANT_MIN} phút thì lùi cài đặt +${OCC.SETBACK}°C. Số người suy ra từ CO₂ nên không cần gắn thêm cảm biến hiện diện.</p>
    <div class="row2"><span>Đã tiết kiệm hôm nay</span><b class="mono cok">${o.kwh} kWh · ${(o.vnd/1000).toFixed(0)} nghìn đ</b></div>
    <div class="row2"><span>Quy ra mỗi tháng</span><b class="mono cok">${(o.monthVnd/1e6).toFixed(1)} triệu đ</b></div></div>

  <div class="card"><div class="ch">Phòng họp</div>
    ${L.filter(x=>x.meeting).length? L.filter(x=>x.meeting).slice(0,10).map(x=>{
      const b=x.book, live=b&&!b.released&&b.start<=now&&b.end>now;
      return `<div class="orow">
        <div class="oh"><b>${floorOf(x.fid).name} · ${x.name}</b>
          <span class="omode ${x.mode}">${x.mode==='setback'?'lùi cài đặt':x.mode==='hold'?'giữ theo lịch':'bình thường'}</span></div>
        <div class="floc">${x.people} người · ${Math.round(x.dev.st.co2)} ppm · ${x.dev.st.temp.toFixed(1)}°C ↹ ${x.dev.st.sp.toFixed(1)}°C</div>
        ${b?`<div class="obook ${b.released?'rel':live?'live':''}">${b.released?'✓ đã trả lại':live?'đang diễn ra':'sắp tới'} · ${b.title} · ${b.who} · ${b.start.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}–${b.end.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</div>`
          :'<div class="floc">không có lịch đặt</div>'}
        <button class="mini" data-id="${x.dev.id}">Mở cảm biến</button></div>`; }).join('')
      : '<p class="muted">Tầng này chưa có phòng họp nào trong danh sách.</p>'}</div>

  <div class="card"><div class="ch">Việc hệ thống đã tự làm</div>
    ${OCC.events.length? OCC.events.slice(0,12).map(e=>`<div class="logline"><em>${e.t.toLocaleTimeString('vi-VN')} · ${floorOf(e.room.fid).name} ${e.room.name}</em><br>${e.txt}</div>`).join('')
      : '<p class="muted">Chưa có hành động nào.</p>'}</div>`;
}
function bindOcc(B){ const t=B.querySelector('#occTog'); if(t) t.onclick=()=>{
  if(!canCmd('tech')){ toast('Chỉ vai trò Kỹ thuật bật tắt được chức năng này'); return; }
  OCC.enabled=!OCC.enabled; logCmd('Điều khiển theo chiếm dụng · '+(OCC.enabled?'bật':'tắt'));
  if(!OCC.enabled) devices.forEach(d=>{ if(d.setback) d.setback=0; });
  renderOps(); toast(OCC.enabled?'Đã bật':'Đã tắt, trả mọi phòng về cài đặt gốc'); }; }

// ---------- Vận hành › Cài đặt ----------
function opSet(){
  const open=inSchedule();
  return `
  ${(()=>{ if(!window.SITE) return ''; const c=SITE.cfg, ss=SITE.stats();
    return `<div class="card"><div class="ch">Nhận diện toà nhà</div>
    <p class="muted">Một bộ phần mềm dùng cho nhiều toà nhà. Phần dưới đây là những gì đổi theo từng công trình, kỹ thuật viên đặt lúc lắp đặt bằng file <b class="mono">site.json</b>, không phải sửa mã nguồn.</p>
    <label class="fld"><span>Tên toà nhà</span><input id="stName" value="${c.building.name}"></label>
    <label class="fld"><span>Đơn vị quản lý</span><input id="stOwner" value="${c.owner.name||''}" placeholder="Ban quản lý toà nhà"></label>
    <label class="fld"><span>Mã công trình</span><input id="stCode" value="${c.building.code||''}" placeholder="TGSC-01"></label>
    <label class="fld"><span>Hotline kỹ thuật</span><input id="stPhone" value="${c.owner.hotline||''}" placeholder="0905 680 188"></label>
    <div class="fld"><span>Logo</span><div class="logorow">
      <span class="lgprev" id="stPrev">${c.owner.logo?`<img src="${c.owner.logo}" alt="">`:(c.theme.logoText||'3A')}</span>
      <input type="file" id="stLogo" accept="image/png,image/jpeg,image/svg+xml" hidden>
      <button class="mini" id="stLogoPick">Chọn ảnh</button>
      ${c.owner.logo?'<button class="mini" id="stLogoDel">Bỏ logo</button>':'<input id="stInit" maxlength="3" placeholder="3A" value="'+(c.theme.logoText||'')+'" class="initin">'}
    </div></div>
    <div class="fld"><span>Màu chủ đạo</span><div class="swrow">
      ${['#27C8D6','#4F8CFF','#2BD37A','#F5B23C','#C77DFF','#FF7A59'].map(x=>`<button class="sw ${c.theme.accent===x?'on':''}" data-sw="${x}" style="background:${x}"></button>`).join('')}</div></div>
    <label class="fld"><span>Giá điện (đ/kWh)</span><input id="stPrice" type="number" value="${c.locale.kwhPrice}"></label>
    <div class="alacts"><button class="mini on" id="stSave">Lưu cấu hình</button><button class="mini" id="stReset">Về mặc định</button></div></div>

  <div class="card"><div class="ch">Nơi dữ liệu được lưu</div>
    <div class="row2"><span>Đang lưu tại</span><b style="color:var(--ok)">${ss.mode}</b></div>
    <div class="row2"><span>Máy chủ tại toà nhà</span><b class="mono">${ss.api||'chưa cấu hình'}</b></div>
    <div class="row2"><span>Bản ghi đã lưu</span><b class="mono">${ss.records}</b></div>
    <div class="row2"><span>Đẩy lên internet</span><b class="mono">${ss.cloud?ss.cloud:'tắt'} · ${ss.push==='auto'?'tự động':'thủ công'}</b></div>
    <label class="fld"><span>Địa chỉ máy chủ đặt tại toà nhà</span><input id="stApi" value="${ss.api}" placeholder="http://192.168.1.50:8080/api"></label>
    <label class="fld"><span>Điểm đẩy lên internet (tuỳ chọn)</span><input id="stCloud" value="${ss.cloud}" placeholder="https://bms.toanha.vn/ingest"></label>
    <div class="alacts"><button class="mini on" id="stStore">Lưu</button><button class="mini" id="stExport">Xuất dữ liệu JSON</button></div>
    <p class="muted">Cơ sở dữ liệu nằm ở toà nhà. Hệ thống chỉ đẩy ra internet khi chủ đầu tư bật và chỉ tới địa chỉ do chủ đầu tư chỉ định. Không có đường nào tự gửi dữ liệu về máy chủ của đơn vị lắp đặt. Mất mạng thì phần mềm vẫn chạy và vẫn ghi đủ, nối lại mạng mới đồng bộ.</p>
    <p class="muted">Đơn vị lắp đặt: ${c.vendor.name}${c.vendor.support?' · hỗ trợ '+c.vendor.support:''}</p></div>`; })()}

  <div class="card"><div class="ch">Vai trò đang dùng</div>
    <div class="seg">${Object.entries(ROLE_VN).map(([k,v])=>`<button data-role="${k}" class="${OPS.role===k?'on':''}">${v}</button>`).join('')}</div>
    <p class="muted">Khách chỉ xem. Vận hành được đặt nhiệt độ, bật tắt FCU, nhận xử lý cảnh báo. Kỹ thuật thêm quyền chạy/dừng quạt tăng áp, hút khói và đổi lịch.</p></div>

  <div class="card"><div class="ch">Lịch vận hành</div>
    <div class="row2"><span>Giờ chạy</span><b class="mono">${OPS.sched.on} – ${OPS.sched.off}</b></div>
    <div class="row2"><span>Hiện tại</span><b style="color:${open?'var(--ok)':'var(--muted)'}">${open?'Trong giờ · thiết bị chạy':'Ngoài giờ · FCU tắt, setpoint 28°C'}</b></div>
    <div class="seg">${[['auto','Theo lịch'],['on','Ép chạy'],['off','Ép tắt']].map(([k,v])=>`<button data-mode="${k}" class="${OPS.sched.mode===k?'on':''}">${v}</button>`).join('')}</div>
    <div class="row2"><span>Cuối tuần</span><span>
      <button class="mini ${OPS.sched.sat?'on':''}" data-day="sat">Thứ 7</button>
      <button class="mini ${OPS.sched.sun?'on':''}" data-day="sun">Chủ nhật</button></span></div>
    <p class="muted">Ngoài giờ, cảnh báo nhiệt độ hạ xuống P3 để không làm phiền ca trực đêm.</p></div>

  <div class="card"><div class="ch">Ngưỡng leo thang cảnh báo</div>
    ${[1,2,3].map(p=>`<div class="row2"><span>P${p} chưa ai nhận</span><b class="mono">${AL.ESC[p][0]}s → Trưởng ca · ${AL.ESC[p][1]}s → Quản lý</b></div>`).join('')}
    <p class="muted">Đã rút ngắn còn giây để xem ngay trong bản mẫu. Ngoài thực tế đặt 5 phút và 15 phút cho P1. Rung được tính khi một điểm đổi trạng thái ${AL.CHATTER_N} lần trong cửa sổ theo dõi.</p></div>

  <div class="card"><div class="ch">Bàn giao ca</div>
    <textarea id="hoTxt" rows="2" placeholder="Ghi lại việc đã làm, việc còn dở, cảnh báo cần theo dõi…"></textarea>
    <button class="btn full" id="hoAdd">Ghi vào sổ bàn giao</button>
    ${OPS.handover.map(h=>`<div class="logline"><em>${h.t.toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})} · ${h.who}</em><br>${h.txt}</div>`).join('')}</div>

  <div class="card"><div class="ch">Kết nối & hiệu năng</div>
    <div class="row2"><span>Trạng thái</span><b style="color:${OPS.connected?'var(--ok)':'var(--alarm)'}">${OPS.connected?'Đang kết nối':'Mất kết nối máy chủ'}</b></div>
    <button class="btn full" id="opOffline">${OPS.connected?'Mô phỏng mất kết nối':'Kết nối lại'}</button>
    <button class="btn full" id="opPerf">Đo khung hình 12 giây</button>
    <div id="benchOut"></div></div>`;
}
function bindSet(B){
  const q=i=>B.querySelector(i), val=i=>{const e=q(i); return e?e.value.trim():'';};
  if(q('#stSave')){
    q('#stSave').onclick=()=>{ if(!canCmd('tech')){ toast('Chỉ vai trò Kỹ thuật đổi được nhận diện toà nhà'); return; }
      SITE.save({ building:{name:val('#stName')||'Toà nhà chưa đặt tên', code:val('#stCode')},
        owner:{name:val('#stOwner'), hotline:val('#stPhone')},
        theme:{logoText:(val('#stInit')||SITE.cfg.theme.logoText||'3A').toUpperCase()},
        locale:{kwhPrice:+val('#stPrice')||3200} });
      BLD.name=SITE.cfg.building.name; logCmd('Cập nhật nhận diện toà nhà');
      logSite('site.config', {name:SITE.cfg.building.name, by:ROLE_VN[OPS.role]});
      renderOps(); toast('Đã lưu, giao diện đã đổi theo toà nhà này'); };
    q('#stReset').onclick=()=>{ SITE.reset(); setTimeout(()=>{ BLD.name=SITE.cfg.building.name; renderOps(); },200); toast('Đã trả về mặc định'); };
    q('#stLogoPick').onclick=()=>q('#stLogo').click();
    q('#stLogo').onchange=e=>{ const f=e.target.files[0]; if(!f) return;
      if(f.size>260000){ toast('Ảnh quá nặng, chọn file dưới 250KB'); return; }
      const r=new FileReader(); r.onload=()=>{ SITE.save({owner:{logo:r.result}}); renderOps(); toast('Đã đổi logo'); }; r.readAsDataURL(f); };
    const dl=q('#stLogoDel'); if(dl) dl.onclick=()=>{ SITE.cfg.owner.logo=''; SITE.save({}); renderOps(); };
    B.querySelectorAll('[data-sw]').forEach(x=>x.onclick=()=>{ SITE.save({theme:{accent:x.dataset.sw}}); renderOps(); });
    q('#stStore').onclick=()=>{ if(!canCmd('tech')){ toast('Chỉ vai trò Kỹ thuật đổi được nơi lưu dữ liệu'); return; }
      SITE.save({storage:{api:val('#stApi'), cloud:val('#stCloud')}}); renderOps();
      toast(val('#stApi')?'Sẽ ghi lên máy chủ tại toà nhà':'Đang lưu trên máy này'); };
    q('#stExport').onclick=()=>{ const b=new Blob([SITE.exportJSON()],{type:'application/json'});
      const u=URL.createObjectURL(b), a=document.createElement('a');
      a.href=u; a.download=(SITE.cfg.building.code||'bms')+'-data.json'; a.click(); URL.revokeObjectURL(u);
      toast('Đã xuất file dữ liệu của toà nhà'); };
  }
  B.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>{ OPS.role=b.dataset.role; renderOps(); renderHeader(); toast('Vai trò: '+ROLE_VN[OPS.role]); });
  B.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{ if(!canCmd('tech')){toast('Chỉ vai trò Kỹ thuật đổi được lịch');return;} OPS.sched.mode=b.dataset.mode; logCmd('Lịch vận hành · '+b.textContent); renderOps(); });
  B.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{ if(!canCmd('tech')){toast('Chỉ vai trò Kỹ thuật đổi được lịch');return;} const k=b.dataset.day; OPS.sched[k]=!OPS.sched[k]; logCmd('Lịch cuối tuần · '+b.textContent+(OPS.sched[k]?' bật':' tắt')); renderOps(); });
  const ho=B.querySelector('#hoAdd'); if(ho) ho.onclick=()=>{ const t=$('#hoTxt').value.trim(); if(!t) return;
    OPS.handover.unshift({t:new Date(), who:ROLE_VN[OPS.role], txt:t});
    logSite('handover', {who:ROLE_VN[OPS.role], txt:t}); renderOps(); toast('Đã ghi sổ bàn giao'); };
  const of_=B.querySelector('#opOffline'); if(of_) of_.onclick=()=>{ OPS.connected=!OPS.connected; renderOps(); renderHeader(); toast(OPS.connected?'Đã kết nối lại':'Đang mô phỏng mất kết nối, dữ liệu đứng yên'); };
  const pf=B.querySelector('#opPerf'); if(pf) pf.onclick=runBench;
}
function renderPerf(){
  const info=renderer.info.render;
  $('#pfBody').innerHTML=`<div class="bench"><p class="muted">Đo khung hình của màn 3D tổng quan. Chạy 12 giây, đừng chạm màn hình.</p>
    <button class="btn primary full" id="benchRun">Bắt đầu đo 12 giây</button><div class="bar" id="benchBar" hidden><i style="width:0%"></i></div>
    <table><tbody><tr><td>Màn hình</td><td>${innerWidth}×${innerHeight} @${(devicePixelRatio||1).toFixed(1)}x</td></tr>
    <tr><td>Tỉ lệ render</td><td>${renderer.getPixelRatio().toFixed(2)}x</td></tr>
    <tr><td>Tam giác · lệnh vẽ</td><td>${(info.triangles/1000).toFixed(0)}k · ${info.calls}</td></tr>
    <tr><td>Điểm BMS</td><td>${devices.length}</td></tr>
    <tr><td>Mặt bằng 2D</td><td>SVG, không dùng GPU</td></tr>
    <tr><td>3D tầng</td><td>${window.F3&&F3.isBuilt()?F3.info().calls+' lệnh vẽ':'chưa mở'}</td></tr></tbody></table><div id="benchOut"></div></div>`;
  $('#benchRun').onclick=runBench;
}
function runBench(){
  if(bench.on) return; if(document.hidden){ toast('Mở app ở chế độ hiển thị rồi đo'); return; }
  setTab('tower');
  samples=[]; bench.on=true; const bar=$('#benchBar'); if(bar){bar.hidden=false;}
  const t0=performance.now(), dur=12000;
  setTimeout(()=>{ bench.on=false; setTab('ops');
    const s=samples.filter(x=>x>0&&x<500).sort((a,b)=>a-b); if(!s.length) return;
    const avg=s.reduce((a,b)=>a+b,0)/s.length, p95=s[Math.floor(s.length*.95)], p99=s[Math.floor(s.length*.99)];
    const fps=1000/avg, info=renderer.info.render;
    const v=fps>=55?['Rất mượt','var(--ok)']:fps>=40?['Mượt','var(--ok)']:fps>=28?['Chấp nhận được','var(--warn)']:['Cần tối ưu','var(--alarm)'];
    $('#benchOut').innerHTML=`<table><tbody><tr><td>FPS trung bình</td><td style="color:${v[1]}">${fps.toFixed(1)}</td></tr>
      <tr><td>FPS thấp 5%</td><td>${(1000/p95).toFixed(1)}</td></tr><tr><td>FPS thấp 1%</td><td>${(1000/p99).toFixed(1)}</td></tr>
      <tr><td>Thời gian khung</td><td>${avg.toFixed(1)} ms</td></tr><tr><td>Số khung</td><td>${s.length}</td></tr>
      <tr><td>Kết luận</td><td style="color:${v[1]}">${v[0]}</td></tr></tbody></table>`;
    try{ if(/^\d+\.\d+\.\d+\.\d+$/.test(location.hostname)) fetch('/fps',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({fpsAvg:+fps.toFixed(1),frameMs:+avg.toFixed(2),frames:s.length,calls:info.calls,tris:info.triangles,ua:navigator.userAgent,at:new Date().toISOString()})}).catch(()=>{});}catch(e){}
  },dur);
}
// ---------- chẩn đoán lỗi tự động ----------
let fddIdx=null;
const FDDCTX = {
  inSchedule, sched:()=>`${OPS.sched.on}–${OPS.sched.off}`,
  sibling:(d,t)=>(fddIdx.get(d.floor)||[]).find(x=>x.room===d.room&&x.t===t),
  peers:(d)=>(fddIdx.get(d.floor)||[]).filter(x=>x.t===d.t&&x!==d&&!x.offline),
};
function runFDD(){ if(!window.FDD) return;
  fddIdx=new Map(); devices.forEach(d=>{ let a=fddIdx.get(d.floor); if(!a) fddIdx.set(d.floor,a=[]); a.push(d); });
  FDD.evaluate(devices, FDDCTX); }
function renderFDD(){
  const st=FDD.stats(), L=FDD.list(view.fddCat||'all');
  const chip=(k,lb,n)=>`<button class="fchip ${(view.fddCat||'all')===k?'on':''}" data-fc="${k}">${lb}${n!=null?` <i>${n}</i>`:''}</button>`;
  $('#fdBody').innerHTML = `
    <div class="card"><div class="ch">Tổng hợp</div>
      <div class="bigrow"><div><b>${st.n}</b><span>lỗi đang mở</span></div>
        <div><b>${st.kwh}</b><span>kWh lãng phí/tháng</span></div>
        <div><b>${FDD.vnd(st.vnd)}</b><span>đồng/tháng</span></div></div>
      <p class="muted">Ước tính theo giá ${FDD.GIA_DIEN.toLocaleString('vi-VN')} đ/kWh, 26 ngày làm việc. Ngưỡng thời gian trong bản mẫu rút ngắn còn vài giây để thấy ngay; ngoài thực tế đặt theo phút.</p></div>
    <div class="fchips">${chip('all','Tất cả',st.n)}${st.byCat.map(c=>chip(c.k,FDD.CAT[c.k].name,c.n)).join('')}${chip('ignored','Đã bỏ qua')}</div>
    ${L.length? L.map(f=>{
      const d=f.dev, fl=floorOf(d.floor), r=fl.rooms[d.room];
      return `<div class="fcard sev${f.rule.sev}">
        <div class="fh"><span class="pbadge p${f.rule.sev}">${f.rule.sev===1?'Nặng':f.rule.sev===2?'Vừa':'Nhẹ'}</span>
          <b>${f.rule.name}</b>
          ${f.kwh?`<span class="waste">${FDD.vnd(f.kwh*FDD.GIA_DIEN)} đ/tháng</span>`:''}</div>
        <div class="floc">${d.tag} · ${fl.name}${r?' · '+r.n:''} · phát hiện ${Math.round((Date.now()-f.first)/1000)}s trước</div>
        <div class="fev">Bằng chứng: ${f.ev}</div>
        <div class="ffix">Khuyến nghị: ${f.rule.fix}</div>
        ${f.ticket?`<div class="fticket">${f.ticket.done?'✓ Đã đóng':'📋 Phiếu'} ${f.ticket.no} · ${f.ticket.who} · ${f.ticket.at.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</div>`:''}
        <div class="alacts">
          <button class="mini" data-open="${d.id}">Mở thiết bị</button>
          ${f.ticket? (f.ticket.done?'':`<button class="mini on" data-close="${f.id}">Đóng phiếu</button>`) : `<button class="mini on" data-ticket="${f.id}">Tạo phiếu</button>`}
          ${f.ignored?`<button class="mini" data-unig="${f.id}">Bỏ qua lại</button>`:`<button class="mini" data-ig="${f.id}">Bỏ qua</button>`}
        </div></div>`; }).join('')
      : '<p class="muted">Không có lỗi nào trong nhóm này. Hệ thống đang chạy đúng.</p>'}`;
  $('#fdBody').querySelectorAll('[data-fc]').forEach(b=>b.onclick=()=>{ view.fddCat=b.dataset.fc; renderFDD(); });
  $('#fdBody').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openDev(devices.find(x=>x.id===b.dataset.open)));
  $('#fdBody').querySelectorAll('[data-ticket]').forEach(b=>b.onclick=()=>{
    if(OPS.role==='viewer'){ toast('Vai trò Khách không tạo phiếu được'); return; }
    const f=FDD.get(b.dataset.ticket); if(!f) return;
    const fl=floorOf(f.dev.floor), r=fl.rooms[f.dev.room];
    const w=WK.create({title:f.rule.name, dev:f.dev, src:'fdd', prio:f.rule.sev, by:ROLE_VN[OPS.role],
      detail:`${f.ev}. ${f.rule.fix}${f.kwh?` Ước tính lãng phí ${FDD.vnd(f.kwh*FDD.GIA_DIEN)} đồng mỗi tháng.`:''}`});
    f.ticket={no:w.no, at:w.at, who:w.who, done:false, wo:w};
    logCmd(`Tạo phiếu ${w.no} · ${f.rule.name} · ${f.dev.tag}`);
    renderFDD(); toast('Đã tạo '+w.no+', xem ở Vận hành › Công việc'); });
  $('#fdBody').querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{ const f=FDD.get(b.dataset.close);
    if(f&&f.ticket){ f.ticket.done=true; WK.setState(f.ticket.no,'done',ROLE_VN[OPS.role]); logCmd(`Đóng phiếu ${f.ticket.no}`); }
    renderFDD(); toast('Đã đóng phiếu'); });
  $('#fdBody').querySelectorAll('[data-ig]').forEach(b=>b.onclick=()=>{ FDD.ignore(b.dataset.ig); renderFDD(); toast('Đã bỏ qua lỗi này'); });
  $('#fdBody').querySelectorAll('[data-unig]').forEach(b=>b.onclick=()=>{ FDD.unignore(b.dataset.unig); renderFDD(); });
  const b=$('#fdBadge'); if(b){ b.hidden=!st.n; b.textContent=st.n; }
}

// ---------- tìm kiếm nhanh ----------
const sBar=$('#searchBar'), qIn=$('#qInput'), qRes=$('#qRes');
$('#btnSearch').onclick=()=>{ sBar.hidden=!sBar.hidden; if(!sBar.hidden){ qIn.value=''; qRes.innerHTML=''; qIn.focus(); } };
$('#qClose').onclick=()=>{ sBar.hidden=true; };
qIn.addEventListener('input',()=>{
  const q=qIn.value.trim().toLowerCase(); if(q.length<2){ qRes.innerHTML=''; return; }
  const hit=[];
  devices.forEach(d=>{ if(hit.length>=25) return;
    const f=floorOf(d.floor), r=f.rooms[d.room];
    const hay=`${d.tag} ${f.name} ${r?r.n:''} ${(DEV_INFO[d.t]||{name:''}).name}`.toLowerCase();
    if(hay.includes(q)) hit.push(d); });
  qRes.innerHTML = hit.length? hit.map(d=>`<button data-id="${d.id}">
      <span class="dot" style="width:9px;height:9px;border-radius:50%;background:${COL[d.status]}"></span>
      <span style="flex:1"><b>${d.tag}</b><br><span>${floorOf(d.floor).name} · ${(floorOf(d.floor).rooms[d.room]||{n:''}).n}</span></span>
      <span style="font-family:var(--mono);font-size:12px;color:var(--ink-2)">${mainTxt(d)}</span></button>`).join('')
    : '<button disabled><span class="muted">Không tìm thấy</span></button>';
  qRes.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{ sBar.hidden=true; openDev(devices.find(x=>x.id===b.dataset.id)); });
});
document.addEventListener('keydown',e=>{ if(e.key==='Escape') sBar.hidden=true; });

// ---------- vòng cập nhật ----------
function refresh(){ runFDD(); if(window.HLT) HLT.scan(devices, floorOf); paint3D(); renderHeader(); renderRail();
  if(view.tab==='tower') renderTower();
  else if(view.tab==='floor') renderFloor();
  else if(view.tab==='alarms') renderAlarms();
  else if(view.tab==='ops') renderOps();
  else if(view.tab==='fdd') renderFDD();
  if(view.tab==='floor' && view.sub==='3d' && window.F3 && F3.isBuilt()===view.floor) F3.paint();
  if(view.sel && $('#sheet').classList.contains('open')) renderSheet(view.sel); }
EN.seed(h=>{ const dow=new Date().getDay();
  if(dow===0&&!OPS.sched.sun) return false; if(dow===6&&!OPS.sched.sat) return false;
  return h>=parseInt(OPS.sched.on) && h<parseInt(OPS.sched.off); });
OCC.init(devices, floorOf);
(()=>{ const pm=WK.due(devices)[0];
  if(pm){ const w=WK.create({title:pm.work, dev:pm.d, src:'pm', prio:3, by:'Ca sáng',
    detail:`Giờ chạy tích luỹ ${pm.d.st.hours.toLocaleString('vi-VN')} h`}); WK.assign(w.no,'Tổ vệ sinh','Ca sáng'); }
  const dirty=devices.find(d=>d.t==='FCU'&&d.fault);
  if(dirty){ const w=WK.create({title:'Chênh áp lọc gió cao, cần vệ sinh lọc', dev:dirty, src:'alarm', prio:2, by:'Ca đêm',
    detail:'Ca đêm ghi nhận, chưa có vật tư thay thế'}); w.due=new Date(Date.now()-3*3600e3); }
})();
AL.onEscalate = (a,lv)=>{ toast(`Leo thang cấp ${lv}: ${a.dev.tag} · ${a.msg} → ${AL.ESC_TO[lv]}`);
  logCmd(`Leo thang cấp ${lv} · ${a.dev.tag} · ${a.msg}`); };
runModules(inSchedule()); HLT.scan(devices, floorOf);
paint3D(); resize3D(); fit3D(); runFDD(); setTab('tower'); refresh();
$('#loading').remove();
setInterval(()=>{ if(document.hidden) return; tick(); refresh(); },1500);
setInterval(()=>{ if(!document.hidden) renderHeader(); },1000);
if(/[?&]bench=1/.test(location.search)) setTimeout(()=>{ setTab('perf'); setTimeout(runBench,600); },800);
};
