# Memex for Obsidian

This repository is the public mirror, release, and submission repository for the Memex Obsidian plugin.

The plugin is built in the Memex monorepo and synced here automatically from `WorldBrain/memex-v2` whenever `master` is updated. This repo keeps the Obsidian-facing files, the installable plugin bundle, and a source snapshot in one public place:

- `README.md`
- `LICENSE`
- `manifest.json`
- `versions.json`
- `styles.css`
- `plugin/memex/`
- `source-snapshot/`

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

## Install From This Repo

If you want to install the plugin directly from the repository without waiting for a GitHub release, copy these tracked files into your vault at `.obsidian/plugins/memex/`:

- `plugin/memex/main.js`
- `plugin/memex/manifest.json`
- `plugin/memex/styles.css`

The same three files are also uploaded to the matching GitHub release tag.

## Source Snapshot

This repo mirrors two kinds of source:

- `source-snapshot/` contains the Obsidian entrypoints and plugin-specific source files copied from `memex-v2`
- `plugin/memex/main.js.map` contains the full bundled source map for the published plugin bundle

The canonical editable implementation still lives in the Memex monorepo:

[WorldBrain/memex-v2](https://github.com/WorldBrain/memex-v2)

## Release Flow

This repo follows the release steps from Obsidian's submission guide:

1. Update the Obsidian plugin source in `WorldBrain/memex-v2`.
2. Merge to `master`.
3. The `Obsidian Plugin Release` workflow in `memex-v2` will:
   - sync the public repo metadata and docs
   - sync `plugin/memex/`
   - sync `source-snapshot/`
   - update the matching GitHub release tag and assets

If you need to run the sync manually, use:

`node scripts/sync-public-files.mjs /absolute/path/to/memex-v2-monorepo`

To refresh the GitHub release asset staging folder locally, use:

`node scripts/export-release-artifacts.mjs /absolute/path/to/memex-v2-monorepo`

The release assets are always:

- `main.js`
- `manifest.json`
- `styles.css`

The release tag must exactly match `manifest.json`'s `version`.

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
- The source mirrored in this repo is generated from the public Memex monorepo.
