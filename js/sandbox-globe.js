// Sandbox Globe — adaptováno z Personal web flight log globe
// Orthographic projection, country borders, klikací markery.
// Naše paleta: tmavá sféra + clay/korál markery.
(function(){

async function loadCountries(){
  const urls = [
    'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson',
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson',
    'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'
  ];
  for(const u of urls){
    try {
      const r = await fetch(u);
      if(!r.ok) continue;
      const j = await r.json();
      if(j.features) return j;
      if(j.objects && j.objects.countries){
        try {
          const mod = await import('https://cdn.jsdelivr.net/npm/topojson-client@3/+esm');
          return mod.feature(j, j.objects.countries);
        } catch(e){}
      }
    } catch(e){}
  }
  return null;
}

window.SandboxGlobe = function(canvas, cfg){
  const ctx = canvas.getContext('2d');
  let W=0,H=0,cx=0,cy=0, baseR=0, zoom=1;
  let rot=[10,-20]; // začátek nad Evropou
  let autoSpin=true;
  let dragging=false, lastX=0, lastY=0, moved=false;
  let countries=null;
  let markers=[]; // {lon, lat, name, year, area, ...}
  let routes=[];  // {a:[lon,lat], b:[lon,lat], from, to}
  let onClickMarker = cfg && cfg.onClickMarker || (()=>{});
  let onClickEmpty = cfg && cfg.onClickEmpty || (()=>{});
  let hoveredMarker = -1;
  let selectedMarker = -1;
  let pulseT = 0;

  // ——— Barvy z naší palety ———
  const COLORS = {
    sphereInner: '#1a1a1a',
    sphereMid: '#141414',
    sphereOuter: '#0a0a0a',
    sphereRim: 'rgba(196,69,54,.28)',
    glow: 'rgba(196,69,54,.08)',
    graticule: 'rgba(255,255,255,.06)',
    countryFill: '#242424',
    countryBorder: 'rgba(255,255,255,.14)',
    markerFill: '#c44536',
    markerRing: 'rgba(196,69,54,.55)',
    markerGlow: 'rgba(196,69,54,.35)',
    markerHover: '#e88b6d',
    routeBase: 'rgba(196,69,54,.32)',
    routeHover: 'rgba(196,69,54,.85)',
    routeGlow: 'rgba(196,69,54,.2)',
    czHighlight: '#e88b6d',
    czRing: 'rgba(232,139,109,.45)'
  };

  function R(){ return baseR * zoom; }

  function resize(){
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    W = rect.width; H = rect.height;
    canvas.width = W*dpr; canvas.height = H*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    cx = W/2; cy = H/2;
    baseR = Math.min(W,H)/2 - 40;
  }

  function project(lon, lat){
    const λ = (lon - rot[0]) * Math.PI/180;
    const φ = lat * Math.PI/180;
    const φ0 = rot[1] * Math.PI/180;
    const cosC = Math.sin(φ0)*Math.sin(φ) + Math.cos(φ0)*Math.cos(φ)*Math.cos(λ);
    if(cosC < 0) return {x:0,y:0,v:false};
    const r = R();
    const x = cx + r * Math.cos(φ) * Math.sin(λ);
    const y = cy - r * (Math.cos(φ0)*Math.sin(φ) - Math.sin(φ0)*Math.cos(φ)*Math.cos(λ));
    return {x,y,v:true,cosC};
  }

  function drawSphere(){
    // Vnější glow (clay aura)
    const grad = ctx.createRadialGradient(cx, cy, R()*0.7, cx, cy, R()*1.08);
    grad.addColorStop(0, 'rgba(196,69,54,0)');
    grad.addColorStop(0.85, COLORS.glow);
    grad.addColorStop(1, 'rgba(196,69,54,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx,cy,R()*1.12,0,Math.PI*2);
    ctx.fill();

    // Sféra — dark radial (matte)
    ctx.beginPath();
    ctx.arc(cx,cy,R(),0,Math.PI*2);
    const sg = ctx.createRadialGradient(cx-R()*0.3, cy-R()*0.3, R()*0.1, cx, cy, R());
    sg.addColorStop(0, COLORS.sphereInner);
    sg.addColorStop(0.7, COLORS.sphereMid);
    sg.addColorStop(1, COLORS.sphereOuter);
    ctx.fillStyle = sg;
    ctx.fill();
    // Rim (clay okraj)
    ctx.strokeStyle = COLORS.sphereRim;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawGraticule(){
    ctx.strokeStyle = COLORS.graticule;
    ctx.lineWidth = 0.5;
    for(let lon=-180; lon<180; lon+=20){
      ctx.beginPath(); let s=false;
      for(let lat=-85; lat<=85; lat+=3){
        const p = project(lon, lat);
        if(!p.v){ s=false; continue; }
        if(!s){ ctx.moveTo(p.x,p.y); s=true; } else ctx.lineTo(p.x,p.y);
      }
      ctx.stroke();
    }
    for(let lat=-60; lat<=60; lat+=20){
      ctx.beginPath(); let s=false;
      for(let lon=-180; lon<=180; lon+=3){
        const p = project(lon, lat);
        if(!p.v){ s=false; continue; }
        if(!s){ ctx.moveTo(p.x,p.y); s=true; } else ctx.lineTo(p.x,p.y);
      }
      ctx.stroke();
    }
  }

  function drawCountries(){
    if(!countries) return;
    ctx.fillStyle = COLORS.countryFill;
    for(const f of countries.features){
      drawFeature(f, true, false);
    }
    ctx.strokeStyle = COLORS.countryBorder;
    ctx.lineWidth = 0.7;
    ctx.lineJoin = 'round';
    for(const f of countries.features){
      drawFeature(f, false, true);
    }
  }

  function drawFeature(feat, fill, stroke){
    const g = feat.geometry;
    if(!g) return;
    const polys = g.type==='Polygon' ? [g.coordinates] :
                  g.type==='MultiPolygon' ? g.coordinates : [];
    for(const poly of polys){
      ctx.beginPath();
      for(let i=0;i<poly.length;i++){
        const ring = poly[i];
        let s=false;
        for(const [lon,lat] of ring){
          const p = project(lon,lat);
          if(!p.v){ s=false; continue; }
          if(!s){ ctx.moveTo(p.x,p.y); s=true; } else ctx.lineTo(p.x,p.y);
        }
      }
      if(fill) ctx.fill();
      if(stroke) ctx.stroke();
    }
  }

  function arcPoints(a, b){
    const pts = [];
    const segs = 60;
    const φ1 = a[1]*Math.PI/180, λ1 = a[0]*Math.PI/180;
    const φ2 = b[1]*Math.PI/180, λ2 = b[0]*Math.PI/180;
    const d = 2*Math.asin(Math.sqrt(Math.sin((φ2-φ1)/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin((λ2-λ1)/2)**2));
    if(d===0) return pts;
    for(let i=0;i<=segs;i++){
      const f = i/segs;
      const A = Math.sin((1-f)*d)/Math.sin(d);
      const B = Math.sin(f*d)/Math.sin(d);
      const x = A*Math.cos(φ1)*Math.cos(λ1) + B*Math.cos(φ2)*Math.cos(λ2);
      const y = A*Math.cos(φ1)*Math.sin(λ1) + B*Math.cos(φ2)*Math.sin(λ2);
      const z = A*Math.sin(φ1) + B*Math.sin(φ2);
      const lat = Math.atan2(z, Math.sqrt(x*x+y*y))*180/Math.PI;
      const lon = Math.atan2(y,x)*180/Math.PI;
      pts.push({lon,lat});
    }
    return pts;
  }

  function drawRoutes(){
    for(let i=0;i<routes.length;i++){
      const rt = routes[i];
      const pts = rt._pts || (rt._pts = arcPoints(rt.a, rt.b));
      ctx.strokeStyle = COLORS.routeBase;
      ctx.lineWidth = 1;
      ctx.beginPath();
      let s=false;
      for(const pt of pts){
        const p = project(pt.lon, pt.lat);
        if(!p.v){ s=false; continue; }
        if(!s){ ctx.moveTo(p.x,p.y); s=true; } else ctx.lineTo(p.x,p.y);
      }
      ctx.stroke();
    }
  }

  function drawMarkers(){
    pulseT += 0.015;
    for(let i=0;i<markers.length;i++){
      const m = markers[i];
      const p = project(m.lon, m.lat);
      if(!p.v) continue;
      m._screen = [p.x, p.y];
      const isHov = i===hoveredMarker;
      const isSel = i===selectedMarker;
      const isCz = m.code === 'CZ';

      // Glow ring (pulzuje)
      const pulseScale = 1 + 0.25 * Math.sin(pulseT + i*0.7);
      const glowR = 10 * pulseScale;
      const glowAlpha = isCz ? 0.22 : 0.15;
      ctx.fillStyle = isCz ? COLORS.czRing : COLORS.markerGlow;
      ctx.globalAlpha = glowAlpha * (2 - pulseScale);
      ctx.beginPath();
      ctx.arc(p.x, p.y, glowR, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Outer ring
      ctx.strokeStyle = isCz ? COLORS.czRing : COLORS.markerRing;
      ctx.lineWidth = isHov || isSel ? 1.5 : 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isHov || isSel ? 7 : 5, 0, Math.PI*2);
      ctx.stroke();

      // Dot
      ctx.fillStyle = isCz ? COLORS.czHighlight : (isHov ? COLORS.markerHover : COLORS.markerFill);
      ctx.beginPath();
      ctx.arc(p.x, p.y, isHov || isSel ? 3.5 : 2.8, 0, Math.PI*2);
      ctx.fill();
    }
  }

  function draw(){
    ctx.clearRect(0,0,W,H);
    drawSphere();
    drawGraticule();
    drawCountries();
    drawRoutes();
    drawMarkers();
  }

  function hitTestMarker(mx, my){
    for(let i=0;i<markers.length;i++){
      const m = markers[i];
      if(!m._screen) continue;
      const dx = mx-m._screen[0], dy=my-m._screen[1];
      if(dx*dx+dy*dy < 100) return i;
    }
    return -1;
  }

  canvas.addEventListener('pointerdown', e=>{
    dragging = true; moved = false;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('grabbing');
  });
  canvas.addEventListener('pointermove', e=>{
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if(dragging){
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if(Math.abs(dx)+Math.abs(dy) > 3) moved = true;
      rot[0] = (rot[0] + dx * 0.4) % 360;
      rot[1] = Math.max(-85, Math.min(85, rot[1] - dy * 0.4));
      lastX = e.clientX; lastY = e.clientY;
    } else {
      const mi = hitTestMarker(mx, my);
      if(mi !== hoveredMarker){ hoveredMarker = mi; }
      canvas.style.cursor = (mi >= 0) ? 'pointer' : 'grab';
    }
  });
  canvas.addEventListener('pointerup', e=>{
    dragging = false;
    canvas.classList.remove('grabbing');
    try { canvas.releasePointerCapture(e.pointerId); } catch(_){}
    if(!moved){
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const mi = hitTestMarker(mx, my);
      if(mi >= 0){ selectedMarker = mi; onClickMarker(markers[mi], { x: mx, y: my }); }
      else { selectedMarker = -1; onClickEmpty(); }
    }
  });
  canvas.addEventListener('wheel', e=>{
    e.preventDefault();
    zoom *= (e.deltaY < 0) ? 1.1 : 0.9;
    zoom = Math.max(0.7, Math.min(4, zoom));
  }, { passive: false });

  function loop(){
    if(autoSpin && !dragging) rot[0] = (rot[0] + 0.06) % 360;
    draw();
    requestAnimationFrame(loop);
  }

  resize();
  window.addEventListener('resize', resize);

  (async ()=>{
    countries = await loadCountries();
    loop();
  })();

  return {
    setMarkers(list){ markers = list.map(m=>({...m})); },
    setRoutes(list){ routes = list.map(r=>({...r, _pts: null})); },
    setSpin(v){ autoSpin = !!v; },
    zoomIn(){ zoom = Math.min(4, zoom*1.3); },
    zoomOut(){ zoom = Math.max(0.7, zoom/1.3); },
    reset(){ zoom = 1; rot = [10,-20]; autoSpin = true; },
    focusOn(lon, lat){ rot = [lon, lat]; autoSpin = false; }
  };
};

})();
