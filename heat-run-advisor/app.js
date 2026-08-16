// ---------- State ----------
let unit = localStorage.getItem('heatAdvisorUnit') || 'F';
let lastTempF = 85;
let lastUv = null;
let lastPressure = null;
let lastCoords = null;
let hourlySeries = null;
let chartInstance = null;
let activeChartMode = null;
function fToC(f) { return (f - 32) * 5 / 9; }
function cToF(c) { return c * 9 / 5 + 32; }
function setUnit(u) {
  if (u === unit) return;
  const input = document.getElementById('temp');
  const val = parseFloat(input.value);
  if (!isNaN(val)) {
    if (u === 'C') { lastTempF = val; input.value = Math.round(fToC(val) * 10) / 10; }
    else { lastTempF = cToF(val); input.value = Math.round(lastTempF * 10) / 10; }
  }
  unit = u; localStorage.setItem('heatAdvisorUnit', unit); updateUnitUI(); advise();
}
function updateUnitUI() {
  document.getElementById('tempUnitLabel').textContent = unit === 'F' ? '°F' : '°C';
  const active = 'px-3 py-1.5 text-sm font-semibold rounded-lg bg-cyan-500 text-night-950 transition';
  const inactive = 'px-3 py-1.5 text-sm font-semibold rounded-lg text-slate-400 hover:bg-slate-800 transition';
  const activeM = 'px-2.5 py-1 text-xs font-semibold rounded-md bg-cyan-500 text-night-950 transition';
  const inactiveM = 'px-2.5 py-1 text-xs font-semibold rounded-md text-slate-400 hover:bg-slate-800 transition';
  ['btnF','btnC'].forEach(id => { const el = document.getElementById(id); if (!el) return; el.className = (id === 'btnF' ? unit === 'F' : unit === 'C') ? active : inactive; });
  ['btnF_m','btnC_m'].forEach(id => { const el = document.getElementById(id); if (!el) return; el.className = (id === 'btnF_m' ? unit === 'F' : unit === 'C') ? activeM : inactiveM; });
}
function heatIndex(T_f, R) {
  if (T_f < 80) return Math.round(T_f * 10) / 10;
  let HI = -42.379 + 2.04901523*T_f + 10.14333127*R - 0.22475541*T_f*R - 0.00683783*T_f*T_f - 0.05481717*R*R + 0.00122874*T_f*T_f*R + 0.00085282*T_f*R*R - 0.00000199*T_f*T_f*R*R;
  if (R < 13 && T_f >= 80 && T_f <= 112) HI -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T_f - 95)) / 17);
  else if (R > 85 && T_f >= 80 && T_f <= 87) HI += ((R - 85) / 10) * ((87 - T_f) / 5);
  return Math.round(HI);
}
function wbgtApprox(T_f, RH) {
  const T = fToC(T_f);
  const e = (RH / 100) * 6.105 * Math.exp(17.27 * T / (237.7 + T));
  return Math.round((0.567 * T + 0.393 * e + 3.94) * 10) / 10;
}
function hiRiskLevel(hi_f) {
  if (hi_f < 80) return { cls: 'bg-emerald-600 text-white', label: 'Caution' };
  if (hi_f < 90) return { cls: 'bg-lime-600 text-white', label: 'Caution' };
  if (hi_f < 103) return { cls: 'bg-amber-500 text-slate-900', label: 'Extreme Caution' };
  if (hi_f < 125) return { cls: 'bg-orange-600 text-white', label: 'Danger' };
  return { cls: 'bg-red-600 text-white', label: 'Extreme Danger' };
}
function wbgtRiskLevel(w_c) {
  if (w_c < 18) return { cls: 'bg-emerald-600 text-white', label: 'Low' };
  if (w_c < 23) return { cls: 'bg-lime-600 text-white', label: 'Moderate' };
  if (w_c < 28) return { cls: 'bg-amber-500 text-slate-900', label: 'High' };
  if (w_c < 32.3) return { cls: 'bg-orange-600 text-white', label: 'Very High' };
  return { cls: 'bg-red-600 text-white', label: 'Extreme' };
}
function uvRiskLevel(uv) {
  if (uv == null) return { cls: 'bg-slate-600 text-white', label: '—' };
  if (uv < 3) return { cls: 'bg-emerald-600 text-white', label: 'Low' };
  if (uv < 6) return { cls: 'bg-lime-600 text-white', label: 'Moderate' };
  if (uv < 8) return { cls: 'bg-amber-500 text-slate-900', label: 'High' };
  if (uv < 11) return { cls: 'bg-orange-600 text-white', label: 'Very High' };
  return { cls: 'bg-red-600 text-white', label: 'Extreme' };
}
function formatTemp(f) { return unit === 'C' ? (Math.round(fToC(f) * 10) / 10 + '°C') : (Math.round(f * 10) / 10 + '°F'); }
function parsePace(str) {
  if (!str) return NaN; str = String(str).trim();
  if (str.includes(':')) { const p = str.split(':'); return (parseInt(p[0],10)||0) + (parseInt(p[1],10)||0)/60; }
  return parseFloat(str);
}
function formatPace(d) {
  if (isNaN(d) || d <= 0) return '—';
  const t = Math.round(d * 60); return Math.floor(t/60) + ':' + String(t%60).padStart(2,'0');
}
function recommendedPaceAdjustment(WBGT, HI, UV) {
  let s = 0;
  if (WBGT >= 32.3) s += 90; else if (WBGT >= 30) s += 70; else if (WBGT >= 28) s += 55; else if (WBGT >= 26) s += 40; else if (WBGT >= 24) s += 30; else if (WBGT >= 22) s += 20; else if (WBGT >= 20) s += 12; else if (WBGT >= 18) s += 5;
  if (HI >= 110) s += 25; else if (HI >= 103) s += 15; else if (HI >= 95) s += 8; else if (HI >= 90) s += 4;
  if (UV != null) { if (UV >= 10) s += 10; else if (UV >= 8) s += 6; else if (UV >= 6) s += 3; }
  return s;
}
function advise() {
  const raw = parseFloat(document.getElementById('temp').value);
  const R = parseFloat(document.getElementById('hum').value) || 0;
  const dist = parseFloat(document.getElementById('dist').value) || 0;
  const targetPaceDec = parsePace(document.getElementById('pace').value);
  let T_f = unit === 'C' ? (isNaN(raw) ? lastTempF : cToF(raw)) : (isNaN(raw) ? lastTempF : raw);
  lastTempF = T_f;
  const HI = heatIndex(T_f, R), WBGT = wbgtApprox(T_f, R), UV = lastUv, P = lastPressure;
  const hiR = hiRiskLevel(HI), wbR = wbgtRiskLevel(WBGT), uvR = uvRiskLevel(UV);
  let effortAdj, hydro, tips;
  if (WBGT >= 32.3 || HI >= 125) { effortAdj = 'Skip outdoor quality work. Treadmill, pool, or full rest.'; hydro = 'Focus on cooling and rehydration indoors.'; tips = 'Extreme zone — heat stroke risk is high.'; }
  else if (WBGT >= 28 || HI >= 103) { effortAdj = 'Prefer indoor or very easy effort. Cut volume 30–50% if outdoors.'; hydro = '28+ oz/hr + electrolytes.'; tips = 'Danger / Very High.'; }
  else if (WBGT >= 23 || HI >= 90) { effortAdj = 'Reduce intensity ~10–15% or slow 30–60 s/mi.'; hydro = '20–28 oz/hr + sodium.'; tips = 'High / Extreme Caution. Prefer early morning or late evening.'; }
  else { effortAdj = 'Close to planned effort. Keep a small buffer if humidity is rising.'; hydro = '16–20 oz/hr.'; tips = 'Low–Moderate. Prefer shaded routes.'; }
  if (dist > 10 && (WBGT >= 24 || HI >= 95)) tips += ' Long efforts in high heat need extra conservatism.';
  if (UV != null && UV >= 8) tips += ' UV Very High — sunscreen, hat, sunglasses.';
  else if (UV != null && UV >= 6) tips += ' UV High — sunscreen recommended.';
  const addSec = recommendedPaceAdjustment(WBGT, HI, UV);
  const recPaceDec = isNaN(targetPaceDec) ? NaN : targetPaceDec + (addSec / 60);
  document.getElementById('recPaceDisplay').textContent = formatPace(recPaceDec);
  document.getElementById('recPaceDelta').textContent = !isNaN(targetPaceDec) ? (addSec > 0 ? '+'+addSec+' s/mi' : 'No adj.') : '';
  document.getElementById('hiValue').textContent = formatTemp(HI);
  const hiRiskEl = document.getElementById('hiRisk'); hiRiskEl.className = 'mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block '+hiR.cls; hiRiskEl.textContent = hiR.label;
  document.getElementById('wbgtValue').textContent = unit === 'F' ? (Math.round(cToF(WBGT)*10)/10+'°F') : (WBGT+'°C');
  const wbRiskEl = document.getElementById('wbgtRisk'); wbRiskEl.className = 'mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block '+wbR.cls; wbRiskEl.textContent = wbR.label;
  document.getElementById('uvValue').textContent = UV != null ? UV.toFixed(1) : '—';
  const uvRiskEl = document.getElementById('uvRisk'); uvRiskEl.className = 'mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block '+uvR.cls; uvRiskEl.textContent = uvR.label;
  document.getElementById('pressureValue').textContent = P != null ? Math.round(P) : '—';
  document.getElementById('effort').textContent = effortAdj;
  document.getElementById('hydro').textContent = hydro;
  document.getElementById('tips').textContent = tips;
  document.getElementById('out').classList.remove('hidden');
}
function setStatus(msg, isError=false) {
  const el = document.getElementById('locationStatus');
  el.textContent = msg; el.className = 'text-sm truncate '+(isError?'text-red-400':'text-slate-400');
}
function setCoords(lat, lon, source='precise', label='') {
  const el = document.getElementById('coordsDisplay');
  el.textContent = lat.toFixed(4)+'°, '+lon.toFixed(4)+'°'+(source==='approx'?' (approx)':'');
  el.classList.remove('hidden');
  lastCoords = { lat, lon, source, label };
}
function setPlaceLabel(text) {
  const el = document.getElementById('placeDisplay');
  if (text) { el.textContent = text; el.classList.remove('hidden'); } else el.classList.add('hidden');
}
function localDateStr(d) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function isPastDay(when) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(when); target.setHours(0,0,0,0);
  return target < today;
}
async function fetchWeatherFor(lat, lon, whenDate) {
  const dateStr = localDateStr(whenDate);
  const isPast = isPastDay(whenDate);
  let data;
  if (isPast) {
    const res = await fetch('https://archive-api.open-meteo.com/v1/archive?latitude='+lat+'&longitude='+lon+'&start_date='+dateStr+'&end_date='+dateStr+'&hourly=temperature_2m,relative_humidity_2m,uv_index,surface_pressure&daily=sunrise,sunset&temperature_unit=fahrenheit&timezone=auto');
    if (!res.ok) throw new Error('Archive API '+res.status);
    data = await res.json();
  } else {
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&current=temperature_2m,relative_humidity_2m,uv_index,surface_pressure&hourly=temperature_2m,relative_humidity_2m,uv_index,surface_pressure&daily=sunrise,sunset&temperature_unit=fahrenheit&timezone=auto&forecast_days=7');
    if (!res.ok) throw new Error('Forecast API '+res.status);
    data = await res.json();
  }
  const times = data.hourly?.time||[], temps = data.hourly?.temperature_2m||[], hums = data.hourly?.relative_humidity_2m||[], uvs = data.hourly?.uv_index||[], press = data.hourly?.surface_pressure||[];
  const dayTimes=[], dayTemp=[], dayHum=[], dayUv=[], dayPress=[], dayHi=[], dayWbgt=[];
  for (let i=0;i<times.length;i++) {
    if (!times[i].startsWith(dateStr)) continue;
    const tF=temps[i], h=hums[i]; if (tF==null||h==null) continue;
    dayTimes.push(times[i]); dayTemp.push(tF); dayHum.push(h); dayUv.push(uvs[i]??null); dayPress.push(press[i]??null);
    dayHi.push(heatIndex(tF,h)); dayWbgt.push(wbgtApprox(tF,h));
  }
  hourlySeries = { times: dayTimes, tempF: dayTemp, hum: dayHum, uv: dayUv, pressure: dayPress, hi: dayHi, wbgt: dayWbgt };
  let tempF, hum, uv, pressure, stamp;
  if (!isPast && data.current && localDateStr(new Date())===dateStr) {
    if (Math.abs(whenDate.getTime()-Date.now()) < 90*60*1000) {
      tempF=data.current.temperature_2m; hum=data.current.relative_humidity_2m; uv=data.current.uv_index??null; pressure=data.current.surface_pressure??null; stamp=data.current.time;
    }
  }
  if (tempF==null && dayTimes.length) {
    let best=0, bestDiff=Infinity, targetH=whenDate.getHours();
    dayTimes.forEach((t,i)=>{ const h=parseInt(t.slice(11,13),10); const d=Math.abs(h-targetH); if(d<bestDiff){bestDiff=d;best=i;} });
    tempF=dayTemp[best]; hum=dayHum[best]; uv=dayUv[best]; pressure=dayPress[best]; stamp=dayTimes[best];
  }
  if (tempF==null) throw new Error('No weather data for selected time');
  lastTempF=tempF; lastUv=uv; lastPressure=pressure;
  document.getElementById('temp').value = unit==='C' ? Math.round(fToC(tempF)*10)/10 : Math.round(tempF*10)/10;
  document.getElementById('hum').value = Math.round(hum);
  if (data.daily?.sunrise?.[0] && data.daily?.sunset?.[0]) {
    document.getElementById('sunrise').textContent = new Date(data.daily.sunrise[0]).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    document.getElementById('sunset').textContent = new Date(data.daily.sunset[0]).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    document.getElementById('sunTimes').classList.remove('hidden');
  }
  const meta=document.getElementById('weatherMeta');
  meta.textContent = (isPast?'Historical':'Forecast / current')+' · '+(stamp||dateStr)+' · Open-Meteo';
  meta.classList.remove('hidden');
  setStatus(isPast?'Historical weather loaded':'Weather loaded');
  document.getElementById('refreshBtn').disabled=false;
  advise();
}
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch('https://nominatim.openstreetmap.org/reverse?lat='+lat+'&lon='+lon+'&format=json&addressdetails=1&zoom=14', {headers:{'Accept':'application/json','User-Agent':'PaceKit-HeatRunAdvisor/1.1 (https://pacekit.net)'}});
    if (!res.ok) throw new Error('nominatim');
    const data = await res.json(); const a = data.address||{};
    const specific = a.suburb||a.neighbourhood||a.village||a.hamlet||a.locality||'';
    const city = a.city||a.town||a.municipality||a.county||'';
    const state = a.state||'';
    if (specific && city && specific.toLowerCase()!==city.toLowerCase()) return specific+', '+city+(state?', '+state:'');
    if (city) return state?city+', '+state:city;
    if (specific) return state?specific+', '+state:specific;
    return data.display_name?.split(',').slice(0,2).join(',').trim()||'';
  } catch {
    try {
      const res = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude='+lat+'&longitude='+lon+'&localityLanguage=en');
      const d = await res.json(); const loc=d.locality||d.city||''; const st=d.principalSubdivision||'';
      return loc&&st?loc+', '+st:(loc||st||'');
    } catch { return ''; }
  }
}
async function searchPlace() {
  const q = document.getElementById('placeSearch').value.trim();
  if (!q) return;
  setStatus('Searching place…'); document.getElementById('refreshBtn').disabled=true;
  try {
    const res = await fetch('https://nominatim.openstreetmap.org/search?q='+encodeURIComponent(q)+'&format=json&limit=1', {headers:{'Accept':'application/json','User-Agent':'PaceKit-HeatRunAdvisor/1.1 (https://pacekit.net)'}});
    if (!res.ok) throw new Error('search failed');
    const results = await res.json();
    if (!results.length) { setStatus('Place not found', true); document.getElementById('refreshBtn').disabled=false; return; }
    const r=results[0]; const lat=parseFloat(r.lat), lon=parseFloat(r.lon);
    const label=r.display_name.split(',').slice(0,3).join(',').trim();
    setCoords(lat,lon,'search',label); setPlaceLabel(label);
    document.getElementById('placeSearch').value=label;
    await loadForSelection();
  } catch(e) { console.error(e); setStatus('Place search failed', true); document.getElementById('refreshBtn').disabled=false; }
}
async function getApproxLocation() {
  try {
    const res=await fetch('https://get.geojs.io/v1/ip/geo.json'); const data=await res.json();
    if (data.latitude&&data.longitude) return {lat:parseFloat(data.latitude),lon:parseFloat(data.longitude),city:data.city||data.region||''};
  } catch{}
  try {
    const res=await fetch('https://ipapi.co/json/'); const data=await res.json();
    if (data.latitude&&data.longitude) return {lat:data.latitude,lon:data.longitude,city:data.city||data.region||''};
  } catch{}
  throw new Error('approx failed');
}
function useMyLocation() {
  document.getElementById('refreshBtn').disabled=true; setStatus('Getting location…');
  if (!navigator.geolocation) { tryApproxThenLoad(); return; }
  navigator.geolocation.getCurrentPosition(async (pos)=>{
    const {latitude:lat,longitude:lon}=pos.coords;
    setCoords(lat,lon,'precise');
    const label=await reverseGeocode(lat,lon);
    setPlaceLabel(label||'Current location');
    if (label) document.getElementById('placeSearch').value=label;
    await loadForSelection();
  }, ()=>tryApproxThenLoad(), {enableHighAccuracy:false,timeout:10000,maximumAge:300000});
}
async function tryApproxThenLoad() {
  setStatus('Using approximate location…');
  try {
    const approx=await getApproxLocation();
    setCoords(approx.lat,approx.lon,'approx',approx.city);
    setPlaceLabel(approx.city?approx.city+' (approx)':'Approximate location');
    if (approx.city) document.getElementById('placeSearch').value=approx.city;
    await loadForSelection();
  } catch {
    setStatus('Location unavailable — search a place or enter values manually', true);
    document.getElementById('refreshBtn').disabled=false;
  }
}
async function loadForSelection() {
  if (!lastCoords) { setStatus('Set a location first', true); return; }
  document.getElementById('refreshBtn').disabled=true; setStatus('Fetching weather…');
  document.getElementById('sunTimes').classList.add('hidden');
  document.getElementById('weatherMeta').classList.add('hidden');
  try {
    const whenEl=document.getElementById('whenInput');
    const when=whenEl.value?new Date(whenEl.value):new Date();
    await fetchWeatherFor(lastCoords.lat,lastCoords.lon,when);
  } catch(err) {
    console.error(err);
    setStatus('Weather fetch failed — check date/location or enter values manually', true);
    document.getElementById('refreshBtn').disabled=false;
  }
}
function closeChart() {
  document.getElementById('chartModal').classList.add('hidden');
  document.getElementById('chartModal').classList.remove('flex');
  if (chartInstance) { chartInstance.destroy(); chartInstance=null; }
}
function openChart(mode) {
  if (!hourlySeries||!hourlySeries.times.length) { setStatus('Load weather first to view charts', true); return; }
  activeChartMode=mode;
  const modal=document.getElementById('chartModal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
  const labels=hourlySeries.times.map(t=>new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}));
  const toggles=document.getElementById('chartToggles');
  const title=document.getElementById('chartTitle');
  if (mode==='all') {
    title.textContent='Layered conditions';
    toggles.classList.remove('hidden');
    toggles.innerHTML='<label class="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer"><input type="checkbox" checked data-series="hi" onchange="rebuildLayeredChart()" class="rounded border-slate-600"> Heat Index</label> <label class="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer"><input type="checkbox" checked data-series="wbgt" onchange="rebuildLayeredChart()" class="rounded border-slate-600"> WBGT</label> <label class="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer"><input type="checkbox" checked data-series="uv" onchange="rebuildLayeredChart()" class="rounded border-slate-600"> UV</label> <label class="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer"><input type="checkbox" checked data-series="pressure" onchange="rebuildLayeredChart()" class="rounded border-slate-600"> Pressure</label> <label class="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer"><input type="checkbox" data-series="temp" onchange="rebuildLayeredChart()" class="rounded border-slate-600"> Air Temp</label> <label class="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer"><input type="checkbox" data-series="hum" onchange="rebuildLayeredChart()" class="rounded border-slate-600"> Humidity</label>';
    rebuildLayeredChart();
  } else {
    toggles.classList.add('hidden');
    const map={
      hi:{label:'Heat Index',data:hourlySeries.hi,color:'#22d3ee',unit:unit==='F'?'°F':'°C',transform:unit==='C'?(v=>fToC(v)):(v=>v)},
      wbgt:{label:'WBGT',data:hourlySeries.wbgt,color:'#38bdf8',unit:unit==='F'?'°F':'°C',transform:unit==='F'?(v=>cToF(v)):(v=>v)},
      uv:{label:'UV Index',data:hourlySeries.uv,color:'#a78bfa',unit:'',transform:v=>v},
      pressure:{label:'Pressure',data:hourlySeries.pressure,color:'#34d399',unit:'hPa',transform:v=>v}
    };
    const s=map[mode]; title.textContent=s.label+' over time';
    const values=s.data.map(v=>v==null?null:Math.round(s.transform(v)*10)/10);
    renderChart(labels,[{label:s.label+(s.unit?' ('+s.unit+')':''),data:values,borderColor:s.color,backgroundColor:s.color+'22',tension:0.25,fill:true,pointRadius:2}],false);
  }
}
function rebuildLayeredChart() {
  if (!hourlySeries) return;
  const labels=hourlySeries.times.map(t=>new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}));
  const checks=document.querySelectorAll('#chartToggles input[type=checkbox]');
  const defs={
    hi:{label:'Heat Index',data:hourlySeries.hi,color:'#22d3ee',yAxisID:'y',transform:unit==='C'?fToC:(v=>v),tip:(v)=>formatTemp(unit==='C'?cToF(v):v)},
    wbgt:{label:'WBGT',data:hourlySeries.wbgt,color:'#38bdf8',yAxisID:'y',transform:unit==='F'?cToF:(v=>v),tip:(v)=>unit==='F'?(Math.round(v*10)/10+'°F'):(v+'°C')},
    temp:{label:'Air Temp',data:hourlySeries.tempF,color:'#fbbf24',yAxisID:'y',transform:unit==='C'?fToC:(v=>v),tip:(v)=>formatTemp(unit==='C'?cToF(v):v)},
    uv:{label:'UV (scaled)',data:hourlySeries.uv,color:'#a78bfa',yAxisID:'y1',transform:v=>v==null?null:(v/12)*100,tip:(v,raw)=>raw==null?'—':raw.toFixed(1)},
    hum:{label:'Humidity %',data:hourlySeries.hum,color:'#94a3b8',yAxisID:'y1',transform:v=>v,tip:(v)=>v==null?'—':Math.round(v)+'%'},
    pressure:{label:'Pressure (scaled)',data:hourlySeries.pressure,color:'#34d399',yAxisID:'y1',transform:v=>v==null?null:Math.max(0,Math.min(100,((v-980)/60)*100)),tip:(v,raw)=>raw==null?'—':Math.round(raw)+' hPa'}
  };
  const datasets=[]; let useRight=false;
  checks.forEach(c=>{
    if (!c.checked) return;
    const d=defs[c.dataset.series]; if (!d) return;
    if (d.yAxisID==='y1') useRight=true;
    datasets.push({label:d.label,data:d.data.map(v=>v==null?null:Math.round(d.transform(v)*10)/10),rawData:d.data,tipFn:d.tip,borderColor:d.color,backgroundColor:'transparent',tension:0.25,pointRadius:1.5,borderWidth:2,yAxisID:d.yAxisID});
  });
  renderChart(labels,datasets,useRight);
}
function renderChart(labels, datasets, useRight=false) {
  if (chartInstance) chartInstance.destroy();
  const ctx=document.getElementById('chartCanvas').getContext('2d');
  const tempUnit=unit==='F'?'°F':'°C';
  const scales={
    x:{ticks:{color:'#64748b',maxRotation:0,autoSkipPadding:12},grid:{color:'rgba(51,65,85,0.4)'}},
    y:{type:'linear',position:'left',title:{display:true,text:'Temp / HI / WBGT ('+tempUnit+')',color:'#94a3b8',font:{size:11}},ticks:{color:'#64748b'},grid:{color:'rgba(51,65,85,0.4)'}}
  };
  if (useRight) {
    scales.y1={type:'linear',position:'right',min:0,max:100,title:{display:true,text:'UV · Humidity · Pressure (0–100 scaled)',color:'#94a3b8',font:{size:11}},ticks:{color:'#64748b'},grid:{drawOnChartArea:false}};
  }
  chartInstance=new Chart(ctx,{type:'line',data:{labels,datasets},options:{
    responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{labels:{color:'#94a3b8',boxWidth:12,font:{size:11}}},
      tooltip:{backgroundColor:'#0f172a',titleColor:'#e2e8f0',bodyColor:'#cbd5e1',borderColor:'#334155',borderWidth:1,
        callbacks:{label:function(ctx){const ds=ctx.dataset,i=ctx.dataIndex,raw=ds.rawData?ds.rawData[i]:ctx.parsed.y;
          if(ds.tipFn){try{return ' '+ds.label.replace(' (scaled)','')+': '+ds.tipFn(ctx.parsed.y,raw);}catch(e){return ' '+ds.label+': '+ctx.parsed.y;}}
          return ' '+ds.label+': '+ctx.parsed.y;}}}},
    scales}});
}
document.getElementById('pace').addEventListener('blur',function(){const dec=parsePace(this.value);if(!isNaN(dec)&&dec>0)this.value=formatPace(dec);});
(function setDefaultWhen(){const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());document.getElementById('whenInput').value=now.toISOString().slice(0,16);})();
updateUnitUI();
useMyLocation();
