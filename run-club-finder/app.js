// Run Club Finder — Pace Kit
const GH_ISSUES = 'https://github.com/SlyEch0/runforge/issues/new';
const CONTACT_EMAIL = 'ctr90@sbcglobal.net';

let CLUBS = [];
let ORIGIN = { lat: 29.5822, lon: -95.7607 }; // default origin near 77407
let ACTIVE_CLUB = null;

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
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function distLabel(distMi) {
  if (distMi == null || !isFinite(distMi)) return '';
  return (distMi < 10 ? distMi.toFixed(1) : Math.round(distMi)) + ' mi';
}

function openGitHubIssue(title, body, labels) {
  let url = GH_ISSUES + '?title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
  if (labels && labels.length) url += '&labels=' + encodeURIComponent(labels.join(','));
  window.open(url, '_blank', 'noopener');
}

function clubSnapshot(c) {
  return [
    '**Club id:** ' + (c.id || '(none)'),
    '**Name:** ' + (c.name || ''),
    '**City / state:** ' + [c.city, c.state].filter(Boolean).join(', '),
    '**ZIP:** ' + (c.zip || '(none)'),
    '**Days:** ' + ((c.days && c.days.length) ? c.days.join(', ') : '(none listed)'),
    '**Vibe:** ' + ((c.vibe && c.vibe.length) ? c.vibe.join(', ') : '(none)'),
    '**Cost:** ' + (c.cost || '(none)'),
    '**Website:** ' + (c.website || '(none)'),
    '**Instagram:** ' + (c.instagram || '(none)'),
    '**Meetup:** ' + (c.meetup || '(none)'),
    '**Strava:** ' + (c.strava || '(none)'),
    '**Blurb:** ' + (c.blurb || '(none)')
  ].join('\n');
}

function clubCard(c, distMi) {
  const days = (c.days && c.days.length) ? c.days.join(' · ') : 'Schedule varies';
  const vibes = (c.vibe || []).slice(0, 4).map(v =>
    '<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">' + escapeHtml(v) + '</span>'
  ).join(' ');
  const d = distLabel(distMi);
  const idAttr = escapeHtml(c.id || '');

  return '<article class="club-card bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 rounded-2xl p-4 fade-in space-y-2.5 cursor-pointer transition" data-club-id="' + idAttr + '" role="button" tabindex="0">' +
    '<div class="flex items-start justify-between gap-3">' +
      '<div class="min-w-0">' +
        '<h2 class="text-base font-semibold text-slate-100 leading-snug">' + escapeHtml(c.name) + '</h2>' +
        '<div class="mt-1 text-xs text-slate-400">' + escapeHtml([c.city, c.state].filter(Boolean).join(', ')) +
          (c.zip ? ' ' + escapeHtml(c.zip) : '') +
          (d ? ' · ' + d : '') +
        '</div>' +
      '</div>' +
      (c.cost ? '<span class="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">' + escapeHtml(c.cost) + '</span>' : '') +
    '</div>' +
    '<div class="text-sm text-slate-300">' + escapeHtml(days) + '</div>' +
    (vibes ? '<div class="flex flex-wrap gap-1.5">' + vibes + '</div>' : '') +
    (c.blurb ? '<p class="text-xs text-slate-500 leading-relaxed line-clamp-2">' + escapeHtml(c.blurb) + '</p>' : '') +
    '<div class="text-[11px] text-cyan-400/80 pt-0.5">Tap for details →</div>' +
  '</article>';
}

