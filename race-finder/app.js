// Race Finder — Pace Kit
// Same-origin CF Pages Functions proxy for RunSignUp (no flaky CORS proxies)
const RSU_LIST = '/api/rsu/races';
const RSU_RACE = '/api/rsu/race/';
const RSU_DIRECT = 'https://api.runsignup.com/rest';
const RF_BASE = 'https://api.racefinder.net/api/v1';

const DIST_BANDS = {
  '5k': { loMi: 2.8, hiMi: 3.5, label: '5K' },
  '10k': { loMi: 5.8, hiMi: 6.6, label: '10K' },
  half: { loMi: 12.5, hiMi: 13.5, label: 'Half' },
  marathon: { loMi: 25.5, hiMi: 26.8, label: 'Marathon' },
  ultra: { loMi: 30, hiMi: 999, label: 'Ultra' }
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
function addDaysISO(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
function setDefaults() {
  document.getElementById('startDate').value = todayISO();
  document.getElementById('endDate').value = addDaysISO(90);
}
function setStatus(msg, isError) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'text-sm ' + (isError ? 'text-red-400' : 'text-slate-400');
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return await res.json();
}

/** Prefer same-origin proxy; fall back to direct (may fail CORS in browser). */
async function fetchRsuJson(pathAndQuery) {
  try {
    if (pathAndQuery.startsWith('race/')) {
      const rest = pathAndQuery.slice('race/'.length);
      return await fetchJson(RSU_RACE + rest);
    }
    if (pathAndQuery.startsWith('races')) {
      const q = pathAndQuery.includes('?') ? pathAndQuery.slice(pathAndQuery.indexOf('?')) : '';
      return await fetchJson(RSU_LIST + q);
    }
  } catch (e) {
    console.warn('proxy failed', e);
  }
  return await fetchJson(RSU_DIRECT + '/' + pathAndQuery);
}

function parseDistanceToMiles(str) {
  if (!str) return null;
  const s = String(str).trim().toLowerCase().replace(/,/g, '');
  if (/half/.test(s)) return 13.1;
  if (/marathon/.test(s) && !/half/.test(s)) return 26.2;
  const m = s.match(/([\d.]+)\s*(k|km|m|mi|mile|miles)?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'k' || unit === 'km') return n * 0.621371;
  if (unit === 'm' && n > 40) return n * 0.621371;
  if (unit === 'm' || unit === 'mi' || unit === 'mile' || unit === 'miles') return n;
  if (n === 5 || n === 10) return n * 0.621371;
  return n;
}

function formatDistLabel(str, miles) {
  if (str) return String(str);
  if (miles == null) return '—';
  if (Math.abs(miles - 3.1) < 0.3) return '5K';
  if (Math.abs(miles - 6.2) < 0.4) return '10K';
  if (Math.abs(miles - 13.1) < 0.4) return 'Half';
  if (Math.abs(miles - 26.2) < 0.5) return 'Marathon';
  return (Math.round(miles * 10) / 10) + ' mi';
}

function parseRsuDate(s) {
  if (!s) return null;
  const part = String(s).split(' ')[0];
  const p = part.split('/');
  if (p.length !== 3) return null;
  return p[2] + '-' + p[0].padStart(2, '0') + '-' + p[1].padStart(2, '0');
}

function normalizeKey(name, dateIso, city) {
  return [name, dateIso, city]
    .map(x => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
    .join('|');
}

function normalizeFromRsu(race) {
  const addr = race.address || {};
  const dateIso = parseRsuDate(race.next_date);
  const events = (race.events || [])
    .filter(e => e.event_type !== 'virtual_race' && e.volunteer !== 'T')
    .map(e => {
      const miles = parseDistanceToMiles(e.distance);
      return {
        name: e.name,
        distanceRaw: e.distance,
        miles,
        label: formatDistLabel(e.distance, miles),
        start: e.start_time,
        type: e.event_type,
        fee: (e.registration_periods && e.registration_periods[0]) ? e.registration_periods[0].race_fee : null
      };
    });
  return {
    id: 'rsu-' + race.race_id,
    raceId: race.race_id,
    source: 'runsignup',
    name: race.name,
    dateIso,
    dateDisplay: race.next_date,
    city: addr.city || '',
    state: addr.state || '',
    zip: addr.zipcode || '',
    street: addr.street || '',
    country: addr.country_code || 'US',
    url: race.url,
    logo: race.logo_url,
    open: race.is_registration_open === 'T',
    description: race.description,
    events,
    key: normalizeKey(race.name, dateIso, addr.city)
  };
}

function normalizeFromRf(r) {
  const name = r.name || r.title || '';
  const dateIso = (r.start_date || r.date || '').slice(0, 10);
  const city = r.city || (r.location && r.location.city) || '';
  const state = r.state || (r.location && r.location.state) || '';
  const dist = r.distance || r.distance_label || '';
  const miles = parseDistanceToMiles(dist);
  return {
    id: 'rf-' + (r.id || r.race_id || name + dateIso),
    raceId: r.race_id || r.id,
    source: 'racefinder',
    name,
    dateIso,
    dateDisplay: dateIso,
    city,
    state,
    zip: r.zipcode || '',
    street: '',
    country: r.country || 'US',
    url: r.register_url || r.url || r.details_url || '',
    logo: null,
    open: true,
    description: '',
    events: dist ? [{ name: dist, distanceRaw: dist, miles, label: formatDistLabel(dist, miles), start: null, type: 'running_race', fee: null }] : [],
    key: normalizeKey(name, dateIso, city)
  };
}

function matchesDistance(race, band) {
  if (!band || band === 'any') return true;
  const b = DIST_BANDS[band];
  if (!b) return true;
  if (!race.events.length) return true;
  return race.events.some(e => e.miles != null && e.miles >= b.loMi && e.miles <= b.hiMi);
}

function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
}

async function fetchRsuList(params) {
  const q = new URLSearchParams({ format: 'json', results_per_page: String(params.pageSize || 40) });
  if (params.state) q.set('state', params.state);
  // Prefer ZIP radius over city — combining both often returns zero on RSU
  if (params.zip) {
    q.set('zipcode', params.zip);
    q.set('radius', String(params.radius || 50));
  } else if (params.city) {
    q.set('city', params.city);
  }
  if (params.start) q.set('start_date', params.start);
  if (params.end) q.set('end_date', params.end);
  if (params.band && DIST_BANDS[params.band]) {
    const b = DIST_BANDS[params.band];
    q.set('distance_units', 'M');
    q.set('min_distance', String(b.loMi));
    if (b.hiMi < 900) q.set('max_distance', String(b.hiMi));
  }
  const data = await fetchRsuJson('races?' + q.toString());
  return (data.races || []).map(x => normalizeFromRsu(x.race || x));
}

async function enrichRsu(race) {
  if (!race.raceId) return race;
  try {
    const data = await fetchRsuJson('race/' + race.raceId + '?format=json');
    const full = data.race || data;
    return normalizeFromRsu(full);
  } catch {
    return race;
  }
}

async function fetchRacefinder(params) {
  try {
    const q = new URLSearchParams({ per_page: '30' });
    if (params.state) q.set('state', params.state);
    if (params.city) q.set('city', params.city);
    if (params.zip) { q.set('zipcode', params.zip); q.set('radius', String(params.radius || 50)); }
    if (params.start) q.set('start_date', params.start);
    if (params.end) q.set('end_date', params.end);
    if (params.band && params.band !== 'any') {
      const map = { '5k': '5k', '10k': '10k', half: 'half-marathon', marathon: 'marathon', ultra: 'ultra' };
      if (map[params.band]) q.set('distance', map[params.band]);
    }
    q.set('sport', 'running');
    const data = await fetchJson(RF_BASE + '/races?' + q.toString());
    const list = data.races || data.results || data || [];
    if (!Array.isArray(list)) return [];
    return list.map(normalizeFromRf);
  } catch {
    return [];
  }
}

function mergePreferRsu(rsuList, rfList) {
  const byKey = new Map();
  for (const r of rfList) {
    if (!r.name) continue;
    byKey.set(r.key, r);
  }
  for (const r of rsuList) {
    byKey.set(r.key, r);
  }
  const byId = new Map();
  for (const r of byKey.values()) {
    const idKey = r.raceId ? 'id:' + r.raceId : r.key;
    const prev = byId.get(idKey);
    if (!prev || (r.source === 'runsignup' && prev.source !== 'runsignup')) byId.set(idKey, r);
  }
  return Array.from(byId.values()).sort((a, b) => (a.dateIso || '9999').localeCompare(b.dateIso || '9999'));
}

async function geocodePlace(city, state, zip) {
  if (zip) {
    try {
      const res = await fetch('https://nominatim.openstreetmap.org/search?postalcode=' + encodeURIComponent(zip) + '&country=US&format=json&limit=1', {
        headers: { Accept: 'application/json', 'User-Agent': 'PaceKit-RaceFinder/1.0 (https://pacekit.net)' }
      });
      if (res.ok) {
        const arr = await res.json();
        if (arr[0]) return { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon) };
      }
    } catch (_) {}
  }
  if (!city) return null;
  try {
    const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&country=US&count=5';
    const data = await fetch(url).then(r => r.json());
    const results = data.results || [];
    let hit = results[0];
    if (state) {
      const st = state.toUpperCase();
      const adminMap = { TX: 'Texas', CA: 'California', FL: 'Florida', NY: 'New York', CO: 'Colorado', AZ: 'Arizona', GA: 'Georgia', NC: 'North Carolina', WA: 'Washington', OR: 'Oregon' };
      const full = adminMap[st] || st;
      hit = results.find(r => (r.admin1 || '').toLowerCase() === full.toLowerCase()) || hit;
    }
    if (hit) return { lat: hit.latitude, lon: hit.longitude };
  } catch (_) {}
  return null;
}

