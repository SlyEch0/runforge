/** Proxy RunSignUp Get Races — same-origin for Pace Kit (avoids CORS). */
export async function onRequestGet(context) {
  const incoming = new URL(context.request.url);
  const target = new URL('https://api.runsignup.com/rest/races');
  incoming.searchParams.forEach((v, k) => target.searchParams.set(k, v));
  if (!target.searchParams.has('format')) target.searchParams.set('format', 'json');

  try {
    const res = await fetch(target.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'PaceKit/1.0 (https://pacekit.net)' }
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
        'Cache-Control': 'public, max-age=180',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err), races: [] }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