function openClubModal(c) {
  ACTIVE_CLUB = c;
  const modal = document.getElementById('clubModal');
  document.getElementById('modalTitle').textContent = c.name || 'Club';

  const days = (c.days && c.days.length) ? c.days.join(' · ') : 'Schedule varies / not listed';
  const vibes = (c.vibe || []).map(v =>
    '<span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">' + escapeHtml(v) + '</span>'
  ).join(' ');
  const d = distLabel(c._dist);
  const loc = [c.city, c.state].filter(Boolean).join(', ') + (c.zip ? ' ' + c.zip : '');

  const links = [];
  if (c.website) links.push('<a href="' + escapeHtml(c.website) + '" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-sm font-medium text-cyan-400 hover:text-cyan-300">Website <span aria-hidden="true">→</span></a>');
  if (c.instagram) links.push('<a href="' + escapeHtml(c.instagram) + '" target="_blank" rel="noopener" class="text-sm text-slate-300 hover:text-white">Instagram</a>');
  if (c.meetup) links.push('<a href="' + escapeHtml(c.meetup) + '" target="_blank" rel="noopener" class="text-sm text-slate-300 hover:text-white">Meetup</a>');
  if (c.strava) links.push('<a href="' + escapeHtml(c.strava) + '" target="_blank" rel="noopener" class="text-sm text-slate-300 hover:text-white">Strava</a>');

  const rows = [
    ['Location', loc || '—'],
    ['Distance', d || '—'],
    ['Typical days', days],
    ['Cost', c.cost || '—'],
    ['Coordinates', (c.lat != null && c.lon != null) ? (c.lat.toFixed(4) + ', ' + c.lon.toFixed(4)) : '—']
  ];

  let html = '<dl class="space-y-3">';
  for (const [k, v] of rows) {
    html += '<div><dt class="text-[10px] uppercase tracking-wider text-slate-500">' + escapeHtml(k) + '</dt>' +
      '<dd class="mt-0.5 text-sm text-slate-200">' + escapeHtml(v) + '</dd></div>';
  }
  html += '</dl>';

  if (vibes) {
    html += '<div><div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Vibe</div><div class="flex flex-wrap gap-1.5">' + vibes + '</div></div>';
  }
  if (c.blurb) {
    html += '<div><div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">About</div><p class="text-sm text-slate-300 leading-relaxed">' + escapeHtml(c.blurb) + '</p></div>';
  }
  if (links.length) {
    html += '<div class="flex flex-wrap items-center gap-4 pt-1">' + links.join('') + '</div>';
  }

  document.getElementById('modalBody').innerHTML = html;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeClubModal() {
  document.getElementById('clubModal').classList.add('hidden');
  document.body.style.overflow = '';
  ACTIVE_CLUB = null;
}

function suggestUpdateForActive() {
  if (!ACTIVE_CLUB) return;
  const c = ACTIVE_CLUB;
  const title = 'Club update: ' + (c.name || c.id) + (c.city ? ' (' + c.city + ')' : '');
  const body = [
    '### Club update suggestion',
    '',
    '**Type:** club-correction',
    '',
    '#### Current listing',
    clubSnapshot(c),
    '',
    '#### Proposed changes',
    '<!-- Tell us what is wrong or outdated. Edit the fields below. -->',
    '',
    '- Days:',
    '- Vibe:',
    '- Cost:',
    '- Website / social:',
    '- Meetup location / time:',
    '- Other notes:',
    '',
    '_Submitted via Pace Kit Run Club Finder modal_'
  ].join('\n');
  openGitHubIssue(title, body, ['club-correction']);
}

function reportIssueForActive() {
  if (!ACTIVE_CLUB) return;
  const c = ACTIVE_CLUB;
  const title = 'Club issue: ' + (c.name || c.id);
  const body = [
    '### Report an issue with this club listing',
    '',
    '**Type:** club-issue',
    '',
    '#### Listing',
    clubSnapshot(c),
    '',
    '#### What is wrong?',
    '<!-- e.g. club no longer exists, wrong location, spam, unsafe, duplicate -->',
    '',
    '',
    '_Submitted via Pace Kit Run Club Finder modal_'
  ].join('\n');
  openGitHubIssue(title, body, ['club-issue']);
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
      return Object.assign({}, c, { _dist: dist });
    });

    list = list.filter(c => c._dist == null || c._dist <= radius);
    if (day !== 'any') {
      list = list.filter(c => !c.days || !c.days.length || c.days.includes(day));
    }
    if (vibe !== 'any') {
      list = list.filter(c => (c.vibe || []).some(v => v === vibe || v.indexOf(vibe) >= 0));
    }
    list.sort(function (a, b) { return (a._dist != null ? a._dist : 999) - (b._dist != null ? b._dist : 999); });

    if (!list.length) {
      setStatus('No clubs matched. Try a larger radius or clear Day/Vibe filters.', true);
      return;
    }

    window.__lastClubList = list;
    document.getElementById('results').innerHTML = list.map(function (c) { return clubCard(c, c._dist); }).join('');
    setStatus(list.length + ' club' + (list.length === 1 ? '' : 's') + ' within ' + radius + ' mi' + (zip ? ' of ' + zip : '') + ' · tap a card for details');
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
    '**Type:** club-suggestion',
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
  openGitHubIssue(title, body, ['club-suggestion']);

  const mail = 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
  document.getElementById('mailtoLink').href = mail;
  return false;
}

document.getElementById('results').addEventListener('click', function (e) {
  const card = e.target.closest('.club-card');
  if (!card) return;
  const id = card.getAttribute('data-club-id');
  const list = window.__lastClubList || CLUBS;
  const club = list.find(function (c) { return c.id === id; }) || CLUBS.find(function (c) { return c.id === id; });
  if (club) openClubModal(club);
});
document.getElementById('results').addEventListener('keydown', function (e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.club-card');
  if (!card) return;
  e.preventDefault();
  card.click();
});

document.getElementById('btnSuggestUpdate').addEventListener('click', suggestUpdateForActive);
document.getElementById('btnReportIssue').addEventListener('click', reportIssueForActive);

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeClubModal();
});

['sName', 'sCity', 'sWebsite', 'sDays', 'sNotes'].forEach(function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', function () {
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
      'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
  });
});

loadClubs().then(function () { return searchClubs(); }).catch(function (err) { setStatus(err.message, true); });
