// ===== 3D riêng từng tầng: tường, cửa, cầu thang, thiết bị =====
window.F3 = (function(){
let ctx=null, host=null, renderer=null, scene=null, cam=null, group=null, picks=[], dirty=true, built=null, running=false;
const orbit={th:.72, ph:.78, dist:60, tgt:new THREE.Vector3()};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const M={
  slab:new THREE.MeshStandardMaterial({color:0x2C3747,roughness:.95}),
  wall:new THREE.MeshStandardMaterial({color:0xD9DEE7,roughness:.96}),
  glass:new THREE.MeshStandardMaterial({color:0x6FA6C9,transparent:true,opacity:.17,roughness:.1,metalness:.45,side:THREE.DoubleSide,depthWrite:false}),
  door:new THREE.MeshStandardMaterial({color:0xB5712F,roughness:.6}),
  stair:new THREE.MeshStandardMaterial({color:0x9AA3B2,roughness:.9}),
};
const FLOOR_COL={office:0x9FA9BA,meeting:0x98A4BC,stair:0x7E9A88,lift:0x9CA2AC,wc:0x8FB0BA,shaft:0xB49A7E,
  elecshaft:0xC0A072,hall:0xA6AAB4,lobby:0xB3AEA2,retail:0xACA69A,pantry:0xA7B09F,garage:0x72777F,
  pump:0x8E95A0,elec:0xB49B74,roofdeck:0x868E9A,fanroom:0x929BA7,lifttech:0x9097A1,bms:0x9BB0C2};
const GEO={};
function geo(){ if(GEO.fcu) return GEO;
  GEO.fcu=new THREE.BoxGeometry(1.4,.3,.8); GEO.ts=new THREE.BoxGeometry(.4,.5,.16);
  GEO.cv=new THREE.CylinderGeometry(.2,.2,.6,10); GEO.ddc=new THREE.BoxGeometry(.9,1.4,.35);
  GEO.fan=new THREE.BoxGeometry(2,1.4,1.6); GEO.panel=new THREE.BoxGeometry(1,1.8,.45);
  GEO.ctrl=new THREE.BoxGeometry(.7,.9,.3); GEO.sd=new THREE.BoxGeometry(.6,.5,.14);
  return GEO; }
const GK={FCU:'fcu',TS:'ts',CV:'cv',DDC:'ddc',SPF:'fan',SEF:'fan',MAF:'fan',EF:'fan',PANEL:'panel',CTRL:'ctrl',SD:'sd'};
const box=(w,h,d,m)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
const at=(m,x,y,z,ry)=>{ m.position.set(x,y,z); if(ry) m.rotation.y=ry; return m; };
const k2=v=>Math.round(v*100)/100;

function walls(rooms,g,H){
  const lines=new Map();
  const add=(k,a,b,ri,side)=>{ if(!lines.has(k)) lines.set(k,[]); lines.get(k).push({a,b,ri,side}); };
  rooms.forEach((r,ri)=>{ if(r.kind==='roofdeck'||r.kind==='garage') return;
    add('h:'+k2(r.z),r.x,r.x+r.w,ri,'n'); add('h:'+k2(r.z+r.d),r.x,r.x+r.w,ri,'s');
    add('v:'+k2(r.x),r.z,r.z+r.d,ri,'w'); add('v:'+k2(r.x+r.w),r.z,r.z+r.d,ri,'e'); });
  const WT=.16;
  lines.forEach((ents,key)=>{
    const horiz=key[0]==='h', c=+key.slice(2);
    const bps=[...new Set(ents.flatMap(e=>[k2(e.a),k2(e.b)]))].sort((a,b)=>a-b);
    const cov=(p,q)=>ents.filter(e=>e.a<=p+1e-6&&e.b>=q-1e-6);
    for(let i=0;i<bps.length-1;i++){
      const p=bps[i],q=bps[i+1],cv=cov(p,q); if(!cv.length) continue;
      if (cv.some(e=>rooms[e.ri].open.includes(e.side))) continue;
      const ext=cv.length===1, e0=cv[0], room=rooms[e0.ri], isGlass=ext&&room.glass.includes(e0.side);
      const ops=[];
      cv.forEach(e=>{ const rr=rooms[e.ri];
        rr.doors.forEach(([sd,pp])=>{ if(sd!==e.side) return;
          const st=horiz?rr.x:rr.z, L=horiz?rr.w:rr.d, cp=st+pp*L;
          if(cp<p-1e-6||cp>q+1e-6) return;
          ops.push({a:Math.max(p+.1,cp-.5)-p, b:Math.min(q-.1,cp+.5)-p}); }); });
      const segs=[]; let cur=0; const len=q-p;
      ops.sort((a,b)=>a.a-b.a).forEach(o=>{ if(o.a>cur) segs.push([cur,o.a,null]); segs.push([o.a,o.b,o]); cur=o.b; });
      if(cur<len) segs.push([cur,len,null]);
      segs.forEach(([a,b,o])=>{ const L=b-a, mid=p+(a+b)/2;
        const place=(m,h,yb)=>{ if(horiz) m.position.set(mid,yb+h/2,c); else m.position.set(c,yb+h/2,mid); g.add(m); };
        if(!o){
          if(isGlass){ place(box(horiz?L:WT,.85,horiz?WT:L,M.wall),.85,0);
            place(box(horiz?L:.06,H-1.05,horiz?.06:L,M.glass),H-1.05,.85); }
          else place(box(horiz?L:WT,H,horiz?WT:L,M.wall),H,0);
        } else { const LH=Math.min(H-.15,2.2);
          place(box(horiz?L:WT,H-LH,horiz?WT:L,M.wall),H-LH,LH);
          place(box(horiz?L-.08:.05,LH-.05,horiz?.05:L-.08,M.door),LH-.05,0); }
      });
    }
  });
}
function stairs(g,r,H){ const n=Math.max(8,Math.round(H/.17)), run=Math.min(.28,(r.d-1.2)/(n/2));
  for(let i=0;i<n;i++){ const side=i<n/2?0:1, idx=i<n/2?i:i-n/2;
    const st=box(Math.min(1.3,r.w/2-.25),.06,run,M.stair);
    at(st, r.x+(side?r.w*.72:r.w*.28), (i+1)*(H/n), side? r.z+r.d-.6-idx*run : r.z+.6+idx*run); g.add(st); }
  g.add(at(box(r.w-.4,.08,.9,M.stair), r.x+r.w/2, H/2, r.z+r.d-.5)); }
function furnish(g,r){
  const cx=r.x+r.w/2, cz=r.z+r.d/2;
  const put=(w,h,d,col,x,z)=>{ const m=box(w,h,d,new THREE.MeshStandardMaterial({color:col,roughness:.85})); at(m,x,h/2,z); g.add(m); };
  if(r.kind==='office'||r.kind==='bms'){ const cols=Math.max(1,Math.floor((r.w-1.2)/2.4)), rows=Math.max(1,Math.floor((r.d-1.4)/2));
    for(let i=0;i<cols;i++) for(let j=0;j<rows;j++){ const x=r.x+1.2+i*2.4, z=r.z+1+j*2;
      put(1.4,.04,.7,0xE8E4DC,x,z); put(.5,.32,.04,0x15181E,x,z-.22); put(.45,.45,.45,0x3A3D45,x,z+.6); } }
  else if(r.kind==='meeting'){ put(Math.min(3,r.w*.5),.05,1.1,0x8A6A4E,cx,cz); for(let i=0;i<6;i++) put(.45,.45,.45,0x3A3D45,cx-1.2+(i%3)*1.2,cz+(i<3?-1:1)); }
  else if(r.kind==='wc'){ for(let i=0;i<3;i++) put(.4,.4,.55,0xF2F2EE,r.x+.5+i*.7,r.z+r.d-.5); put(r.w-.6,.12,.5,0xE6EAF0,cx,r.z+.4); }
  else if(r.kind==='lift'){ for(let i=0;i<4;i++) put(1.9,2.2,.12,0x8A93A3,r.x+1.4+i*((r.w-2.4)/3),r.z+.1); }
  else if(r.kind==='pantry'){ put(r.w-1,.9,.6,0x7A7F85,cx,r.z+.4); put(1.2,.75,.7,0x9A6F45,cx,cz+1); }
  else if(r.kind==='lobby'||r.kind==='retail'){ put(2.6,1,.6,0x7B5E48,cx,r.z+.8); for(let i=0;i<3;i++) put(1.6,.4,.8,0xE9E5DC,cx-3+i*3,cz+1.5); }
  else if(r.kind==='garage'){ for(let i=0;i<6;i++) put(1.8,.5,4.2,[0x4D5B73,0x6E7480,0x3C4556][i%3],r.x+3+i*5,r.z+r.d*.3); }
  else if(r.kind==='pump'||r.kind==='fanroom'){ put(2.2,1.6,1.4,0x9AA3B2,cx,cz); put(1.2,1.4,.9,0x8A93A3,cx+2.4,cz); }
  else if(r.kind==='elec'){ for(let i=0;i<3;i++) put(.9,1.8,.4,0xC9B189,r.x+1+i*1.2,r.z+.4); }
  else if(r.kind==='lifttech'){ put(2.4,1.2,1.6,0x9AA3B2,cx,cz); }
}
function devPos(d,f){ const r=f.rooms[d.room]; if(!r) return {x:0,y:1.2,z:0,ry:0};
  const H=BLD.H, cx=r.x+r.w/2, cz=r.z+r.d/2;
  switch(d.t){ case 'FCU': return {x:cx,y:H-.45,z:cz-.6,ry:0}; case 'TS': return {x:r.x+.3,y:1.4,z:cz,ry:Math.PI/2};
    case 'CV': return {x:cx+1.4,y:H-.8,z:cz-.6,ry:0}; case 'DDC': return {x:r.x+r.w-.4,y:1.1,z:cz,ry:-Math.PI/2};
    case 'PANEL': return {x:r.x+1,y:.9,z:r.z+.6,ry:0}; case 'CTRL': return {x:r.x+2.4,y:1.3,z:r.z+.5,ry:0};
    case 'SD': return {x:cx,y:H-.5,z:r.z+.7,ry:0}; default: return {x:cx,y:.8,z:cz+1,ry:0}; } }
function label(text,w){
  const c=document.createElement('canvas'); c.width=512; c.height=128; const g=c.getContext('2d');
  g.font='600 44px "Be Vietnam Pro",system-ui,sans-serif'; const tw=Math.min(500,g.measureText(text).width+56);
  g.fillStyle='rgba(16,20,28,.84)'; g.beginPath(); if(g.roundRect) g.roundRect((512-tw)/2,22,tw,84,42); else g.rect((512-tw)/2,22,tw,84); g.fill();
  g.fillStyle='#fff'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(text,256,66,480);
  const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,depthTest:false}));
  s.scale.set(w,w/4,1); s.renderOrder=5; return s; }

