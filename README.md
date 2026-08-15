# RunForge

Self-contained running & training tools.

Currently includes:

- **[Heat Run Advisor](./heat-run-advisor/)** — Location-aware Heat Index + WBGT + UV + recommended pace calculator for outdoor running.

Designed for easy expansion. Each tool lives in its own folder and is a single self-contained HTML file.

## Deploy

This repo is ready for **Cloudflare Pages**:

1. Connect the GitHub repo in Cloudflare Pages
2. Build settings: leave empty (static site, no build command)
3. Output directory: `/` (root)

Every push to `main` will automatically deploy.

## Adding a new tool

1. Create a new folder, e.g. `my-new-tool/`
2. Put an `index.html` inside it
3. Link it from the root `index.html` hub page

## License

Personal / open use. Attribution appreciated but not required.
