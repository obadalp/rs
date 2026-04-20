// Modern tech globe — orthographic projection, country borders,
// clickable routes/airports, zoom + pan.
(function(){

// Minimal fallback land if CDN fails
const FALLBACK_COUNTRIES = null; // will use land-only fallback

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
        // topojson — convert via dynamic import
        try {
          const mod = await import('https://cdn.jsdelivr.net/npm/topojson-client@3/+esm');
          return mod.feature(j, j.objects.countries);
        } catch(e){}
      }
    } catch(e){}
  }
  return null;
}

window.Globe = function(canvas, cfg){
  const ctx = canvas.getContext('2d');
  let W=0,H=0,cx=0,cy=0, baseR=0, zoom=1;
  let rot=[20,-20];
  let autoSpin=true;
  let dragging=false, lastX=0, lastY=0, moved=false;
  let countries=null;
  let airports=[];
  let routes=[]; // {a:[lon,lat], b:[lon,lat], from, to, flights: [...]}
  let onClickRoute = cfg && cfg.onClickRoute || (()=>{});
  let onClickAirport = cfg && cfg.onClickAirport || (()=>{});
  let onClickEmpty = cfg && cfg.onClickEmpty || (()=>{});
  let hoveredRoute = -1;
  let selectedRoute = -1;

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
    // Outer dark glow
    const grad = ctx.createRadialGradient(cx, cy, R()*0.7, cx, cy, R()*1.05);
    grad.addColorStop(0, 'rgba(34,211,238,0.0)');
    grad.addColorStop(0.85, 'rgba(34,211,238,0.06)');
    grad.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx,cy,R()*1.1,0,Math.PI*2);
    ctx.fill();

    // Sphere fill (deep space)
    ctx.beginPath();
    ctx.arc(cx,cy,R(),0,Math.PI*2);
    const sg = ctx.createRadialGradient(cx-R()*0.3, cy-R()*0.3, R()*0.1, cx, cy, R());
    sg.addColorStop(0, '#0f1824');
    sg.addColorStop(0.7, '#0a1019');
    sg.addColorStop(1, '#06090d');
    ctx.fillStyle = sg;
    ctx.fill();
    // rim
    ctx.strokeStyle = 'rgba(34,211,238,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawGraticule(){
    ctx.strokeStyle = 'rgba(90, 110, 140, 0.12)';
    ctx.lineWidth = 0.6;
    for(let lon=-180; lon<180; lon+=15){
      ctx.beginPath(); let s=false;
      for(let lat=-85; lat<=85; lat+=3){
        const p = project(lon, lat);
        if(!p.v){ s=false; continue; }
        if(!s){ ctx.moveTo(p.x,p.y); s=true; } else ctx.lineTo(p.x,p.y);
      }
      ctx.stroke();
    }
    for(let lat=-60; lat<=60; lat+=15){
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
    // Fill land
    ctx.fillStyle = '#151c26';
    for(const f of countries.features){
      drawFeature(f, true, false);
    }
    // Country borders
    ctx.strokeStyle = 'rgba(80, 95, 115, 0.55)';
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

  // Great-circle arc points, clipped to visible hemisphere.
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
      const isSel = i===selectedRoute;
      const isHov = i===hoveredRoute;
      const baseAlpha = 0.35;
      const alpha = isSel ? 1 : (isHov ? 0.9 : baseAlpha);
      const w = isSel ? 2 : (isHov ? 1.8 : 1);

      const pts = rt._pts || (rt._pts = arcPoints(rt.a, rt.b));
      ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      let s=false, screenPts=[];
      for(const pt of pts){
        const p = project(pt.lon, pt.lat);
        if(!p.v){ s=false; continue; }
        if(!s){ ctx.moveTo(p.x,p.y); s=true; } else ctx.lineTo(p.x,p.y);
        screenPts.push([p.x,p.y]);
      }
      ctx.stroke();
      rt._screen = screenPts;

      if(isSel){
        // Glow
        ctx.strokeStyle = 'rgba(34,211,238,0.25)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        s=false;
        for(const pt of pts){
          const p = project(pt.lon, pt.lat);
          if(!p.v){ s=false; continue; }
          if(!s){ ctx.moveTo(p.x,p.y); s=true; } else ctx.lineTo(p.x,p.y);
        }
        ctx.stroke();
      }
    }
  }

  function drawAirports(){
    for(const a of airports){
      const p = project(a.lon, a.lat);
      if(!p.v) continue;
      a._screen = [p.x, p.y];
      // Outer ring
      ctx.strokeStyle = 'rgba(34,211,238,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x,p.y,4,0,Math.PI*2);
      ctx.stroke();
      // Dot
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(p.x,p.y,2,0,Math.PI*2);
      ctx.fill();
    }
  }

  function draw(){
    ctx.clearRect(0,0,W,H);
    drawSphere();
    drawGraticule();
    drawCountries();
    drawRoutes();
    drawAirports();
  }

  // Input
  function hitTestRoute(mx, my){
    let best = -1, bestD = 8;
    for(let i=0;i<routes.length;i++){
      const sp = routes[i]._screen;
      if(!sp) continue;
      for(let j=0;j<sp.length-1;j++){
        const d = distToSeg(mx,my, sp[j][0],sp[j][1], sp[j+1][0],sp[j+1][1]);
        if(d < bestD){ bestD = d; best = i; }
      }
    }
    return best;
  }
  function hitTestAirport(mx, my){
    for(let i=0;i<airports.length;i++){
      const a = airports[i];
      if(!a._screen) continue;
      const dx = mx-a._screen[0], dy=my-a._screen[1];
      if(dx*dx+dy*dy < 81) return i;
    }
    return -1;
  }
  function distToSeg(px,py,x1,y1,x2,y2){
    const A = px-x1, B = py-y1, C = x2-x1, D = y2-y1;
    const dot = A*C+B*D, len = C*C+D*D;
    let t = len ? dot/len : 0;
    t = Math.max(0,Math.min(1,t));
    const dx = px - (x1+t*C), dy = py - (y1+t*D);
    return Math.sqrt(dx*dx+dy*dy);
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
      rot[0] = (rot[0] + dx * 0.35) % 360;
      rot[1] = Math.max(-85, Math.min(85, rot[1] - dy * 0.35));
      lastX = e.clientX; lastY = e.clientY;
    } else {
      const ri = hitTestRoute(mx, my);
      const ai = hitTestAirport(mx, my);
      const newHov = ai>=0 ? -1 : ri;
      if(newHov !== hoveredRoute){ hoveredRoute = newHov; }
      canvas.style.cursor = (ri>=0 || ai>=0) ? 'pointer' : 'grab';
    }
  });
  canvas.addEventListener('pointerup', e=>{
    dragging = false;
    canvas.classList.remove('grabbing');
    try { canvas.releasePointerCapture(e.pointerId); } catch(_){}
    if(!moved){
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const ai = hitTestAirport(mx, my);
      if(ai >= 0){ onClickAirport(airports[ai]); return; }
      const ri = hitTestRoute(mx, my);
      if(ri >= 0){ selectedRoute = ri; onClickRoute(routes[ri], { x: mx, y: my }); }
      else { selectedRoute = -1; onClickEmpty(); }
    }
  });
  canvas.addEventListener('wheel', e=>{
    e.preventDefault();
    zoom *= (e.deltaY < 0) ? 1.1 : 0.9;
    zoom = Math.max(0.6, Math.min(6, zoom));
  }, { passive: false });

  // Loop
  function loop(){
    if(autoSpin && !dragging) rot[0] = (rot[0] + 0.08) % 360;
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
    setAirports(list){ airports = list.map(a=>({...a})); },
    setRoutes(list){ routes = list.map(r=>({...r, _pts: null, _screen: null})); },
    setSpin(v){ autoSpin = !!v; },
    zoomIn(){ zoom = Math.min(6, zoom*1.3); },
    zoomOut(){ zoom = Math.max(0.6, zoom/1.3); },
    reset(){ zoom = 1; rot = [20,-20]; autoSpin = true; },
    focusOn(lon, lat){ rot = [lon, lat]; autoSpin = false; },
    selectRoute(i){ selectedRoute = i; },
    getSelected(){ return selectedRoute; },
    routes: ()=>routes,
    getRotation: ()=>rot,
    getZoom: ()=>zoom
  };
};
})();