function build(fid){
  if (!renderer) return;
  built=fid; picks=[];
  if (group){ scene.remove(group); }
  group=new THREE.Group(); scene.add(group);
  const f=ctx.floorOf(fid), H=BLD.H, G=geo();
  group.add(at(box(BLD.W+.6,BLD.slab,BLD.D+.6,M.slab),0,-BLD.slab/2,0));
  f.rooms.forEach(r=>{
    const mat=new THREE.MeshStandardMaterial({color:FLOOR_COL[r.kind]||0x9FA9BA,roughness:.95,emissive:0x000000,emissiveIntensity:0});
    const pl=new THREE.Mesh(new THREE.PlaneGeometry(r.w-.08,r.d-.08),mat);
    pl.rotation.x=-Math.PI/2; pl.position.set(r.x+r.w/2,.012,r.z+r.d/2); group.add(pl); r._m3=mat;
    if(r.kind==='stair') stairs(group,r,H);
    furnish(group,r);
    if (r.w>3.4){ const lb=label(r.n,Math.min(3.2,r.w*.42)); lb.position.set(r.x+r.w/2,2.5,r.z+r.d/2); group.add(lb); }
  });
  walls(f.rooms,group,H);
  ctx.devices.filter(d=>d.floor===fid).forEach(d=>{
    const p=devPos(d,f);
    const m=new THREE.Mesh(G[GK[d.t]||'ts'], new THREE.MeshStandardMaterial({color:ctx.HEX[d.status],roughness:.5,metalness:.15}));
    at(m,p.x,p.y,p.z,p.ry); m.userData.dev=d; d.m3=m; group.add(m); picks.push(m);
  });
  paint(); fit(); dirty=true;
}
function paint(){
  if(!group||!built) return;
  const f=ctx.floorOf(built);
  f.rooms.forEach((r,ri)=>{ if(!r._m3) return;
    const ds=ctx.devices.filter(d=>d.floor===built&&d.room===ri);
    const w=ctx.worstOf(ds);
    r._m3.emissive.setHex(w==='ok'?0x000000:ctx.HEX[w]); r._m3.emissiveIntensity=w==='ok'?0:.3; });
  ctx.devices.filter(d=>d.floor===built&&d.m3).forEach(d=>{
    d.m3.material.color.setHex(ctx.HEX[d.status]);
    const sel = ctx.selected && ctx.selected()===d;
    const s = sel?1.9:(d.status==='ok'?1:1.35); d.m3.scale.set(s,s,s);
    d.m3.material.emissive.setHex(sel?0xFFFFFF:0x000000); d.m3.material.emissiveIntensity=sel?.45:0; });
  dirty=true;
}
function fit(){ if(!host) return; const asp=Math.max(.35,(host.clientWidth||1)/(host.clientHeight||1));
  const R=Math.sqrt((BLD.W/2)**2+(BLD.D/2)**2+9);
  orbit.dist=clamp(R/Math.sin(cam.fov*Math.PI/360)*(asp<1?.95:.72),14,220);
  orbit.tgt.set(0,1.4,0); dirty=true; }
