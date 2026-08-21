/** Accept club add/edit/delete proposals and contact messages.
 *  Creates a GitHub issue. Set GITHUB_TOKEN in Cloudflare Pages (contents: none,
 *  issues: write on SlyEch0/runforge). Never exposes a personal inbox. */
const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const ALLOWED_TYPES = {
  'club-suggestion': 'club-suggestion',
  'club-correction': 'club-correction',
  'club-issue': 'club-issue',
  'club-delete': 'club-delete',
  contact: 'contact'
};

const hits = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 6;

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400);
  }

  // Honeypot — bots that fill it get a fake success
  if (body.hp) return json({ ok: true });

  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'unknown';
  if (tooMany(ip)) return json({ ok: false, error: 'rate_limited' }, 429);

  const token = env.GITHUB_TOKEN;
  if (!token) {
    return json({ ok: false, error: 'not_configured' }, 503);
  }

  const type = ALLOWED_TYPES[body.type] || 'club-suggestion';
  const title = String(body.title || 'Club suggestion').slice(0, 180).trim();
  const text = String(body.body || '').slice(0, 8000).trim();
  const replyTo = String(body.replyTo || '').slice(0, 120).trim();
  if (!title || text.length < 8) {
    return json({ ok: false, error: 'missing_fields' }, 400);
  }

  let issueBody = text + '\n\n_Submitted via pacekit.net (no public personal email)_';
  if (replyTo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
    issueBody += '\n_Reply-to (visitor):_ ' + replyTo;
  }

  const payload = {
    title: title,
    body: issueBody,
    labels: [type]
  };

  let gh = await openIssue(token, payload);
  if (!gh.ok && gh.status === 422) {
    delete payload.labels;
    gh = await openIssue(token, payload);
  }

  const data = await gh.json().catch(() => ({}));
  if (!gh.ok) {
    return json({ ok: false, error: 'github_' + gh.status, detail: data.message || null }, 502);
  }

  bump(ip);
  return json({ ok: true, url: data.html_url || null, number: data.number || null });
}

function tooMany(ip) {
  const now = Date.now();
  const row = hits.get(ip);
  if (!row) return false;
  row.times = row.times.filter((t) => now - t < WINDOW_MS);
  return row.times.length >= MAX_PER_WINDOW;
}

function bump(ip) {
  const now = Date.now();
  const row = hits.get(ip) || { times: [] };
  row.times = row.times.filter((t) => now - t < WINDOW_MS);
  row.times.push(now);
  hits.set(ip, row);
}

function openIssue(token, payload) {
  return fetch('https://api.github.com/repos/SlyEch0/runforge/issues', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'PaceKit-Suggest/1.0',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: CORS });
}
