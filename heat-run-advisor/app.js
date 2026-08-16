// ---------- State ----------
let unit = localStorage.getItem('heatAdvisorUnit') || 'F';
let lastTempF = 85;
let lastUv = null;
let lastPressure = null;
let lastCoords = null;
let hourlySeries = null; // selected-day series for charts
let forecastHours = null; // multi-hour for best-window scoring
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
  unit = u; localStorage.setItem('heatAdvisorUnit', unit); updateUnitUI(); if (typeof advise === 'function') advise();
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
function getDurationMin() {
  const d = parseFloat(document.getElementById('duration').value);
  if (!isNaN(d) && d > 0) return d;
  const dist = parseFloat(document.getElementById('dist').value) || 0;
  const pace = parsePace(document.getElementById('pace').value);
  if (dist > 0 && !isNaN(pace) && pace > 0) return dist * pace;
  return 60;
}
function intensityFactor(type) {
  return ({ easy: 0.85, steady: 1, tempo: 1.1, intervals: 1.15, long: 1.05, race: 1.2 })[type] || 1;
}
function carbPlan(durationMin, type) {
  const h = durationMin / 60;
  let lo, hi, note;
  if (durationMin < 45) { lo = 0; hi = 15; note = 'Under ~45–60 min: carbs optional; mouth rinse can help hard efforts.'; }
  else if (durationMin < 150) { lo = 30; hi = 60; note = '1–2.5 h: typically 30–60 g/h (ACSM).'; }
  else { lo = 60; hi = 90; note = '>2.5 h: up to ~90 g/h with mixed carbs (glucose+fructose).'; }
  const f = intensityFactor(type);
  lo = Math.round(lo * (type === 'easy' ? 0.85 : 1));
  hi = Math.round(hi * (type === 'race' || type === 'tempo' ? Math.min(f, 1.15) : 1));
  const mid = Math.round((lo + hi) / 2);
  return { lo, hi, mid, totalLo: Math.round(lo * h), totalHi: Math.round(hi * h), note, hours: h };
}
function fluidPlan(durationMin, WBGT, type, weightLb) {
  let base = 0.55;
  if (WBGT >= 28) base = 0.75;
  else if (WBGT >= 24) base = 0.65;
  else if (WBGT >= 20) base = 0.58;
  else if (WBGT < 16) base = 0.45;
  base *= intensityFactor(type);
  base = Math.min(0.9, Math.max(0.35, base));
  const h = durationMin / 60;
  const totalL = base * h;
  let detail = Math.round(base * 33.814) + ' oz/hr';
  if (weightLb && weightLb > 50) detail += ' · aim to stay under ~2% body-mass loss';
  return { Lph: base, totalL, totalOz: totalL * 33.814, detail };
}
function sodiumPlan(durationMin, WBGT, type, salty) {
  let lo = 300, hi = 600;
  if (WBGT >= 26 || type === 'long' || type === 'race') { lo = 400; hi = 750; }
  if (salty) { lo += 150; hi += 250; }
  if (durationMin < 60) { lo = Math.round(lo * 0.5); hi = Math.round(hi * 0.6); }
  const h = durationMin / 60;
  return { lo, hi, totalLo: Math.round(lo * h), totalHi: Math.round(hi * h) };
}
function scoreWindow(avgWbgt, maxWbgt, avgUv) {
  let s = avgWbgt * 3 + Math.max(0, maxWbgt - avgWbgt) * 1.5;
  if (avgUv != null) s += avgUv * 0.4;
  if (maxWbgt >= 32.3) s += 40;
  else if (maxWbgt >= 28) s += 20;
  else if (maxWbgt >= 23) s += 8;
  return s;
}