function resize(){ if(!host||!renderer) return; const w=host.clientWidth,h=host.clientHeight; if(!w||!h) return;
  renderer.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix(); dirty=true; }
function updateCam(){ const {th,ph,dist,tgt}=orbit;
  cam.position.set(tgt.x+dist*Math.sin(ph)*Math.sin(th), tgt.y+dist*Math.cos(ph), tgt.z+dist*Math.sin(ph)*Math.cos(th)); cam.lookAt(tgt); }

function init(c){
  ctx=c; host=document.getElementById('fl3d');
  const MOB=matchMedia('(max-width:860px)').matches||(navigator.maxTouchPoints||0)>1;
  renderer=new THREE.WebGLRenderer({antialias:!MOB});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,MOB?1.75:2));
  renderer.outputEncoding=THREE.sRGBEncoding; renderer.setClearColor(0x000000,0);
  host.appendChild(renderer.domElement);
  renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none';
  scene=new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xB6C6DC,0x121824,1.05));
  const k=new THREE.DirectionalLight(0xffffff,.5); k.position.set(30,60,25); scene.add(k);
  cam=new THREE.PerspectiveCamera(MOB?46:38,1,.1,400);
  new ResizeObserver(()=>{resize(); fit();}).observe(host);
  // chạm
  const ptrs=new Map(); let drag=null,moved=0,pinch=null; const el=renderer.domElement; el.style.cursor='grab';
  el.addEventListener('pointerdown',e=>{ el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ptrs.size===1){drag={x:e.clientX,y:e.clientY,th:orbit.th,ph:orbit.ph};moved=0;}
    else if(ptrs.size===2){const [a,b]=[...ptrs.values()]; pinch={d:Math.hypot(a.x-b.x,a.y-b.y),dist:orbit.dist}; drag=null;} });
  el.addEventListener('pointermove',e=>{ if(!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch&&ptrs.size===2){const [a,b]=[...ptrs.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y); orbit.dist=clamp(pinch.dist*pinch.d/Math.max(d,1),8,260); dirty=true; return;}
    if(!drag) return; const dx=e.clientX-drag.x,dy=e.clientY-drag.y; moved=Math.max(moved,Math.abs(dx)+Math.abs(dy));
    orbit.th=drag.th-dx*.006; orbit.ph=clamp(drag.ph-dy*.005,.12,1.5); dirty=true; });
  const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
  function pick(e){ const r=el.getBoundingClientRect(); ndc.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);
    ray.setFromCamera(ndc,cam); const h=ray.intersectObjects(picks,false)[0];
    if(h&&h.object.userData.dev) ctx.onPick(h.object.userData.dev); }
  function end(e){ ptrs.delete(e.pointerId); if(ptrs.size<2) pinch=null; if(drag&&moved<7) pick(e); drag=null; }
  el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end);
  el.addEventListener('wheel',e=>{e.preventDefault(); orbit.dist=clamp(orbit.dist*(1+Math.sign(e.deltaY)*.09),8,260); dirty=true;},{passive:false});
  running=true;
  (function loop(){ requestAnimationFrame(loop);
    if(!running||!dirty||host.offsetParent===null) return; dirty=false; updateCam(); renderer.render(scene,cam); })();
}
return { init, build, paint, fit, resize, mark:()=>{dirty=true;}, isBuilt:()=>built, info:()=>renderer?renderer.info.render:{calls:0,triangles:0} };
})();
