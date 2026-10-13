// ===================== BMS vận hành: 3D tổng quan + mặt bằng 2D + sơ đồ trục =====================
window.__initBMS = function(){
const $ = s => document.querySelector(s);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const rnd=(a,b)=>a+Math.random()*(b-a);
const COL={ok:'#2BD37A', warn:'#F5B23C', alarm:'#FF5A5A', off:'#5A6678'};
const HEX={ok:0x2BD37A, warn:0xF5B23C, alarm:0xFF5A5A, off:0x5A6678};
const ST_VN={ok:'Bình thường', warn:'Cảnh báo', alarm:'Sự cố', off:'Mất kết nối'};
const worstOf = ds => ds.reduce((m,d)=>d.status==='alarm'?'alarm':((d.status==='warn'||d.status==='off')&&m!=='alarm'?(d.status==='off'?'off':'warn'):m),'ok');

const view={tab:'tower', floor:'F10', sub:'plan', sel:null, alFilter:'all', ackFor:null};
const OPS = { role:'operator', connected:true, lastTick:Date.now(), kwh:0,
  sched:{on:'07:00', off:'18:00', mode:'auto', sat:true, sun:false},
  handover:[{t:new Date(Date.now()-3600*1000*5), who:'Ca sáng', txt:'Đã kiểm tra chiller 1, dầu bình thường. FCU tầng 3 còn kêu, đã báo kỹ thuật.'}] };
const ROLE_VN={operator:'Vận hành',tech:'Kỹ thuật',viewer:'Khách'};
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
const devices=[], alarms=[], auditLog=[]; let uid=0;
const mk=o=>{o.id='d'+(uid++); o.hist=[]; o.status='ok'; devices.push(o); return o;};
const floorOf=id=>BLD.floors.find(f=>f.id===id);
// trục đứng: 2 trục BACnet MSTP (trục A: hầm→tầng 12, trục B: tầng 13→mái) + trục IP về server
BLD.floors.forEach((f,i)=>{ f.idx=i; f.trunk = i<=13 ? 'A' : 'B'; f.rooms = planRooms(f.kind); });
BLD.floors.forEach(f=>{
  f.rooms.forEach((r,ri)=>{
    if (['office','meeting','retail','lobby','pantry','bms'].includes(r.kind)){
      mk({t:'FCU',floor:f.id,room:ri,tag:`${f.id}-${String(ri+1).padStart(2,'0')}-FCU`,st:{run:true,fan:['Thấp','Vừa','Cao'][ri%3],hours:Math.round(rnd(800,9000)),filter:rnd(12,72)}});
      mk({t:'TS', floor:f.id,room:ri,tag:`${f.id}-${String(ri+1).padStart(2,'0')}-TS`, st:{temp:24+rnd(-.8,.8),sp:24,rh:rnd(52,64),co2:rnd(430,760)}});
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
function pushAlarm(d){ if (d.shelveUntil && Date.now()<d.shelveUntil) return;
  alarms.unshift({dev:d,lvl:d.status,prio:prioOf(d),t:new Date(),
  msg:d.fault||(d.t==='TS'?`Lệch nhiệt độ ${(d.st.temp-d.st.sp).toFixed(1)}°C`:d.t==='CV'?'Van mở gần hết':d.t==='FCU'?'Chênh áp lọc gió cao':'Vượt ngưỡng')});
  if(alarms.length>80) alarms.pop(); }
const logCmd=t=>{auditLog.unshift({t:new Date(),txt:t}); if(auditLog.length>40) auditLog.pop();};
function tick(){
  if(!OPS.connected) return;                       // mô phỏng mất kết nối: dữ liệu đứng yên
  OPS.lastTick=Date.now();
  const open=inSchedule();
  OPS.kwh += devices.filter(d=>d.t==='PANEL').reduce((s,d)=>s+d.st.amp*.38*1.73,0)*(1.5/3600);
  devices.forEach(d=>{ if(d.offline) return;
    if(d.t==='FCU' && !d.fault){ d.st.run=open; }
    if(d.t==='TS') d.st.sp = open?24:28;
  switch(d.t){
    case 'TS':{const tg=d.st.sp+(d.drift||0); d.st.temp+=(tg-d.st.temp)*.12+rnd(-.09,.09);
      d.st.rh=clamp(d.st.rh+rnd(-.5,.5),45,72); d.st.co2=clamp(d.st.co2+rnd(-22,26),400,1500); break;}
    case 'CV': if(!d.fault) d.st.open=clamp(d.st.open+rnd(-4,4),8,95); d.st.dp=clamp(d.st.dp+rnd(-1.5,1.5),30,70); break;
    case 'FCU': if(!d.fault) d.st.filter=clamp(d.st.filter+.02,5,99); break;
    case 'DDC': d.st.cpu=clamp(d.st.cpu+rnd(-3,3),10,92); break;
    case 'PANEL': d.st.amp=clamp(d.st.amp+rnd(-2,2),6,52); d.st.v=clamp(d.st.v+rnd(-2,2),370,400); break;
    case 'SPF': case 'SEF': case 'MAF': case 'EF': d.st.pa = d.st.run?clamp((d.st.pa||40)+rnd(-3,3),35,62):clamp(d.st.pa*.8,0,6); break;
  }
  const prev=d.status; d.status=statusOf(d); if(prev!==d.status&&d.status!=='ok') pushAlarm(d);
  const v=mainVal(d); if(v!=null){ d.hist.push(v); if(d.hist.length>90) d.hist.shift(); } }); }
devices.forEach(d=>{ d.status=statusOf(d); if(d.status!=='ok') pushAlarm(d); });
alarms.forEach((a,i)=>a.t=new Date(Date.now()-(i*6+2)*60000));
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
    <div class="ovsec"><div class="ovh">Thiết bị theo loại</div>
      <div class="tgrid">${Object.entries(byType).map(([k,v])=>`<div class="tcell ${v.bad?'bad':''}"><b>${v.n}</b><span>${(DEV_INFO[k]||{name:k}).name.split('(')[0].trim()}</span>${v.bad?`<i>${v.bad}</i>`:''}</div>`).join('')}</div>
    </div>`;
  $('#ovBody').querySelectorAll('[data-floor]').forEach(b=>b.onclick=()=>openFloor(b.dataset.floor));
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
function alarmList(){
  const now=Date.now();
  let L=alarms.filter(a=>!(a.dev.shelveUntil&&now<a.dev.shelveUntil));
  if(view.alFilter==='un') L=L.filter(a=>!a.ack);
  else if(view.alFilter==='p1') L=L.filter(a=>a.prio===1);
  else if(view.alFilter==='shelved') L=alarms.filter(a=>a.dev.shelveUntil&&now<a.dev.shelveUntil);
  return L.sort((a,b)=> (a.ack?1:0)-(b.ack?1:0) || a.prio-b.prio || b.t-a.t); }
function renderAlarms(){
  const un=alarms.filter(a=>!a.ack).length, p1=alarms.filter(a=>a.prio===1&&!a.ack).length;
  const sh=alarms.filter(a=>a.dev.shelveUntil&&Date.now()<a.dev.shelveUntil).length;
  const L=alarmList();
  const chip=(k,lb,n)=>`<button class="fchip ${view.alFilter===k?'on':''}" data-f="${k}">${lb}${n!=null?` <i>${n}</i>`:''}</button>`;
  $('#alBody').innerHTML = `
    <div class="fchips">${chip('all','Tất cả',alarms.length)}${chip('un','Chưa xác nhận',un)}${chip('p1','P1 khẩn',p1)}${chip('shelved','Đang tạm ẩn',sh)}</div>
    ${L.length?`<div class="list">${L.slice(0,40).map(a=>`
      <div class="alrow p${a.prio} ${a.ack?'acked':''}">
        <button class="alopen" data-id="${a.dev.id}">
          <span class="pbadge p${a.prio}">P${a.prio}</span>
          <span class="t"><b>${a.msg}</b><span>${a.dev.tag} · ${floorOf(a.dev.floor).name}${a.ackNote?` · ghi chú: ${a.ackNote}`:''}</span></span>
          <span class="v">${a.t.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</span></button>
        <div class="alacts">
          ${a.ack?`<span class="okmark">✓ ${a.ackBy||''} xác nhận</span>`:`<button class="mini" data-ackopen="${a.dev.id}">Xác nhận</button>`}
          ${a.dev.shelveUntil&&Date.now()<a.dev.shelveUntil?`<span class="okmark">tạm ẩn tới ${new Date(a.dev.shelveUntil).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</span>`:`<button class="mini" data-shelve="${a.dev.id}">Tạm ẩn 4h</button>`}
        </div>
        ${view.ackFor===a.dev.id?`<div class="ackbox"><input id="ackNote" placeholder="Ghi chú: đã gọi kỹ thuật, chờ vật tư…" autocomplete="off"><button class="mini on" data-ackdo="${a.dev.id}">Lưu</button><button class="mini" data-ackcancel="1">Bỏ</button></div>`:''}
        </div>`).join('')}</div>`
      : '<p class="muted">Không có cảnh báo nào khớp bộ lọc.</p>'}
    <div><div class="muted" style="margin:12px 0 6px">Nhật ký lệnh điều khiển</div>
      ${auditLog.length?auditLog.slice(0,14).map(l=>`<div class="logline"><em>${l.t.toLocaleTimeString('vi-VN')}</em> · ${l.txt}</div>`).join(''):'<p class="muted">Chưa có lệnh.</p>'}</div>`;
  $('#alCount').textContent=un;
  $('#alBody').querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>openDev(devices.find(x=>x.id===b.dataset.id)));
  $('#alBody').querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{ view.alFilter=b.dataset.f; renderAlarms(); });
  $('#alBody').querySelectorAll('[data-ackopen]').forEach(b=>b.onclick=()=>{
    if(OPS.role==='viewer'){ toast('Vai trò Khách không xác nhận được'); return; }
    view.ackFor=b.dataset.ackopen; renderAlarms(); const i=$('#ackNote'); if(i) i.focus(); });
  $('#alBody').querySelectorAll('[data-ackcancel]').forEach(b=>b.onclick=()=>{ view.ackFor=null; renderAlarms(); });
  $('#alBody').querySelectorAll('[data-ackdo]').forEach(b=>b.onclick=()=>{ const n=$('#ackNote'); ackAlarm(b.dataset.ackdo, n?n.value.trim():''); });
  $('#alBody').querySelectorAll('[data-shelve]').forEach(b=>b.onclick=()=>shelve(b.dataset.shelve));
}
function ackAlarm(id, note){
  if(OPS.role==='viewer'){ toast('Vai trò Khách không xác nhận được'); return; }
  const d=devices.find(x=>x.id===id); view.ackFor=null;
  alarms.filter(a=>a.dev===d&&!a.ack).forEach(a=>{ a.ack=true; a.ackNote=note||''; a.ackBy=ROLE_VN[OPS.role]; });
  logCmd(`${d.tag} · xác nhận cảnh báo${note?' · '+note:''}`); renderAlarms(); renderHeader(); toast('Đã xác nhận');
}
function shelve(id){
  if(OPS.role==='viewer'){ toast('Vai trò Khách không tạm ẩn được'); return; }
  const d=devices.find(x=>x.id===id); d.shelveUntil=Date.now()+4*3600*1000;
  logCmd(`${d.tag} · tạm ẩn cảnh báo 4 giờ`); renderAlarms(); toast('Đã tạm ẩn 4 giờ, hết hạn sẽ báo lại');
}
function renderHeader(){
  const on=devices.filter(d=>!d.offline).length;
  $('#kOnline').textContent=on+'/'+devices.length;
  $('#kWarn').textContent=devices.filter(d=>d.status==='warn').length;
  $('#kAlarm').textContent=devices.filter(d=>['alarm','off'].includes(d.status)).length;
  $('#kPower').textContent=Math.round(devices.filter(d=>d.t==='PANEL').reduce((s,d)=>s+d.st.amp*.38*1.73,0));
  const n=alarms.filter(a=>!a.ack&&!(a.dev.shelveUntil&&Date.now()<a.dev.shelveUntil)).length;
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
  ['tower','floor','alarms','ops'].forEach(k=>{ const p=$('#pane-'+k); if(p) p.hidden = k!==t; });
  document.querySelectorAll('.tabbar button').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
  const rail=$('#floors'); rail.hidden = t!=='floor' && t!=='tower';
  const host = t==='tower' ? $('#stage') : $('#pane-floor');
  if (!rail.hidden && rail.parentElement!==host) host.appendChild(rail);
  if(t==='tower'){ dirty=true; resize3D(); fit3D(); renderTower(); }
  if(t==='floor') renderFloor();
  if(t==='alarms') renderAlarms();
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
  else if(c==='ack'){ const a=alarms.find(x=>x.dev===d); if(a) a.ack=true; logCmd(`${d.tag} · xác nhận cảnh báo`); toast('Đã xác nhận'); }
  d.status=statusOf(d); refresh(); renderSheet(d);
}
// ---------- hiệu năng ----------
function renderOps(){
  const open=inSchedule(), now=new Date();
  const svcFCU = devices.filter(d=>d.t==='FCU').sort((a,b)=>b.st.filter-a.st.filter).slice(0,6);
  const runners = devices.filter(d=>d.st.hours!=null).sort((a,b)=>b.st.hours-a.st.hours).slice(0,5);
  const kwNow = Math.round(devices.filter(d=>d.t==='PANEL').reduce((s,d)=>s+d.st.amp*.38*1.73,0));
  const byFloor = BLD.floors.map(f=>({f, kw: devices.filter(d=>d.floor===f.id&&d.t==='PANEL').reduce((s,d)=>s+d.st.amp*.38*1.73,0)}))
    .filter(x=>x.kw>0).sort((a,b)=>b.kw-a.kw).slice(0,4);
  $('#opBody').innerHTML = `
  <div class="card"><div class="ch">Vai trò đang dùng</div>
    <div class="seg">${Object.entries(ROLE_VN).map(([k,v])=>`<button data-role="${k}" class="${OPS.role===k?'on':''}">${v}</button>`).join('')}</div>
    <p class="muted">Khách chỉ xem. Vận hành được đặt nhiệt độ, bật tắt FCU, xác nhận cảnh báo. Kỹ thuật thêm quyền chạy/dừng quạt tăng áp, hút khói và đổi lịch.</p></div>

  <div class="card"><div class="ch">Lịch vận hành</div>
    <div class="row2"><span>Giờ chạy</span><b class="mono">${OPS.sched.on} – ${OPS.sched.off}</b></div>
    <div class="row2"><span>Hiện tại</span><b style="color:${open?'var(--ok)':'var(--muted)'}">${open?'Trong giờ · thiết bị chạy':'Ngoài giờ · FCU tắt, setpoint 28°C'}</b></div>
    <div class="seg">${[['auto','Theo lịch'],['on','Ép chạy'],['off','Ép tắt']].map(([k,v])=>`<button data-mode="${k}" class="${OPS.sched.mode===k?'on':''}">${v}</button>`).join('')}</div>
    <div class="row2"><span>Cuối tuần</span><span>
      <button class="mini ${OPS.sched.sat?'on':''}" data-day="sat">Thứ 7</button>
      <button class="mini ${OPS.sched.sun?'on':''}" data-day="sun">Chủ nhật</button></span></div>
    <p class="muted">Ngoài giờ, cảnh báo nhiệt độ hạ xuống P3 để không làm phiền ca trực đêm.</p></div>

  <div class="card"><div class="ch">Bảo trì sắp tới</div>
    <div class="list">${svcFCU.map(d=>`<button class="item" data-id="${d.id}">
      <span class="dot" style="background:${d.st.filter>85?COL.warn:COL.ok}"></span>
      <span class="t"><b>${floorOf(d.floor).name} · ${(floorOf(d.floor).rooms[d.room]||{n:''}).n}</b><span>${d.tag}</span></span>
      <span class="v">lọc ${Math.round(d.st.filter)}%</span></button>`).join('')}</div>
    <div class="ch" style="margin-top:8px">Giờ chạy cao nhất</div>
    <div class="list">${runners.map(d=>`<button class="item" data-id="${d.id}">
      <span class="dot" style="background:${COL[d.status]}"></span>
      <span class="t"><b>${d.tag}</b><span>${floorOf(d.floor).name}</span></span>
      <span class="v">${d.st.hours.toLocaleString('vi-VN')} h</span></button>`).join('')}</div></div>

  <div class="card"><div class="ch">Năng lượng</div>
    <div class="row2"><span>Công suất tức thời</span><b class="mono">${kwNow} kW</b></div>
    <div class="row2"><span>Điện năng từ khi mở app</span><b class="mono">${OPS.kwh.toFixed(2)} kWh</b></div>
    ${byFloor.map(x=>`<div class="row2"><span>${x.f.name}</span><b class="mono">${Math.round(x.kw)} kW</b></div>`).join('')}</div>

  <div class="card"><div class="ch">Bàn giao ca</div>
    <textarea id="hoTxt" rows="2" placeholder="Ghi lại việc đã làm, việc còn dở, cảnh báo cần theo dõi…"></textarea>
    <button class="btn full" id="hoAdd">Ghi vào sổ bàn giao</button>
    ${OPS.handover.map(h=>`<div class="logline"><em>${h.t.toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})} · ${h.who}</em><br>${h.txt}</div>`).join('')}</div>

  <div class="card"><div class="ch">Kết nối & hiệu năng</div>
    <div class="row2"><span>Trạng thái</span><b style="color:${OPS.connected?'var(--ok)':'var(--alarm)'}">${OPS.connected?'Đang kết nối':'Mất kết nối máy chủ'}</b></div>
    <button class="btn full" id="opOffline">${OPS.connected?'Mô phỏng mất kết nối':'Kết nối lại'}</button>
    <button class="btn full" id="opPerf">Đo khung hình 12 giây</button>
    <div id="benchOut"></div></div>`;
  $('#opBody').querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>{ OPS.role=b.dataset.role; renderOps(); renderHeader(); toast('Vai trò: '+ROLE_VN[OPS.role]); });
  $('#opBody').querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{ if(!canCmd('tech')){toast('Chỉ vai trò Kỹ thuật đổi được lịch');return;} OPS.sched.mode=b.dataset.mode; logCmd('Lịch vận hành · '+b.textContent); renderOps(); });
  $('#opBody').querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{ if(!canCmd('tech')){toast('Chỉ vai trò Kỹ thuật đổi được lịch');return;} const k=b.dataset.day; OPS.sched[k]=!OPS.sched[k]; logCmd('Lịch cuối tuần · '+b.textContent+(OPS.sched[k]?' bật':' tắt')); renderOps(); });
  $('#opBody').querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>openDev(devices.find(x=>x.id===b.dataset.id)));
  $('#hoAdd').onclick=()=>{ const t=$('#hoTxt').value.trim(); if(!t) return;
    OPS.handover.unshift({t:new Date(), who:ROLE_VN[OPS.role], txt:t}); renderOps(); toast('Đã ghi sổ bàn giao'); };
  $('#opOffline').onclick=()=>{ OPS.connected=!OPS.connected; renderOps(); renderHeader(); toast(OPS.connected?'Đã kết nối lại':'Đang mô phỏng mất kết nối, dữ liệu đứng yên'); };
  $('#opPerf').onclick=runBench;
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
function refresh(){ paint3D(); renderHeader(); renderRail();
  if(view.tab==='tower') renderTower();
  else if(view.tab==='floor') renderFloor();
  else if(view.tab==='alarms') renderAlarms();
  else if(view.tab==='ops') renderOps();
  if(view.tab==='floor' && view.sub==='3d' && window.F3 && F3.isBuilt()===view.floor) F3.paint();
  if(view.sel && $('#sheet').classList.contains('open')) renderSheet(view.sel); }
paint3D(); resize3D(); fit3D(); setTab('tower'); refresh();
$('#loading').remove();
setInterval(()=>{ if(document.hidden) return; tick(); refresh(); },1500);
setInterval(()=>{ if(!document.hidden) renderHeader(); },1000);
if(/[?&]bench=1/.test(location.search)) setTimeout(()=>{ setTab('perf'); setTimeout(runBench,600); },800);
};
