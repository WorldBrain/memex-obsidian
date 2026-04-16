# Memex for Obsidian

This repository is the standalone source-of-truth for the Memex Obsidian plugin.

It contains the plugin source, build scripts, release scripts, and the public runtime configuration needed to build the plugin without relying on another repo.

The repo intentionally does not commit `main.js` at the root. Obsidian expects `main.js` to be attached to GitHub releases instead of being stored in git history.

## What the plugin does

Memex adds a sidebar and inline result cards to Obsidian so you can search, cite, and chat with your Memex account from inside your vault.

## Install

### Community install

Once the plugin is accepted into the Obsidian community directory, install `Memex` from Obsidian's Community Plugins browser.

### Manual install

1. Use the tracked `plugin/memex/` folder in this repo, or download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Create `VAULT/.obsidian/plugins/memex/`.
3. Copy the three plugin files into that folder.
4. Reload Obsidian and enable the plugin.

## Use

1. Open the Memex plugin settings in Obsidian.
2. Click `Login with Memex`.
3. If the redirect does not complete automatically, click `Paste Callback URL` and paste the full `obsidian://memex-auth?...` callback URL from your browser.
4. Run `Toggle Memex Sidebar` to open the hosted Memex sidebar inside Obsidian.
5. Drag supported Memex results into notes to insert `memex-card` blocks.

## Build

This plugin is buildable directly from this repo.

```bash
npm install
npm run build
```

That writes the bundled plugin entrypoint to `dist/main.js` and also syncs a ready-to-drop plugin folder at `plugin/memex/`.

The only public build-time env var is:

- `MEMEX_BASE_URL`

The default production value is:

```bash
MEMEX_BASE_URL=https://memex.garden
```

You can override it locally by copying `.env.example` to `.env` and changing the value.

## Local release prep

```bash
npm run release:prepare
```

That writes release-ready artifacts to `dist/release/<version>/`:

- `main.js`
- `manifest.json`
- `styles.css`

## Validation

```bash
npm run validate
```

This checks the required public files, manifest/version consistency, and `.env.example`.
It also checks that `plugin/memex/` contains the built plugin files that match the tracked manifest and styles.

## Manifest metadata

- Plugin ID: `memex`
- Display name: `Memex`
- Minimum Obsidian version: `1.7.2`
- Desktop only: `true`

## Disclosures

- A Memex account is required to use the hosted search and chat features.
- The plugin embeds the hosted Memex web app inside an Obsidian sidebar.
- The plugin opens the hosted Memex auth flow in your browser and stores the returned access and refresh tokens in Obsidian plugin data on your machine.
- The plugin can insert Memex result card code blocks into notes when you explicitly drag a result into the editor.
- The plugin is desktop-only.
- The released plugin bundle does not include client-side telemetry.
- The plugin does not include ads.

## Source availability

This repo is the public source for the plugin implementation and release process.
