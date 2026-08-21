// Run Club Finder — Pace Kit
const GH_ISSUES = 'https://github.com/SlyEch0/runforge/issues/new';
const CONTACT_EMAIL = 'ctr90@sbcglobal.net';

let CLUBS = [];
let ORIGIN = { lat: 29.5822, lon: -95.7607 };
let ACTIVE_CLUB = null;
let PLACE_OPTIONS = [];
let placeTimer = null;

function setStatus(msg, isError) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'text-sm ' + (isError ? 'text-red-400' : 'text-slate-400');
}

function haversineMi(a, b) {
  const R = 3958.8;
  const toRad = function (d) { return d * Math.PI / 180; };
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
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

function normalizeWebsite(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^instagram\.com\//i.test(s) || /^www\./i.test(s) || /^[\w.-]+\.[a-z]{2,}/i.test(s)) {
    return 'https://' + s.replace(/^\/+/, '');
  }
  return s;
}

function openGitHubIssue(title, body, labels) {
  var url = GH_ISSUES + '?title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
  if (labels && labels.length) url += '&labels=' + encodeURIComponent(labels.join(','));
  window.open(url, '_blank', 'noopener');
}

function openMailto(title, body) {
  var mail = 'mailto:' + CONTACT_EMAIL +
    '?subject=' + encodeURIComponent(title) +
    '&body=' + encodeURIComponent(body);
  // location.assign is more reliable than <a href> on mobile browsers
  window.location.href = mail;
}