async function fetchDailyWeather(lat, lon) {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
    '&daily=temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_probability_max,weathercode,windspeed_10m_max' +
    '&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto&forecast_days=16';
  const data = await fetch(url).then(r => r.json());
  const daily = data.daily || {};
  const map = {};
  (daily.time || []).forEach((t, i) => {
    map[t] = {
      tmax: daily.temperature_2m_max[i],
      tmin: daily.temperature_2m_min[i],
      rh: daily.relative_humidity_2m_mean ? daily.relative_humidity_2m_mean[i] : null,
      pop: daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : null,
      wind: daily.windspeed_10m_max ? daily.windspeed_10m_max[i] : null,
      code: daily.weathercode ? daily.weathercode[i] : null
    };
  });
  return map;
}

function weatherLabel(code) {
  if (code == null) return '';
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Clouds';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code >= 95) return 'Storms';
  return '';
}

function weatherBadge(w) {
  if (!w) return '<span class="text-[11px] text-slate-500">Forecast not yet available</span>';
  const bits = [];
  if (w.tmin != null && w.tmax != null) bits.push(Math.round(w.tmin) + '–' + Math.round(w.tmax) + '°F');
  if (w.rh != null) bits.push(Math.round(w.rh) + '% RH');
  if (w.pop != null) bits.push(Math.round(w.pop) + '% precip');
  if (w.wind != null) bits.push(Math.round(w.wind) + ' mph wind');
  const sky = weatherLabel(w.code);
  return '<span class="text-[11px] text-sky-300/90">' + (sky ? sky + ' · ' : '') + bits.join(' · ') + '</span>';
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;');
}

