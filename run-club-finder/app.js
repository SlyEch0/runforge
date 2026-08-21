// Run Club Finder — Pace Kit
const CONTACT_EMAIL = 'hello@pacekit.net';
const SUGGEST_API = '/api/suggest';

let CLUBS = [];
let ORIGIN = { lat: 29.5822, lon: -95.7607 };
let ACTIVE_CLUB = null;
let PLACE_OPTIONS = [];
let placeTimer = null;
let proposalMode = null; // 'edit' | 'delete'

function setStatus(msg, isError) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'text-sm ' + (isError ? 'text-red-400' : 'text-slate-400');
}

function setNote(id, msg, kind) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'text-sm leading-relaxed ' + (
    kind === 'error' ? 'text-red-400' :
    kind === 'ok' ? 'text-emerald-400' :
    'text-slate-500'
  );
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

function openMailto(title, body) {
  var mail = 'mailto:' + CONTACT_EMAIL +
    '?subject=' + encodeURIComponent(title) +
    '&body=' + encodeURIComponent(body);
  window.location.href = mail;
}

function honeypotValue() {
  var el = document.getElementById('hpField');
  return el ? el.value : '';
}

async function submitProposal(opts) {
  var statusId = opts.statusId;
  var btn = opts.btn;
  if (btn) {
    btn.disabled = true;
    btn.dataset.prev = btn.textContent;
    btn.textContent = 'Sending…';
  }
  setNote(statusId, 'Sending…');
  try {
    var res = await fetch(SUGGEST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: opts.type,
        title: opts.title,
        body: opts.body,
        replyTo: opts.replyTo || '',
        hp: honeypotValue()
      })
    });
    var data = {};
    try { data = await res.json(); } catch (_) {}
    if (data.ok) {
      setNote(statusId, 'Got it — we’ll review this before anything goes live.', 'ok');
      return true;
    }
    if (res.status === 429) {
      setNote(statusId, 'Too many requests from this network. Try again in a bit, or email ' + CONTACT_EMAIL + '.', 'error');
      return false;
    }
    openMailto(opts.title, opts.body);
    setNote(statusId, 'Opened your mail app to ' + CONTACT_EMAIL + '. If nothing opened, email that address directly.', 'ok');
    return true;
  } catch (_) {
    openMailto(opts.title, opts.body);
    setNote(statusId, 'Opened your mail app to ' + CONTACT_EMAIL + ' as a backup.', 'ok');
    return true;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.dataset.prev || 'Submit';
    }
  }
}

function buildSuggestionPayload() {
  var name = document.getElementById('sName').value.trim();
  var city = document.getElementById('sCity').value.trim();
  var website = normalizeWebsite(document.getElementById('sWebsite').value);
  var days = document.getElementById('sDays').value.trim();
  var notes = document.getElementById('sNotes').value.trim();
  var replyTo = document.getElementById('sReplyTo').value.trim();
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
  return { title: title, body: body, replyTo: replyTo };
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
      if (r.admin1) parts.push(r.admin1);
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
  proposalMode = null;
  document.getElementById('proposalBox').classList.add('hidden');
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
    ['Cost', c.cost || '—']
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
  proposalMode = null;
}

function fieldHtml(id, label, value, multiline) {
  if (multiline) {
    return '<div><label class="block text-xs font-medium text-slate-500 mb-1.5" for="' + id + '">' + escapeHtml(label) + '</label>' +
      '<textarea id="' + id + '" rows="3" class="w-full bg-night-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40">' +
      escapeHtml(value || '') + '</textarea></div>';
  }
  return '<div><label class="block text-xs font-medium text-slate-500 mb-1.5" for="' + id + '">' + escapeHtml(label) + '</label>' +
    '<input id="' + id + '" value="' + escapeHtml(value || '') + '" class="w-full bg-night-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40" /></div>';
}

