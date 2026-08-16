// Run Club Finder — Pace Kit (curated Houston-metro directory)
let CLUBS = [];
let ORIGIN = { lat: 29.5822, lon: -95.7607 }; // Richmond / 77407 approx

function setStatus(msg, isError) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'text-sm ' + (isError ? 'text-red-400' : 'text-slate-400');
}

function haversineMi(a, b) {
  const R = 3958.8;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function geocodeZip(zip) {
  try {
    const res = await fetch(
      'https://nominatim.openstreetmap.org/search?postalcode=' + encodeURIComponent(zip) + '&country=US&format=json&limit=1',
      { headers: { Accept: 'application/json', 'User-Agent': 'PaceKit-RunClubFinder/1.0 (https://pacekit.net)' } }
    );
    if (!res.ok) return null;
    const arr = await res.json();
    if (arr[0]) return { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon) };
  } catch (_) {}
  return null;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;');
}

function clubCard(c, distMi) {
  const days = (c.days && c.days.length) ? c.days.join(' · ') : 'Schedule varies';
  const vibes = (c.vibe || []).slice(0, 4).map(v =>
    '<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">' + escapeHtml(v) + '</span>'
  ).join(' ');
  const links = [];
  if (c.website) links.push('<a href="' + escapeHtml(c.website) + '" target="_blank" rel="noopener" class="text-sm font-medium text-cyan-400 hover:text-cyan-300">Website →</a>');
  if (c.instagram) links.push('<a href="' + escapeHtml(c.instagram) + '" target="_blank" rel="noopener" class="text-sm text-slate-400 hover:text-slate-200">Instagram</a>');
  if (c.meetup) links.push('<a href="' + escapeHtml(c.meetup) + '" target="_blank" rel="noopener" class="text-sm text-slate-400 hover:text-slate-200">Meetup</a>');
  if (c.strava) links.push('<a href="' + escapeHtml(c.strava) + '" target="_blank" rel="noopener" class="text-sm text-slate-400 hover:text-slate-200">Strava</a>');

  const distLabel = distMi != null && isFinite(distMi)
    ? (distMi < 10 ? distMi.toFixed(1) : Math.round(distMi)) + ' mi'
    : '';

  return '<article class="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 fade-in space-y-2.5">' +
    '<div class="flex items-start justify-between gap-3">' +
      '<div class="min-w-0">' +
        '<h2 class="text-base font-semibold text-slate-100 leading-snug">' + escapeHtml(c.name) + '</h2>' +
        '<div class="mt-1 text-xs text-slate-400">' + escapeHtml([c.city, c.state].filter(Boolean).join(', ')) +
          (c.zip ? ' ' + escapeHtml(c.zip) : '') +
          (distLabel ? ' · ' + distLabel : '') +
        '</div>' +
      '</div>' +
      (c.cost ? '<span class="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">' + escapeHtml(c.cost) + '</span>' : '') +
    '</div>' +
    '<div class="text-sm text-slate-300">' + escapeHtml(days) + '</div>' +
    (vibes ? '<div class="flex flex-wrap gap-1.5">' + vibes + '</div>' : '') +
    (c.blurb ? '<p class="text-xs text-slate-500 leading-relaxed">' + escapeHtml(c.blurb) + '</p>' : '') +
    (links.length ? '<div class="flex flex-wrap items-center gap-3 pt-1">' + links.join('') + '</div>' : '') +
  '</article>';
}

async function loadClubs() {
  const res = await fetch('./clubs.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load clubs.json');
  const data = await res.json();
  CLUBS = data.clubs || [];
  return data;
}

async function searchClubs() {
  const zip = document.getElementById('zip').value.trim();
  const radius = parseInt(document.getElementById('radius').value, 10) || 25;
  const day = document.getElementById('day').value;
  const vibe = document.getElementById('vibe').value;
  const btn = document.getElementById('searchBtn');
  btn.disabled = true;
  btn.classList.add('opacity-60');
  setStatus('Loading clubs…');
  document.getElementById('results').innerHTML = '';

  try {
    if (!CLUBS.length) await loadClubs();

    if (zip) {
      const geo = await geocodeZip(zip);
      if (geo) ORIGIN = geo;
    }

    let list = CLUBS.map(c => {
      const dist = (c.lat != null && c.lon != null) ? haversineMi(ORIGIN, { lat: c.lat, lon: c.lon }) : null;
      return { ...c, _dist: dist };
    });

    list = list.filter(c => c._dist == null || c._dist <= radius);
    if (day !== 'any') {
      list = list.filter(c => !c.days || !c.days.length || c.days.includes(day));
    }
    if (vibe !== 'any') {
      list = list.filter(c => (c.vibe || []).some(v => v === vibe || v.includes(vibe)));
    }
    list.sort((a, b) => (a._dist ?? 999) - (b._dist ?? 999));

    if (!list.length) {
      setStatus('No clubs matched. Try a larger radius or clear Day/Vibe filters.', true);
      return;
    }

    document.getElementById('results').innerHTML = list.map(c => clubCard(c, c._dist)).join('');
    setStatus(list.length + ' club' + (list.length === 1 ? '' : 's') + ' within ' + radius + ' mi' + (zip ? ' of ' + zip : ''));
  } catch (err) {
    console.error(err);
    setStatus('Failed to load clubs: ' + (err.message || 'error'), true);
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-60');
  }
}

function submitClub(e) {
  e.preventDefault();
  const name = document.getElementById('sName').value.trim();
  const city = document.getElementById('sCity').value.trim();
  const website = document.getElementById('sWebsite').value.trim();
  const days = document.getElementById('sDays').value.trim();
  const notes = document.getElementById('sNotes').value.trim();

  const body = [
    '### Club suggestion',
    '',
    '**Name:** ' + name,
    '**City:** ' + city,
    '**Website / social:** ' + (website || '(none)'),
    '**Typical days:** ' + (days || '(unknown)'),
    '**Notes:** ' + (notes || '(none)'),
    '',
    '_Submitted via Pace Kit Run Club Finder_'
  ].join('\n');

  const title = 'Club suggestion: ' + name + ' (' + city + ')';
  const url = 'https://github.com/SlyEch0/runforge/issues/new?title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
  window.open(url, '_blank', 'noopener');

  const mail = 'mailto:ctr90@sbcglobal.net?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
  document.getElementById('mailtoLink').href = mail;
  return false;
}

['sName', 'sCity', 'sWebsite', 'sDays', 'sNotes'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    const name = document.getElementById('sName').value.trim() || 'Club';
    const city = document.getElementById('sCity').value.trim() || '';
    const title = 'Club suggestion: ' + name + (city ? ' (' + city + ')' : '');
    const body = [
      'Name: ' + document.getElementById('sName').value,
      'City: ' + document.getElementById('sCity').value,
      'Website: ' + document.getElementById('sWebsite').value,
      'Days: ' + document.getElementById('sDays').value,
      'Notes: ' + document.getElementById('sNotes').value
    ].join('\n');
    document.getElementById('mailtoLink').href =
      'mailto:ctr90@sbcglobal.net?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
  });
});

loadClubs().then(() => searchClubs()).catch(err => setStatus(err.message, true));
