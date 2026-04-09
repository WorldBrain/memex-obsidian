# Memex for Obsidian

This repository is the public release and submission repository for the Memex Obsidian plugin.

The plugin implementation currently ships from the Memex monorepo, and this repo keeps the Obsidian-facing files required for submission and releases:

- `README.md`
- `LICENSE`
- `manifest.json`
- `versions.json`
- `styles.css`

This repo intentionally does not commit `main.js`. Obsidian's release guidance expects `main.js` to be attached to GitHub releases, not stored in the repository history.

## What the plugin does

Memex adds a sidebar and inline search blocks to Obsidian so you can search and ask questions against your Memex account from inside your vault.

The current manifest metadata is:

- Plugin ID: `memex`
- Display name: `Memex`
- Minimum Obsidian version: `1.7.2`
- Desktop only: `true`

## Release Flow

This repo follows the release steps from Obsidian's submission guide:

1. Update `manifest.json` with the next semantic version.
2. Update `versions.json` so the plugin version maps to the minimum supported Obsidian version.
3. Build the plugin in the Memex monorepo:
   `npm run build:obsidian:plugin:prod`
4. Export release assets into this repo:
   `node scripts/export-release-artifacts.mjs /absolute/path/to/memex-v2-monorepo`
5. Create a GitHub release whose tag exactly matches `manifest.json`'s `version`.
6. Upload these three release assets:
   - `main.js`
   - `manifest.json`
   - `styles.css`

You can also refresh the public repo files directly from the monorepo source with:

`node scripts/sync-public-files.mjs /absolute/path/to/memex-v2-monorepo`

## Required Public Env Vars

The Obsidian plugin build uses these client-visible Vite env vars:

- `VITE_OBSIDIAN_SIDEBAR_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_FUNCTIONS_URL`

An example file is included at `.env.example`.

## Disclosures

The Obsidian submission checklist expects relevant disclosures in the README. Current disclosures for this plugin:

- A Memex account is required to log in and use hosted search or ask features.
- The plugin makes network requests to the Memex hosted app, Memex backend functions, and Supabase endpoints configured through the public env vars above.
- The plugin stores authentication/session data locally through the Obsidian runtime and Supabase client session storage.
- The plugin is desktop-only.
- The current production bundle includes Sentry error-reporting code from the shared Memex runtime. If that remains enabled for release builds, add a public privacy policy link before submission. Obsidian's checklist may still flag client-side telemetry.
- The plugin does not include ads.

## Source of Truth

The active implementation currently lives in the Memex monorepo:

[WorldBrain/memex-v2](https://github.com/WorldBrain/memex-v2)

This release repo is meant to satisfy Obsidian's repository and release expectations while the plugin code is still built from the monorepo.
