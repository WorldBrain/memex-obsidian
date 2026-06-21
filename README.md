# Memex for Obsidian

Memex brings your Memex library into Obsidian Desktop.

Use it to search your saved web pages, notes, highlights, PDFs, videos, images, and other Memex content without leaving your vault. You can also ask questions across your Memex account and drag supported results into Obsidian notes as Memex result cards.

## Install From Obsidian

1. Open Obsidian.
2. Go to `Settings` > `Community plugins`.
3. Turn off Restricted mode if needed.
4. Click `Browse`.
5. Search for `Memex`.
6. Install the plugin.
7. Enable `Memex`.

## Install Manually

1. Download the plugin zip: [memex-obsidian.zip](https://github.com/WorldBrain/memex-obsidian/raw/main/memex-obsidian.zip)
2. Unzip it.
3. Open your Obsidian vault folder.
4. Create this folder if it does not exist yet:

    `.obsidian/plugins/memex/`

5. Move the unzipped plugin files into that folder so `manifest.json` sits directly inside:

    `.obsidian/plugins/memex/manifest.json`

6. Restart Obsidian.
7. Go to `Settings` > `Community plugins`.
8. Enable `Memex`.

## Set Up

1. Open `Settings` > `Memex`.
2. Click `Login`.
3. Sign in with your Memex account in the browser.
4. Return to Obsidian.
5. Run the `Toggle Memex Sidebar` command to open Memex inside your vault.

If the browser login does not return to Obsidian automatically, use `Paste Callback URL` in the Memex plugin settings and paste the full `obsidian://memex-auth?...` URL from your browser.

## Pull Imports

Pull imports are disabled by default. Open `Settings` > `Memex`, enable `Pull imports`, choose a poll interval, and configure import rules.

Each rule selects one or more Memex content types and one Obsidian destination folder. Rules are evaluated independently, so overlapping rules create one note per matching rule. The plugin imports only new authenticated-library items that have finished indexing.

Imported notes include a hidden `<!-- memex-content-id: ... -->` marker. Annotation imports use that marker to find the parent content note and append under `## Annotations` when the parent is already in the vault. If the parent note is not found, the annotation is imported as a standalone note in the matching rule's destination folder.

Templates are stored in your vault under `Memex Plugin/Templates` as editable Markdown files. Missing default templates are restored on startup without overwriting your edits. The settings screen links to the placeholder reference in the Memex docs.

## Support

Need help? Visit [help.memex.garden](https://help.memex.garden).