function buildSuggestionPayload() {
  var name = document.getElementById('sName').value.trim();
  var city = document.getElementById('sCity').value.trim();
  var website = normalizeWebsite(document.getElementById('sWebsite').value);
  var days = document.getElementById('sDays').value.trim();
  var notes = document.getElementById('sNotes').value.trim();
  if (!name) {
    document.getElementById('sName').focus();
    return null;
  }
  if (!city) {
    document.getElementById('sCity').focus();
    return null;
  }
  var title = 'Club suggestion: ' + name + ' (' + city + ')';
  var body = [
    '### Club suggestion',
    '',
    '**Type:** club-suggestion',
    '',
    '**Name:** ' + name,
    '**City / State:** ' + city,
    '**Website / social:** ' + (website || '(none)'),
    '**Typical days:** ' + (days || '(unknown)'),
    '**Notes:** ' + (notes || '(none)'),
    '',
    '_Submitted via Pace Kit Run Club Finder_'
  ].join('\n');
  return { title: title, body: body, website: website };
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

function rebuildPlaceOptions() {
  var seen = {};
  var list = [];
  CLUBS.forEach(function (c) {
    var label = [c.city, c.state].filter(Boolean).join(', ');
    if (!label || seen[label.toLowerCase()]) return;
    seen[label.toLowerCase()] = true;
    list.push(label);
  });
  // Helpful extras for expansion beyond current dataset
  [
    'Houston, TX', 'Richmond, TX', 'Katy, TX', 'Sugar Land, TX', 'Missouri City, TX',
    'Fulshear, TX', 'Rosenberg, TX', 'Pasadena, TX', 'The Woodlands, TX', 'Spring, TX',
    'Cypress, TX', 'Pearland, TX', 'League City, TX', 'Clear Lake, TX', 'Austin, TX',
    'Dallas, TX', 'Fort Worth, TX', 'San Antonio, TX'
  ].forEach(function (label) {
    if (!seen[label.toLowerCase()]) {
      seen[label.toLowerCase()] = true;
      list.push(label);
    }
  });
  list.sort(function (a, b) { return a.localeCompare(b); });
  PLACE_OPTIONS = list;

  var dl = document.getElementById('placeDatalist');
  if (dl) {
    dl.innerHTML = list.map(function (p) {
      return '<option value="' + escapeHtml(p) + '"></option>';
    }).join('');
  }
}

function filterLocalPlaces(q) {
  q = String(q || '').trim().toLowerCase();
  if (!q) return PLACE_OPTIONS.slice(0, 8);
  return PLACE_OPTIONS.filter(function (p) {
    return p.toLowerCase().indexOf(q) >= 0;
  }).slice(0, 8);
}

function showPlaceSuggest(items) {
  var box = document.getElementById('placeSuggestBox');
  if (!box) return;
  if (!items || !items.length) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.innerHTML = items.map(function (p) {
    return '<button type="button" class="place-opt w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 border-b border-slate-800/80 last:border-0" data-place="' +
      escapeHtml(p) + '">' + escapeHtml(p) + '</button>';
  }).join('');
  box.classList.remove('hidden');
}

function hidePlaceSuggest() {
  var box = document.getElementById('placeSuggestBox');
  if (box) {
    box.classList.add('hidden');
    box.innerHTML = '';
  }
}

async function fetchRemotePlaces(q) {
  if (!q || q.length < 3) return [];
  try {
    var url = 'https://geocoding-api.open-meteo.com/v1/search?name=' +
      encodeURIComponent(q) + '&country=US&count=6&language=en';
    var data = await fetch(url).then(function (r) { return r.json(); });
    var results = data.results || [];
    return results.map(function (r) {
      var parts = [r.name];
      if (r.admin1) {
        // Prefer 2-letter if already short; otherwise use admin1 as-is
        parts.push(r.admin1);
      }
      return parts.join(', ');
    });
  } catch (_) {
    return [];
  }
}

function onCityInput() {
  var input = document.getElementById('sCity');
  var q = input.value;
  var local = filterLocalPlaces(q);
  showPlaceSuggest(local);

  if (placeTimer) clearTimeout(placeTimer);
  if (!q || q.trim().length < 3) return;
  placeTimer = setTimeout(async function () {
    var remote = await fetchRemotePlaces(q.trim());
    var seen = {};
    var merged = [];
    local.concat(remote).forEach(function (p) {
      var k = p.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      merged.push(p);
    });
    // Only refresh if input still matches
    if (document.getElementById('sCity').value.trim() === q.trim()) {
      showPlaceSuggest(merged.slice(0, 8));
    }
  }, 280);
}

function clubCard(c, distMi) {
  var days = (c.days && c.days.length) ? c.days.join(' · ') : 'Schedule varies';
  var vibes = (c.vibe || []).slice(0, 4).map(function (v) {
    return '<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">' + escapeHtml(v) + '</span>';
  }).join(' ');
  var d = distLabel(distMi);
  var idAttr = escapeHtml(c.id || '');

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
  document.getElementById('modalTitle').textContent = c.name || 'Club';

  var days = (c.days && c.days.length) ? c.days.join(' · ') : 'Schedule varies / not listed';
  var vibes = (c.vibe || []).map(function (v) {
    return '<span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">' + escapeHtml(v) + '</span>';
  }).join(' ');
  var d = distLabel(c._dist);
  var loc = [c.city, c.state].filter(Boolean).join(', ') + (c.zip ? ' ' + c.zip : '');

  var links = [];
  if (c.website) links.push('<a href="' + escapeHtml(c.website) + '" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-sm font-medium text-cyan-400 hover:text-cyan-300">Website <span aria-hidden="true">→</span></a>');
  if (c.instagram) links.push('<a href="' + escapeHtml(c.instagram) + '" target="_blank" rel="noopener" class="text-sm text-slate-300 hover:text-white">Instagram</a>');
  if (c.meetup) links.push('<a href="' + escapeHtml(c.meetup) + '" target="_blank" rel="noopener" class="text-sm text-slate-300 hover:text-white">Meetup</a>');
  if (c.strava) links.push('<a href="' + escapeHtml(c.strava) + '" target="_blank" rel="noopener" class="text-sm text-slate-300 hover:text-white">Strava</a>');

  var rows = [
    ['Location', loc || '—'],
    ['Distance', d || '—'],
    ['Typical days', days],
    ['Cost', c.cost || '—'],
    ['Coordinates', (c.lat != null && c.lon != null) ? (c.lat.toFixed(4) + ', ' + c.lon.toFixed(4)) : '—']
  ];

  var html = '<dl class="space-y-3">';
  rows.forEach(function (pair) {
    html += '<div><dt class="text-[10px] uppercase tracking-wider text-slate-500">' + escapeHtml(pair[0]) + '</dt>' +
      '<dd class="mt-0.5 text-sm text-slate-200">' + escapeHtml(pair[1]) + '</dd></div>';
  });
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
  document.getElementById('clubModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeClubModal() {
  document.getElementById('clubModal').classList.add('hidden');
  document.body.style.overflow = '';
  ACTIVE_CLUB = null;
}

function suggestUpdateForActive() {
  if (!ACTIVE_CLUB) return;
  var c = ACTIVE_CLUB;
  var title = 'Club update: ' + (c.name || c.id) + (c.city ? ' (' + c.city + ')' : '');
  var body = [
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
  var c = ACTIVE_CLUB;
  var title = 'Club issue: ' + (c.name || c.id);
  var body = [
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
  var res = await fetch('./clubs.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load clubs.json');
  var data = await res.json();
  CLUBS = data.clubs || [];
  rebuildPlaceOptions();
  return data;
}

async function searchClubs() {
  var zip = document.getElementById('zip').value.trim();
  var radius = parseInt(document.getElementById('radius').value, 10) || 25;
  var day = document.getElementById('day').value;
  var vibe = document.getElementById('vibe').value;
  var btn = document.getElementById('searchBtn');
  btn.disabled = true;
  btn.classList.add('opacity-60');
  setStatus('Loading clubs…');
  document.getElementById('results').innerHTML = '';

  try {
    if (!CLUBS.length) await loadClubs();

    if (zip) {
      var geo = await geocodeZip(zip);
      if (geo) ORIGIN = geo;
    }

    var list = CLUBS.map(function (c) {
      var dist = (c.lat != null && c.lon != null) ? haversineMi(ORIGIN, { lat: c.lat, lon: c.lon }) : null;
      return Object.assign({}, c, { _dist: dist });
    });

    list = list.filter(function (c) { return c._dist == null || c._dist <= radius; });
    if (day !== 'any') {
      list = list.filter(function (c) { return !c.days || !c.days.length || c.days.indexOf(day) >= 0; });
    }
    if (vibe !== 'any') {
      list = list.filter(function (c) {
        return (c.vibe || []).some(function (v) { return v === vibe || v.indexOf(vibe) >= 0; });
      });
    }
    list.sort(function (a, b) {
      return (a._dist != null ? a._dist : 999) - (b._dist != null ? b._dist : 999);
    });

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

// Results → modal
document.getElementById('results').addEventListener('click', function (e) {
  var card = e.target.closest('.club-card');
  if (!card) return;
  var id = card.getAttribute('data-club-id');
  var list = window.__lastClubList || CLUBS;
  var club = list.find(function (c) { return c.id === id; }) || CLUBS.find(function (c) { return c.id === id; });
  if (club) openClubModal(club);
});
document.getElementById('results').addEventListener('keydown', function (e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  var card = e.target.closest('.club-card');
  if (!card) return;
  e.preventDefault();
  card.click();
});

document.getElementById('btnSuggestUpdate').addEventListener('click', suggestUpdateForActive);
document.getElementById('btnReportIssue').addEventListener('click', reportIssueForActive);

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeClubModal();
    hidePlaceSuggest();
  }
});

// City / state typeahead
document.getElementById('sCity').addEventListener('input', onCityInput);
document.getElementById('sCity').addEventListener('focus', function () {
  onCityInput();
});
document.getElementById('placeSuggestBox').addEventListener('click', function (e) {
  var btn = e.target.closest('.place-opt');
  if (!btn) return;
  document.getElementById('sCity').value = btn.getAttribute('data-place') || '';
  hidePlaceSuggest();
});
document.addEventListener('click', function (e) {
  if (e.target.closest('#sCity') || e.target.closest('#placeSuggestBox')) return;
  hidePlaceSuggest();
});

// Suggest actions
document.getElementById('btnEmailSuggest').addEventListener('click', function () {
  var payload = buildSuggestionPayload();
  if (!payload) return;
  openMailto(payload.title, payload.body);
});
document.getElementById('btnGithubSuggest').addEventListener('click', function () {
  var payload = buildSuggestionPayload();
  if (!payload) return;
  openGitHubIssue(payload.title, payload.body, ['club-suggestion']);
});

loadClubs().then(function () { return searchClubs(); }).catch(function (err) { setStatus(err.message, true); });
