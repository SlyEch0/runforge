# Pace Kit (runforge)

Self-contained running & training tools at [pacekit.net](https://pacekit.net).

- **[Heat Run Advisor](./heat-run-advisor/)** — Heat Index, WBGT, UV, pace & fuel
- **[Race Finder](./race-finder/)** — upcoming races near a ZIP
- **[Run Club Finder](./run-club-finder/)** — curated clubs; anyone can propose add / edit / remove

Each tool is a static page. Cloudflare Pages deploys on every push to `main`.

## Club proposals

The directory is curated on purpose. Visitors submit add / edit / removal
requests from the site. Those land as GitHub issues (labels `club-suggestion`,
`club-correction`, `club-delete`). Nothing goes live until you merge it into
`run-club-finder/clubs.json`.

Set this Cloudflare Pages environment variable so the in-page form can file
issues without a GitHub login:

| Name | Value |
|---|---|
| `GITHUB_TOKEN` | Fine-grained PAT on `SlyEch0/runforge` with **Issues: Read and write**. Or a classic PAT with `public_repo`. |

Without the token, the form falls back to `mailto:hello@pacekit.net`.

## Email: hello@pacekit.net

The site never publishes a personal inbox. Public address is **hello@pacekit.net**.

Turn on **Cloudflare Email Routing** (free) so that address actually delivers:

1. Cloudflare Dashboard → **pacekit.net** → **Email** → **Email Routing**
2. Enable Email Routing (Cloudflare adds the MX records)
3. Add a destination: your real inbox (Gmail / SBC / etc.) and verify it
4. Create address `hello@pacekit.net` → forward to that destination

Optional aliases: `clubs@pacekit.net` → same destination.

Until routing is on, `hello@pacekit.net` will bounce. The contact form still
works if `GITHUB_TOKEN` is set (messages become GitHub issues).

## Favicon

`favicon.svg` plus `favicon-32.png` / `apple-touch-icon.png` / `icon-192.png`.
Linked from every HTML page.

## Deploy

Cloudflare Pages, connected to this repo:

1. Build command: empty (static)
2. Output directory: `/`
3. Functions in `functions/` are picked up automatically (Race Finder proxy, `/api/suggest`)
