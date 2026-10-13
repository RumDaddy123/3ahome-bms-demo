// ===== BẢNG THỐNG KÊ =====
// Màn này để trình bày: chủ đầu tư xem, ban quản lý xem, mang đi chào hàng.
// Biểu đồ vẽ thẳng bằng SVG, không kéo thư viện ngoài, để máy chủ trong phòng kỹ thuật
// không cần internet vẫn chạy đủ.
window.DASH = (function(){

const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const vnd = n => n>=1e9 ? (n/1e9).toFixed(2)+' tỉ'
               : n>=1e6 ? (n/1e6).toFixed(n>=1e7?0:1).replace('.0','')+' triệu'
               : Math.round(n/1000)+' nghìn';
const num = n => Math.round(n).toLocaleString('vi-VN');
let uid = 0;

// ---------- đồng hồ cung tròn ----------
function gauge(pct, label, sub, color){
  const p = Math.max(0, Math.min(100, pct));
  const R=52, C=Math.PI*R;                       // nửa vòng tròn
  const on = C*(p/100);
  return `<svg viewBox="0 0 140 86" class="gau">
    <path d="M14 76 A ${R} ${R} 0 0 1 126 76" fill="none" stroke="var(--line)" stroke-width="11" stroke-linecap="round"/>
    <path d="M14 76 A ${R} ${R} 0 0 1 126 76" fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round"
      stroke-dasharray="${on.toFixed(1)} ${(C-on).toFixed(1)}"/>
    <text x="70" y="64" class="gv">${label}</text>
    <text x="70" y="80" class="gs">${esc(sub)}</text>
  </svg>`;
}

// ---------- biểu đồ miền có dải tin cậy ----------
function area(rows, opt){
  const o = Object.assign({w:320, h:120, pl:28, pb:16, key:'kw', base:'base', band:true}, opt||{});
  if (!rows.length) return '';
  const id = 'g'+(++uid);
  const pw=o.w-o.pl-6, ph=o.h-o.pb-10;
  const max = Math.max(...rows.map(r=>Math.max(r[o.key]||0, r[o.base]||0, r.hi||0)))*1.14 || 1;
  const X = i => o.pl + (i/(rows.length-1||1))*pw;
  const Y = v => 10 + ph - (v/max)*ph;
  const pts  = rows.map((r,i)=>`${X(i).toFixed(1)},${Y(r[o.key]).toFixed(1)}`).join(' ');
  const fill = `${o.pl},${(10+ph).toFixed(1)} ${pts} ${X(rows.length-1).toFixed(1)},${(10+ph).toFixed(1)}`;
  const band = o.band && rows[0].hi!=null
    ? `<polygon points="${rows.map((r,i)=>`${X(i).toFixed(1)},${Y(r.hi).toFixed(1)}`).join(' ')} ${
        rows.slice().reverse().map((r,i)=>`${X(rows.length-1-i).toFixed(1)},${Y(r.lo).toFixed(1)}`).join(' ')}"
        fill="var(--accent)" opacity=".12"/>` : '';
  const bl = o.base ? `<polyline points="${rows.map((r,i)=>`${X(i).toFixed(1)},${Y(r[o.base]).toFixed(1)}`).join(' ')}"
      fill="none" stroke="var(--ink-2)" stroke-width="1.3" stroke-dasharray="3 2.5" opacity=".75"/>` : '';
  const gl = [0,.5,1].map(f=>`<line x1="${o.pl}" x2="${o.w-6}" y1="${(10+ph-f*ph).toFixed(1)}" y2="${(10+ph-f*ph).toFixed(1)}" stroke="var(--line)"/>
    <text x="${o.pl-5}" y="${(14+ph-f*ph).toFixed(1)}" class="eg">${num(max*f)}</text>`).join('');
  const lb = o.labels ? o.labels.map(([i,t])=>`<text x="${X(i).toFixed(1)}" y="${o.h-3}" class="ex">${esc(t)}</text>`).join('') : '';
  return `<svg viewBox="0 0 ${o.w} ${o.h}" class="echart">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity=".45"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    ${gl}${band}<polygon points="${fill}" fill="url(#${id})"/>
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
    ${bl}${lb}</svg>`;
}

// ---------- vành khuyên ----------
function donut(parts, center, sub){
  const tot = parts.reduce((s,p)=>s+p.v,0) || 1;
  const R=46, SW=16, C=2*Math.PI*R;
  let acc=0;
  const segs = parts.map(p=>{
    const len=C*(p.v/tot), s=`<circle cx="60" cy="60" r="${R}" fill="none" stroke="${p.c}" stroke-width="${SW}"
      stroke-dasharray="${Math.max(0,len-2).toFixed(1)} ${(C-len+2).toFixed(1)}"
      stroke-dashoffset="${(-acc).toFixed(1)}" transform="rotate(-90 60 60)"/>`;
    acc+=len; return s; }).join('');
  return `<div class="dnwrap"><svg viewBox="0 0 120 120" class="dn">${segs}
    <text x="60" y="58" class="dv">${esc(center)}</text><text x="60" y="74" class="ds">${esc(sub)}</text></svg>
    <div class="dnlg">${parts.map(p=>`<div><i style="background:${p.c}"></i><span>${esc(p.n)}</span>
      <b>${Math.round(p.v/tot*100)}%</b></div>`).join('')}</div></div>`;
}

// ---------- thanh ngang ----------
function hbars(items){
  const max = Math.max(...items.map(i=>i.v)) || 1;
  return `<div class="hb">${items.map(i=>`<button class="hbr" ${i.go?`data-floor="${i.go}"`:''}>
    <span>${esc(i.n)}</span><div class="bar"><i style="width:${(i.v/max*100).toFixed(0)}%;background:${i.c||'var(--accent)'}"></i></div>
    <b class="mono">${esc(i.t)}</b></button>`).join('')}</div>`;
}

// ---------- bản đồ nhiệt ----------
function heatGrid(rows, metric){
  const sc = STATS.HEAT_SCALE[metric] || STATS.HEAT_SCALE.temp;
  const col = v => sc(v) || 'var(--off)';
  return `<div class="hm">${rows.map(r=>`<div class="hmr"><span>${esc(r.name.replace('Tầng ','T'))}</span>
    <div class="hmc">${r.cells.map(c=>`<i data-id="${c.id}" style="background:${col(c.v)}"
      title="${esc(c.room+' · '+c.txt)}"></i>`).join('')}</div></div>`).join('')}
    <div class="hmlg">${(STATS.HEAT_LEGEND[metric]||STATS.HEAT_LEGEND.temp)
      .map(([c,t])=>`<span><i style="background:${c}"></i>${esc(t)}</span>`).join('')}
      <span><i style="background:var(--off)"></i>mất kết nối</span></div></div>`;
}

// ================= màn hình =================
function render(ctx){
  const { devices, BLD, floorOf, kwNow, gia } = ctx;
  const e  = window.EN && EN.stats();
  const h  = window.HLT && HLT.last();
  const al = window.AL && AL.stats();
  const oc = window.OCC && OCC.stats();
  const fd = window.FDD && FDD.stats();
  if (!e || !h || !al) return '<p class="muted">Đang gom dữ liệu…</p>';

  const fc  = STATS.forecast(ctx.openAt);
  const bill= STATS.monthBill(gia);
  const cf  = STATS.comfort(devices);
  const it  = STATS.intensity(kwNow, devices);
  const bd  = STATS.breakdown(devices, kwNow);
  const rk  = STATS.risk(devices);
  const hp  = HLT.score(h);
  const dn  = e.deltaNow;

  const tile = (v, u, lb, cls, foot) => `<div class="tile ${cls||''}">
    <b>${v}<small>${u||''}</small></b><span>${esc(lb)}</span>${foot?`<em>${foot}</em>`:''}</div>`;

  return `
  <div class="dgrid">

    <div class="card span2"><div class="ch">Hôm nay</div>
      <div class="tiles">
        ${tile(num(e.kwh), ' kWh', 'Điện năng đã dùng', '', `mức chuẩn ${num(e.base)} kWh`)}
        ${tile(vnd(e.kwh*gia), ' đ', 'Chi phí điện', '', `giá ${gia.toLocaleString('vi-VN')} đ/kWh`)}
        ${tile((dn>0?'+':'')+dn.toFixed(0), '%', 'So với mức chuẩn', dn>10?'bad':dn>3?'warn':'good',
          dn>3?`vượt ${num(e.excess)} kWh`:'đang trong mức')}
        ${tile(it.kwm2.toFixed(1), ' W/m²', 'Cường độ năng lượng', it.kwm2>45?'warn':'good', `trên ${num(it.m2)} m² có điều hoà`)}
        ${tile(e.offShare.toFixed(0), '%', 'Điện ngoài giờ', e.offShare>30?'bad':e.offShare>20?'warn':'good', `${num(e.offKwh)} kWh`)}
        ${tile(al.n, '', 'Lỗi đang mở', al.p1?'bad':al.n?'warn':'good', al.p1?`${al.p1} việc khẩn`:'không có việc khẩn')}
      </div></div>

    <div class="card"><div class="ch">Sức khoẻ và tiện nghi</div>
      <div class="gaus">
        ${gauge(hp, hp, 'điểm hệ BMS', hp>=90?'var(--ok)':hp>=75?'var(--warn)':'var(--alarm)')}
        ${gauge(cf.temp, cf.temp.toFixed(0)+'%', 'phòng đạt nhiệt độ', cf.temp>=85?'var(--ok)':'var(--warn)')}
        ${gauge(cf.co2, cf.co2.toFixed(0)+'%', 'phòng đủ khí tươi', cf.co2>=90?'var(--ok)':'var(--warn)')}
      </div>
      <p class="muted">Tiện nghi là thứ khách thuê cảm nhận được. Tiết kiệm điện mà phòng nóng thì không ai khen.</p></div>

    <div class="card"><div class="ch">Phụ tải đang dùng vào việc gì</div>
      ${donut(bd, num(kwNow), 'kW')}
      <p class="muted">Ước tính theo trạng thái thiết bị đang chạy. Khi lắp đồng hồ đo riêng từng nhánh thì thay bằng số đo thật.</p></div>

    ${fc?`<div class="card span2"><div class="ch">Dự báo phụ tải 24 giờ tới</div>
      ${area(fc.rows, {w:360, h:104, key:'kw', base:'base', band:true,
        labels:[[0,fc.rows[0].h+'h'],[7,fc.rows[7].h+'h'],[15,fc.rows[15].h+'h'],[23,fc.rows[23].h+'h']]})}
      <div class="elg"><span><i style="background:var(--accent)"></i>dự báo</span>
        <span><i class="dash"></i>mức chuẩn</span><span><i style="background:rgba(39,200,214,.25)"></i>khoảng dao động</span></div>
      <div class="row2"><span>Đỉnh phụ tải dự kiến</span><b class="mono">${fc.peak.kw.toFixed(0)} kW lúc ${fc.peak.h}h</b></div>
      <div class="row2"><span>Điện năng 24 giờ tới</span><b class="mono">${num(fc.kwh)} kWh · ${vnd(fc.kwh*gia)} đ</b></div>
      <p class="muted">Tính từ nhiệt độ ngoài trời và lịch vận hành của từng khung giờ, rồi hiệu chỉnh theo sai lệch thực tế mấy giờ gần nhất (hệ số ${fc.bias.toFixed(2)}). Đây là ước tính, không phải cam kết.</p></div>`:''}

    ${bill?`<div class="card"><div class="ch">Dự phóng hoá đơn tháng này</div>
      <div class="bigrow"><div><b>${num(bill.kwh)}</b><span>kWh đã dùng · ${bill.done}/${bill.dim} ngày</span></div>
        <div><b class="${bill.pc>8?'cwarn':'cok'}">${num(bill.proj)}</b><span>kWh dự phóng cả tháng</span></div></div>
      <div class="pbar"><i style="width:${(bill.done/bill.dim*100).toFixed(0)}%"></i></div>
      <div class="row2"><span>Tiền điện dự phóng</span><b class="mono">${vnd(bill.vnd)} đ</b></div>
      <div class="row2"><span>So với mức chuẩn</span><b class="mono ${bill.pc>0?'cwarn':'cok'}">${bill.pc>0?'+':''}${bill.pc.toFixed(0)}% · ${vnd(Math.abs(bill.overVnd))} đ</b></div>
      <p class="muted">Lấy mức dùng trung bình ${bill.done} ngày đầu tháng nhân cho số ngày còn lại.</p></div>`:''}

    <div class="card span2"><div class="ch">Bản đồ toà nhà theo phòng</div>
      <div class="subnav tight">${[['temp','Chênh nhiệt độ'],['co2','Khí tươi CO₂'],['occ','Người trong phòng']]
        .map(([k,v])=>`<button data-hm="${k}" class="${(ctx.heatMetric||'temp')===k?'on':''}">${v}</button>`).join('')}</div>
      ${heatGrid(STATS.heat(devices, floorOf, BLD, 14, ctx.heatMetric||'temp'), ctx.heatMetric||'temp')}
      <p class="muted">Mỗi ô là một phòng, mỗi hàng là một tầng. Chạm vào ô để mở thiết bị. Toàn bộ là số đo đang về từ cảm biến, không phải đồ hoạ minh hoạ.</p></div>

    <div class="card"><div class="ch">Tầng tốn điện nhất</div>
      ${hbars(STATS.floorRank(devices, BLD, 6).map(x=>({n:x.f.name, v:x.kw, t:Math.round(x.kw)+' kW', go:x.f.id})))}</div>

    <div class="card span2"><div class="ch">Dự đoán rủi ro hỏng hóc</div>
      <div class="rsks">${rk.length? rk.map(r=>`<div class="rsk ${r.lvl==='cao'?'hi':r.lvl==='vừa'?'md':''}">
          <div class="rh"><b>${esc(r.d.tag)}</b><span class="rlv">${r.lvl}</span></div>
          <div class="floc">${esc(floorOf(r.d.floor).name)}${r.k>1?` · ${r.k} loại dấu hiệu`:''} · ${esc(r.act)}</div>
          <div class="bar"><i style="width:${r.pts}%;background:${r.lvl==='cao'?'var(--alarm)':r.lvl==='vừa'?'var(--warn)':'var(--ok)'}"></i></div>
          <div class="fev">${esc(r.why.slice(0,3).join(' · '))}</div>
          <button class="mini" data-id="${r.d.id}">Mở thiết bị</button></div>`).join('')
        : '<p class="muted">Chưa thiết bị nào có dấu hiệu đáng lo.</p>'}</div>
      <p class="muted">Chấm điểm cộng dồn từ bốn dấu hiệu: quá chu kỳ bảo trì, đang có triệu chứng trong chẩn đoán, từng lặp lỗi nhiều lần, và giờ chạy tích luỹ. Mức "cao" chỉ đặt khi có ít nhất hai loại dấu hiệu khác nhau — tới hạn bảo trì một mình chưa phải nguy cơ hỏng. Là suy đoán có căn cứ để sắp thứ tự công việc, không phải lời tiên tri.</p></div>

    <div class="card span2"><div class="ch">Hệ thống tự động làm được gì cho toà nhà</div>
      <div class="tiles">
        ${tile(fd?fd.n:0, '', 'Lỗi tự phát hiện', fd&&fd.n?'warn':'good', fd?`ước tính ${vnd(fd.vnd)} đ/tháng`:'')}
        ${tile(oc?oc.released:0, '', 'Lịch đặt phòng đã trả lại', 'good', `${oc?oc.setback:0} phòng đang lùi cài đặt`)}
        ${tile(oc?vnd(oc.monthVnd):0, ' đ', 'Tiết kiệm nhờ chiếm dụng', 'good', 'quy ra mỗi tháng')}
        ${tile(al.esc, '', 'Cảnh báo đã leo thang', al.esc?'bad':'good', 'quá hạn chưa ai nhận')}
        ${tile(window.WK?WK.stats().done:0, '', 'Phiếu đã hoàn thành', 'good', `${window.WK?WK.stats().open:0} phiếu đang mở`)}
        ${tile(h.avail.toFixed(1), '%', 'Điểm dữ liệu về đủ', h.avail>99?'good':'warn', `${h.off.length} điểm mất kết nối`)}
      </div></div>

  </div>`;
}

function bind(B, ctx){
  B.querySelectorAll('[data-hm]').forEach(x=>x.onclick=()=>ctx.setHeat(x.dataset.hm));
  B.querySelectorAll('[data-id]').forEach(x=>x.onclick=()=>ctx.openDev(x.dataset.id));
  B.querySelectorAll('[data-floor]').forEach(x=>x.onclick=()=>ctx.openFloor(x.dataset.floor));
}

return { render, bind, gauge, area, donut, hbars, heatGrid, vnd, num };
})();