function showProposal(mode) {
  if (!ACTIVE_CLUB) return;
  proposalMode = mode;
  var box = document.getElementById('proposalBox');
  var heading = document.getElementById('proposalHeading');
  var fields = document.getElementById('proposalFields');
  var c = ACTIVE_CLUB;
  box.classList.remove('hidden');
  setNote('proposalStatus', '');

  if (mode === 'edit') {
    heading.textContent = 'Edit “' + (c.name || 'this club') + '”';
    fields.innerHTML =
      fieldHtml('pName', 'Name', c.name) +
      fieldHtml('pCity', 'City / state', [c.city, c.state].filter(Boolean).join(', ')) +
      fieldHtml('pDays', 'Typical days', (c.days || []).join(', ')) +
      fieldHtml('pCost', 'Cost', c.cost) +
      fieldHtml('pWebsite', 'Website / social', c.website || c.instagram || '') +
      fieldHtml('pNotes', 'What should we change?', '', true);
  } else {
    heading.textContent = 'Request removal';
    fields.innerHTML =
      '<p class="text-sm text-slate-400">Tell us why this listing should come down (closed, duplicate, never existed, unsafe, etc.).</p>' +
      fieldHtml('pReason', 'Reason', '', true);
  }
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function sendActiveProposal() {
  if (!ACTIVE_CLUB || !proposalMode) return;
  var c = ACTIVE_CLUB;
  var btn = document.getElementById('btnSendProposal');

  if (proposalMode === 'edit') {
    var name = (document.getElementById('pName') || {}).value || '';
    var city = (document.getElementById('pCity') || {}).value || '';
    var days = (document.getElementById('pDays') || {}).value || '';
    var cost = (document.getElementById('pCost') || {}).value || '';
    var website = (document.getElementById('pWebsite') || {}).value || '';
    var notes = ((document.getElementById('pNotes') || {}).value || '').trim();
    if (!notes) {
      setNote('proposalStatus', 'Add a short note so we know what to change.', 'error');
      return;
    }
    var title = 'Club update: ' + (c.name || c.id);
    var body = [
      '### Club update suggestion',
      '',
      '**Type:** club-correction',
      '',
      '#### Current listing',
      clubSnapshot(c),
      '',
      '#### Proposed listing',
      '**Name:** ' + name.trim(),
      '**City / state:** ' + city.trim(),
      '**Days:** ' + days.trim(),
      '**Cost:** ' + cost.trim(),
      '**Website / social:** ' + website.trim(),
      '**Notes:** ' + notes,
      '',
      '_Submitted via Pace Kit Run Club Finder_'
    ].join('\n');
    submitProposal({ type: 'club-correction', title: title, body: body, statusId: 'proposalStatus', btn: btn });
    return;
  }

  var reason = ((document.getElementById('pReason') || {}).value || '').trim();
  if (reason.length < 8) {
    setNote('proposalStatus', 'Please add a reason (a sentence is enough).', 'error');
    return;
  }
  var dTitle = 'Club removal: ' + (c.name || c.id);
  var dBody = [
    '### Request to remove this club listing',
    '',
    '**Type:** club-delete',
    '',
    '#### Listing',
    clubSnapshot(c),
    '',
    '#### Reason',
    reason,
    '',
    '_Submitted via Pace Kit Run Club Finder_'
  ].join('\n');
  submitProposal({ type: 'club-delete', title: dTitle, body: dBody, statusId: 'proposalStatus', btn: btn });
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

document.getElementById('btnSuggestUpdate').addEventListener('click', function () { showProposal('edit'); });
document.getElementById('btnReportIssue').addEventListener('click', function () { showProposal('delete'); });
document.getElementById('btnSendProposal').addEventListener('click', sendActiveProposal);

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeClubModal();
    hidePlaceSuggest();
  }
});

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

document.getElementById('btnSubmitSuggest').addEventListener('click', function () {
  var payload = buildSuggestionPayload();
  if (!payload) return;
  var btn = document.getElementById('btnSubmitSuggest');
  submitProposal({
    type: 'club-suggestion',
    title: payload.title,
    body: payload.body,
    replyTo: payload.replyTo,
    statusId: 'suggestStatus',
    btn: btn
  }).then(function (ok) {
    if (!ok) return;
    document.getElementById('sName').value = '';
    document.getElementById('sWebsite').value = '';
    document.getElementById('sDays').value = '';
    document.getElementById('sNotes').value = '';
    document.getElementById('sReplyTo').value = '';
  });
});

loadClubs().then(function () { return searchClubs(); }).catch(function (err) { setStatus(err.message, true); });
