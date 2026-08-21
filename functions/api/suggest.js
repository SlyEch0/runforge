/** Accept club add/edit/delete proposals and open a GitHub issue.
 *  Set GITHUB_TOKEN in Cloudflare Pages environment (repo scope: public_repo or issues:write).
 *  Never exposes a personal inbox. */
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
  'club-delete': 'club-delete'
};

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

  const token = env.GITHUB_TOKEN;
  if (!token) {
    return json({ ok: false, error: 'not_configured' }, 503);
  }

  const type = ALLOWED_TYPES[body.type] || 'club-suggestion';
  const title = String(body.title || 'Club suggestion').slice(0, 180);
  const text = String(body.body || '').slice(0, 8000);
  if (!title.trim() || !text.trim()) {
    return json({ ok: false, error: 'missing_fields' }, 400);
  }

  const gh = await fetch('https://api.github.com/repos/SlyEch0/runforge/issues', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'PaceKit-Suggest/1.0',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: title,
      body: text + '\n\n_Submitted via pacekit.net (no public email)_',
      labels: [type]
    })
  });

  const data = await gh.json().catch(() => ({}));
  if (!gh.ok) {
    return json({ ok: false, error: 'github_' + gh.status, detail: data.message || null }, 502);
  }

  return json({ ok: true, url: data.html_url || null, number: data.number || null });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: CORS });
}