function raceCard(r, weather) {
  const loc = [r.city, r.state].filter(Boolean).join(', ') + (r.zip ? ' ' + r.zip : '');
  const dists = r.events.length
    ? r.events.map(e => e.label).filter((v, i, a) => a.indexOf(v) === i).slice(0, 6).join(' · ')
    : 'Distances TBD';
  const openBadge = r.open
    ? '<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-600/80 text-white">Registration open</span>'
    : '<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">Reg. closed / unknown</span>';
  const src = r.source === 'runsignup' ? 'RunSignUp' : 'RaceFinder';
  const fullBlurb = stripHtml(r.description);
  const blurb = fullBlurb.slice(0, 160);
  const link = r.url
    ? '<a href="' + escapeHtml(r.url) + '" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-sm font-medium text-cyan-400 hover:text-cyan-300">Register / details <span aria-hidden="true">→</span></a>'
    : '';
  return '<article class="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 fade-in space-y-2.5">' +
    '<div class="flex items-start justify-between gap-3">' +
      '<div class="min-w-0">' +
        '<h2 class="text-base font-semibold text-slate-100 leading-snug">' + escapeHtml(r.name) + '</h2>' +
        '<div class="mt-1 text-xs text-slate-400">' + escapeHtml(r.dateDisplay || r.dateIso || '—') + (loc ? ' · ' + escapeHtml(loc) : '') + '</div>' +
      '</div>' +
      openBadge +
    '</div>' +
    '<div class="text-sm text-slate-300">' + escapeHtml(dists) + '</div>' +
    '<div class="flex flex-wrap items-center gap-2">' +
      '<span class="text-[10px] uppercase tracking-wider text-slate-500">Race-day wx</span>' +
      weatherBadge(weather) +
    '</div>' +
    (blurb ? '<p class="text-xs text-slate-500 leading-relaxed">' + escapeHtml(blurb) + (fullBlurb.length > 160 ? '…' : '') + '</p>' : '') +
    '<div class="flex items-center justify-between gap-2 pt-1">' +
      link +
      '<span class="text-[10px] text-slate-600">' + src + '</span>' +
    '</div>' +
  '</article>';
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function searchRaces() {
  const zip = document.getElementById('zip').value.trim();
  const radius = parseInt(document.getElementById('radius').value, 10) || 50;
  const city = document.getElementById('city').value.trim();
  const state = document.getElementById('state').value.trim().toUpperCase();
  const start = document.getElementById('startDate').value;
  const end = document.getElementById('endDate').value;
  const band = document.getElementById('distance').value;
  const maxResults = parseInt(document.getElementById('maxResults').value, 10) || 25;

  if (!zip && !state && !city) {
    setStatus('Enter a ZIP or state at minimum.', true);
    return;
  }

  const btn = document.getElementById('searchBtn');
  btn.disabled = true;
  btn.classList.add('opacity-60');
  setStatus('Searching RunSignUp…');
  document.getElementById('results').innerHTML = '';

  const params = { zip, radius, city, state, start, end, band, pageSize: Math.max(maxResults, 40) };

  try {
    let rsu = [];
    let rsuErr = null;
    try {
      rsu = await fetchRsuList(params);
    } catch (e) {
      rsuErr = e;
      console.warn(e);
    }
    const rf = await fetchRacefinder(params);

    if (!rsu.length && !rf.length) {
      setStatus(
        rsuErr
          ? ('Could not reach race data (' + (rsuErr.message || 'network') + '). Try again in a moment.')
          : 'No races matched. Try a larger radius, clear City, or widen dates.',
        true
      );
      return;
    }

    setStatus('Found ' + rsu.length + ' on RunSignUp' + (rf.length ? ', ' + rf.length + ' on RaceFinder' : '') + '. Loading details…');

    let merged = mergePreferRsu(rsu, rf);
    const need = merged.filter(r => r.source === 'runsignup' && !r.events.length).slice(0, maxResults);
    if (need.length) {
      const enriched = await mapPool(need, 4, enrichRsu);
      const map = new Map(enriched.map(r => [r.id, r]));
      merged = merged.map(r => map.get(r.id) || r);
    }

    merged = merged.filter(r => matchesDistance(r, band));
    if (start) merged = merged.filter(r => !r.dateIso || r.dateIso >= start);
    if (end) merged = merged.filter(r => !r.dateIso || r.dateIso <= end);
    merged = merged.slice(0, maxResults);

    if (!merged.length) {
      setStatus('API returned races but none in this date/distance window. Widen dates or set Distance to Any.', true);
      return;
    }

    setStatus('Loading race-day weather…');
    const placeCache = new Map();
    async function coordsFor(r) {
      const k = (r.zip || '') + '|' + r.city + '|' + r.state;
      if (placeCache.has(k)) return placeCache.get(k);
      const c = await geocodePlace(r.city, r.state, r.zip);
      placeCache.set(k, c);
      return c;
    }

    const weatherByPlaceDate = new Map();
    for (const r of merged) {
      r._coords = await coordsFor(r);
    }
    const uniqueCoords = [];
    const seenC = new Set();
    for (const r of merged) {
      if (!r._coords) continue;
      const k = r._coords.lat.toFixed(2) + ',' + r._coords.lon.toFixed(2);
      if (seenC.has(k)) continue;
      seenC.add(k);
      uniqueCoords.push(r._coords);
    }
    for (const c of uniqueCoords.slice(0, 8)) {
      try {
        const daily = await fetchDailyWeather(c.lat, c.lon);
        weatherByPlaceDate.set(c.lat.toFixed(2) + ',' + c.lon.toFixed(2), daily);
      } catch (e) { console.warn(e); }
    }

    document.getElementById('results').innerHTML = merged.map(r => {
      let w = null;
      if (r._coords && r.dateIso) {
        const daily = weatherByPlaceDate.get(r._coords.lat.toFixed(2) + ',' + r._coords.lon.toFixed(2));
        if (daily) w = daily[r.dateIso] || null;
      }
      return raceCard(r, w);
    }).join('');

    setStatus(merged.length + ' race' + (merged.length === 1 ? '' : 's') + ' · RunSignUp · weather when within ~16 days');
  } catch (err) {
    console.error(err);
    setStatus('Search failed: ' + (err.message || 'unknown error'), true);
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-60');
  }
}

setDefaults();
