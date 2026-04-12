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

## How to use it

1. Install the plugin and open the Memex plugin settings in Obsidian.
2. Click `Login` to sign in to your Memex account in your browser.
3. Run the `Toggle Memex Sidebar` command to open the sidebar.
4. Search your Memex content, open notes from results, and drag supported results into notes as Memex result card blocks.

If the OAuth redirect does not complete automatically on your machine, use `Paste Callback URL` in the plugin settings and paste the full `obsidian://memex-auth?...` callback URL from your browser.

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
- The plugin stores authentication and session data locally through the Obsidian runtime and Supabase client session storage.
- The plugin can insert Memex result card code blocks into notes when you explicitly drag a result into the editor.
- The plugin is desktop-only.
- The released Obsidian plugin bundle does not include client-side telemetry.
- The plugin does not include ads.
- The plugin source code is public in the Memex monorepo linked below.

## Source of Truth

The active implementation currently lives in the Memex monorepo:

[WorldBrain/memex-v2](https://github.com/WorldBrain/memex-v2)

This release repo is meant to satisfy Obsidian's repository and release expectations while the plugin code is still built from the monorepo.
