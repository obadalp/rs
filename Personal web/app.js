(function(){
function distKm(a,b){const R=6371;const φ1=a.lat*Math.PI/180,φ2=b.lat*Math.PI/180;const dφ=(b.lat-a.lat)*Math.PI/180;const dλ=(b.lon-a.lon)*Math.PI/180;const h=Math.sin(dφ/2)**2+Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
function parseDur(s){if(!s)return 0;const[h,m]=s.split(':').map(Number);return(h||0)*60+(m||0);}
function fmtMin(m){const h=Math.floor(m/60),mm=m%60;return `${h}h ${String(mm).padStart(2,'0')}m`;}
function fmtNum(n){return new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:0}).format(n);}
function flagEmoji(iso){if(!iso||iso.length!==2)return'';const A=0x1F1E6;return String.fromCodePoint(A+iso.charCodeAt(0)-65,A+iso.charCodeAt(1)-65);}
function fmt(d){if(!d)return'—';const[Y,M,D]=d.split('-');return `${D}.${M}.${Y}`;}

let sortKey='date',sortDir=-1;
let globe=null;

window.__dataReady = function(){
  const F = window.FLIGHTS, AP = window.AIRPORTS;
  F.forEach(f=>{const a=AP[f.from],b=AP[f.to];f.durMin=parseDur(f.duration);f.distKm=(a&&b)?Math.round(distKm(a,b)):0;f.year=f.date?Number(f.date.slice(0,4)):null;f.fromAp=a;f.toAp=b;});

  // Group flights by route (from+to key)
  const routeMap = new Map();
  F.forEach(f=>{
    if(!f.fromAp||!f.toAp) return;
    const key = f.from+'→'+f.to;
    if(!routeMap.has(key)) routeMap.set(key,{from:f.from,to:f.to,fromAp:f.fromAp,toAp:f.toAp,flights:[],distKm:f.distKm});
    routeMap.get(key).flights.push(f);
  });
  const routes = [...routeMap.values()].sort((a,b)=>b.flights.length-a.flights.length);

  // Topbar meta
  const totalKm = F.reduce((s,f)=>s+f.distKm,0);
  const totalMin = F.reduce((s,f)=>s+f.durMin,0);
  document.getElementById('brand-sub').textContent = `${F.length} letů · ${fmt(F[0].date)} → ${fmt(F[F.length-1].date)}`;
  document.getElementById('br-stats').textContent = `${fmtNum(totalKm)} km · ${Math.round(totalMin/60)} h`;

  // Hero
  const countries = new Set(); F.forEach(f=>{if(f.fromAp)countries.add(f.fromAp.country);if(f.toAp)countries.add(f.toAp.country);});
  const airports = Object.keys(AP).filter(k=>F.some(f=>f.from===k||f.to===k));
  document.getElementById('hero-big').textContent = `${F.length} letů`;
  document.getElementById('hero-sub').textContent = `${airports.length} letišť · ${countries.size} zemí · ${routes.length} unikátních tras`;
  document.getElementById('hs-km').innerHTML = `${fmtNum(totalKm)}<span class="u">km</span>`;
  document.getElementById('hs-hrs').innerHTML = `${Math.round(totalMin/60)}<span class="u">h</span>`;
  document.getElementById('hs-countries').textContent = countries.size;
  document.getElementById('hs-globe').innerHTML = `${(totalKm/40075).toFixed(2)}<span class="u">×</span>`;

  // Top routes list (sidebar)
  const topRoutes = routes.slice(0,10);
  const maxRouteCount = topRoutes[0]?.flights.length || 1;
  document.getElementById('rt-count').textContent = routes.length;
  document.getElementById('top-routes').innerHTML = topRoutes.map((r,i)=>`
    <div class="li" data-route="${r.from}→${r.to}">
      <div>
        <div class="li-title">${r.from} <span style="color:var(--accent)">→</span> ${r.to}</div>
        <div class="li-meta">${r.fromAp.city} · ${r.toAp.city}</div>
        <div class="rt-bar"><div class="rt-bar-fill" style="width:${r.flights.length/maxRouteCount*100}%"></div></div>
      </div>
      <div class="li-val">${r.flights.length}×<br><span style="color:var(--text-3)">${fmtNum(r.distKm)}km</span></div>
    </div>
  `).join('');
  document.querySelectorAll('[data-route]').forEach(el=>{
    el.addEventListener('click',()=>{
      const key = el.dataset.route;
      const idx = routes.findIndex(r=>r.from+'→'+r.to===key);
      if(idx>=0){
        globe.selectRoute(idx);
        const r = routes[idx];
        const midLon = (r.fromAp.lon+r.toAp.lon)/2;
        const midLat = (r.fromAp.lat+r.toAp.lat)/2;
        globe.focusOn(midLon, midLat);
        showPopover(r);
      }
    });
  });

  // Years
  const perYear = {}; F.forEach(f=>perYear[f.year]=(perYear[f.year]||0)+1);
  const years = Object.keys(perYear).sort();
  const maxY = Math.max(...Object.values(perYear));
  document.getElementById('years-bars').innerHTML = years.map(y=>`
    <div class="bar-row">
      <div class="bar-label"><span>${y}</span><span class="n">${perYear[y]}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${perYear[y]/maxY*100}%"></div></div>
    </div>
  `).join('');

  // Records
  const longest = [...F].sort((a,b)=>b.distKm-a.distKm)[0];
  const shortest = [...F].filter(f=>f.distKm>0).sort((a,b)=>a.distKm-b.distKm)[0];
  const longT = [...F].sort((a,b)=>b.durMin-a.durMin)[0];
  document.getElementById('records-list').innerHTML = [
    ['Nejdelší',longest,`${longest.distKm}km`],
    ['Nejkratší',shortest,`${shortest.distKm}km`],
    ['Nejvíc hodin',longT,fmtMin(longT.durMin)],
    ['První let',F[0],fmt(F[0].date)]
  ].map(([l,f,v])=>`
    <div class="li">
      <div>
        <div class="li-title">${f.fromAp?.city||f.from} → ${f.toAp?.city||f.to}</div>
        <div class="li-meta">${l} · ${f.airline||'—'}</div>
      </div>
      <div class="li-val">${v}</div>
    </div>
  `).join('');

  // Flights table
  const yearSel = document.getElementById('f-year');
  [...new Set(F.map(f=>f.year))].sort().forEach(y=>{const o=document.createElement('option');o.value=y;o.textContent=y;yearSel.appendChild(o);});
  const aSel = document.getElementById('f-airline');
  [...new Set(F.map(f=>f.airline).filter(Boolean))].sort().forEach(a=>{const o=document.createElement('option');o.value=a;o.textContent=a;aSel.appendChild(o);});
  ['f-year','f-airline','f-search'].forEach(id=>document.getElementById(id).addEventListener('input',renderFlights));
  document.getElementById('f-clear').addEventListener('click',()=>{['f-year','f-airline'].forEach(id=>document.getElementById(id).value='');document.getElementById('f-search').value='';renderFlights();});
  document.querySelectorAll('.ft th[data-sort]').forEach(th=>th.addEventListener('click',()=>{const k=th.dataset.sort;if(sortKey===k)sortDir*=-1;else{sortKey=k;sortDir=1;}renderFlights();}));
  function renderFlights(){
    const y=document.getElementById('f-year').value;
    const al=document.getElementById('f-airline').value;
    const q=document.getElementById('f-search').value.trim().toLowerCase();
    let list = F.filter(f=>{
      if(y&&String(f.year)!==y)return false;
      if(al&&f.airline!==al)return false;
      if(q){const hay=`${f.from} ${f.to} ${f.fromAp?.city} ${f.toAp?.city} ${f.airline} ${f.aircraft}`.toLowerCase();if(!hay.includes(q))return false;}
      return true;
    });
    list.sort((a,b)=>{let va,vb;if(sortKey==='route'){va=a.from+a.to;vb=b.from+b.to;}else if(sortKey==='duration'){va=a.durMin;vb=b.durMin;}else if(sortKey==='distance'){va=a.distKm;vb=b.distKm;}else{va=a.date;vb=b.date;}if(va<vb)return -sortDir;if(va>vb)return sortDir;return 0;});
    document.querySelectorAll('.ft th').forEach(th=>th.classList.toggle('sorted',th.dataset.sort===sortKey));
    document.getElementById('ft-count').textContent = list.length;
    document.getElementById('ft-body').innerHTML = list.map(f=>`
      <tr data-from="${f.from}" data-to="${f.to}">
        <td style="font-family:var(--mono);font-size:11px;color:var(--text-2);white-space:nowrap">${fmt(f.date)}</td>
        <td><div class="ft-route-cell">${f.from}<span class="arr">→</span>${f.to}</div><div class="ft-cities-sm">${f.airline||'—'}</div></td>
        <td class="num" style="font-family:var(--mono)">${fmtMin(f.durMin)}</td>
        <td class="num" style="font-family:var(--mono)">${fmtNum(f.distKm)}</td>
      </tr>
    `).join('');
    document.querySelectorAll('.ft tbody tr').forEach(tr=>{
      tr.addEventListener('click',()=>{
        const key = tr.dataset.from+'→'+tr.dataset.to;
        const idx = routes.findIndex(r=>r.from+'→'+r.to===key);
        if(idx>=0){globe.selectRoute(idx);const r=routes[idx];globe.focusOn((r.fromAp.lon+r.toAp.lon)/2,(r.fromAp.lat+r.toAp.lat)/2);showPopover(r);}
      });
    });
  }
  renderFlights();

  // Countries
  const byC = {};
  F.forEach(f=>[f.fromAp,f.toAp].forEach(a=>{if(!a)return;if(!byC[a.country])byC[a.country]={iso:a.iso,cities:new Set(),count:0};byC[a.country].cities.add(a.city);byC[a.country].count++;}));
  const cnEntries = Object.entries(byC).sort((a,b)=>b[1].count-a[1].count);
  document.getElementById('cn-count').textContent = cnEntries.length;
  document.getElementById('cn-list').innerHTML = cnEntries.map(([n,d])=>`
    <div class="cg-item">
      <div class="cg-flag">${flagEmoji(d.iso)}</div>
      <div><div class="cg-name">${n}</div><div class="cg-sub">${d.cities.size} ${d.cities.size===1?'město':'měst'} · ${[...d.cities].join(', ')}</div></div>
      <div class="cg-n">${d.count}×</div>
    </div>
  `).join('');

  // Taste bars
  function countBy(arr,fn){const m=new Map();arr.forEach(x=>{const k=fn(x);if(!k||k==='—')return;m.set(k,(m.get(k)||0)+1);});return[...m.entries()].sort((a,b)=>b[1]-a[1]);}
  function renderBars(id,entries,limit){
    if(!entries.length){document.getElementById(id).innerHTML='<div class="empty">žádná data</div>';return;}
    const max = entries[0][1];
    const list = limit?entries.slice(0,limit):entries;
    document.getElementById(id).innerHTML = list.map(([k,n])=>`<div class="bar-row"><div class="bar-label"><span>${k}</span><span class="n">${n}</span></div><div class="bar-track"><div class="bar-fill" style="width:${n/max*100}%"></div></div></div>`).join('');
  }
  renderBars('b-airlines', countBy(F,f=>f.airline));
  renderBars('b-aircraft', countBy(F,f=>f.aircraft));
  renderBars('b-seat', countBy(F,f=>window.SEAT_TYPES[f.seatType]));
  const portCount = {}; F.forEach(f=>{portCount[f.from]=(portCount[f.from]||0)+1;portCount[f.to]=(portCount[f.to]||0)+1;});
  renderBars('b-airports', Object.entries(portCount).map(([k,n])=>[`${k} · ${AP[k].city}`,n]).sort((a,b)=>b[1]-a[1]), 10);

  // Year review
  const cur=2026,prev=2025;
  const curF=F.filter(f=>f.year===cur),prevF=F.filter(f=>f.year===prev);
  const curKm=curF.reduce((s,f)=>s+f.distKm,0),prevKm=prevF.reduce((s,f)=>s+f.distKm,0);
  const curC=new Set();curF.forEach(f=>{if(f.fromAp)curC.add(f.fromAp.country);if(f.toAp)curC.add(f.toAp.country);});
  const prevC=new Set();prevF.forEach(f=>{if(f.fromAp)prevC.add(f.fromAp.country);if(f.toAp)prevC.add(f.toAp.country);});
  const curH=Math.round(curF.reduce((s,f)=>s+f.durMin,0)/60),prevH=Math.round(prevF.reduce((s,f)=>s+f.durMin,0)/60);
  const pairs=[['Letů',curF.length,prevF.length,''],['Km',curKm,prevKm,''],['Zemí',curC.size,prevC.size,''],['Hodin',curH,prevH,'']];
  document.getElementById('yr-grid').innerHTML = pairs.map(([l,c,p,u])=>{const d=c-p;const pct=p?Math.round(d/p*100):0;const sign=d>=0?'+':'';return `<div class="yr-card"><div class="yr-l">${l}</div><div class="yr-big">${fmtNum(c)}${u}</div><div class="yr-d ${d<0?'neg':''}">${sign}${fmtNum(d)} (${sign}${pct}%)</div></div>`;}).join('');
  const before2026 = new Set(F.filter(f=>f.year<cur).flatMap(f=>[f.from,f.to]));
  const new2026 = [...new Set(curF.flatMap(f=>[f.from,f.to]))].filter(x=>!before2026.has(x));
  document.getElementById('yr-new').innerHTML = new2026.length?new2026.map(c=>`<div class="li"><div><div class="li-title">${AP[c].city}</div><div class="li-meta">${c} · ${AP[c].country}</div></div><div class="li-val" style="color:var(--accent)">nové</div></div>`).join(''):'<div class="empty">žádné nové letiště</div>';

  // Bucket
  document.getElementById('bk-list').innerHTML = window.BUCKET.map((b,i)=>`<div class="bk-item"><div class="bk-n">${String(i+1).padStart(2,'0')}</div><div><div class="bk-place">${b.place}</div><div class="bk-why">${b.why}</div></div><div class="bk-tag">${b.tag}</div></div>`).join('');

  // Globe init
  globe = window.Globe(document.getElementById('globe-canvas'),{
    onClickRoute:(r,pt)=>showPopover(r,pt),
    onClickAirport:(a)=>{},
    onClickEmpty:()=>hidePopover()
  });
  globe.setAirports(Object.values(AP));
  globe.setRoutes(routes.map(r=>({...r,a:[r.fromAp.lon,r.fromAp.lat],b:[r.toAp.lon,r.toAp.lat]})));

  // Controls
  document.getElementById('mc-zoomin').addEventListener('click',()=>globe.zoomIn());
  document.getElementById('mc-zoomout').addEventListener('click',()=>globe.zoomOut());
  document.getElementById('mc-reset').addEventListener('click',()=>{globe.reset();hidePopover();});
  const spinBtn = document.getElementById('mc-spin');
  let spinOn = true;
  spinBtn.classList.add('active');
  spinBtn.addEventListener('click',()=>{spinOn=!spinOn;globe.setSpin(spinOn);spinBtn.classList.toggle('active',spinOn);});
  const fsBtn = document.getElementById('mc-fs');
  const fsTop = document.getElementById('fs-toggle');
  function toggleFs(){document.getElementById('app').classList.toggle('fullscreen');setTimeout(()=>window.dispatchEvent(new Event('resize')),50);}
  fsBtn.addEventListener('click',toggleFs);
  fsTop.addEventListener('click',toggleFs);

  // Tabs
  document.querySelectorAll('.top-tab').forEach(t=>{
    t.addEventListener('click',()=>{
      document.querySelectorAll('.top-tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===t.dataset.tab));
      // Scroll sidebar to top
      document.getElementById('sidebar').scrollTop = 0;
    });
  });

  // Popover
  const pop = document.getElementById('popover');
  document.getElementById('fp-close').addEventListener('click',()=>hidePopover());
  function showPopover(r, pt){
    const mapArea = document.querySelector('.map-area');
    const rect = mapArea.getBoundingClientRect();
    let x = pt ? pt.x : rect.width/2;
    let y = pt ? pt.y : rect.height/2;
    // Clamp so popover stays inside
    x = Math.min(rect.width-300, Math.max(20, x+20));
    y = Math.min(rect.height-280, Math.max(20, y-20));
    pop.style.left = x+'px';
    pop.style.top = y+'px';
    document.getElementById('fp-route').innerHTML = `${r.from}<span class="arr">→</span>${r.to}`;
    document.getElementById('fp-cities').textContent = `${r.fromAp.city} · ${r.toAp.city}`;
    document.getElementById('fp-count').textContent = `${r.flights.length} ${r.flights.length===1?'let':(r.flights.length<5?'lety':'letů')} · ${fmtNum(r.distKm)} km`;
    const latest = [...r.flights].sort((a,b)=>b.date.localeCompare(a.date))[0];
    const airlines = [...new Set(r.flights.map(f=>f.airline).filter(Boolean))];
    document.getElementById('fp-grid').innerHTML = `
      <div><div class="fp-k">Poslední let</div><div class="fp-v">${fmt(latest.date)}</div></div>
      <div><div class="fp-k">Čas</div><div class="fp-v" style="font-family:var(--mono)">${fmtMin(latest.durMin)}</div></div>
      <div><div class="fp-k">Aerolinky</div><div class="fp-v">${airlines.join(', ')||'—'}</div></div>
      <div><div class="fp-k">Letadlo</div><div class="fp-v">${latest.aircraft||'—'}</div></div>
    `;
    pop.classList.add('on');
  }
  function hidePopover(){ pop.classList.remove('on'); }
};

if(window.__dataWaiting || window.FLIGHTS) window.__dataReady();
})();
