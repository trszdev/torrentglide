# <img src="range-torrent-extension/assets/icon.svg" alt="" width="40" height="40" align="center"> TorrentGlide

<p align="center">
  <a href="https://chromewebstore.google.com/detail/torrentglide/ankgbfpkdlajgojmgijifehjbkfekhpb"><img src="https://img.shields.io/chrome-web-store/v/ankgbfpkdlajgojmgijifehjbkfekhpb?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white&color=4285F4" alt="Chrome Web Store"></a>
  <a href="https://addons.mozilla.org/firefox/addon/torrentglide/"><img src="https://img.shields.io/amo/v/torrentglide?label=Firefox%20Add-ons&logo=firefoxbrowser&logoColor=white&color=FF7139" alt="Firefox Add-ons"></a>
  <a href="https://torrentglide.github.io/"><img src="https://img.shields.io/badge/website-torrentglide.github.io-2ea44f" alt="Website"></a>
</p>

<p align="center">
  <a href="docs/demo.mp4"><img src="docs/demo.gif" alt="TorrentGlide: click a magnet link, watch it while it downloads" width="800"></a><br>
  <sub>Footage: <a href="https://peach.blender.org">Big Buck Bunny</a> © Blender Foundation, CC BY 3.0</sub>
</p>

A browser extension that catches magnet links and links to `.torrent` files and
offers to open them in its own page instead. The page is
[range-player](range-player/): it plays the torrent's file while it downloads,
streamed by the [rqbit](https://github.com/ikatson/rqbit) client running on
this computer. Built with [WXT](https://wxt.dev).

```
┌──────────────────────┐        ┌──────────────────┐         ┌────────────────────┐
│ content script       │ open ─▶│ background       │ new tab │ player.html        │
│  catches the click,  │        │  storage.session │ ─────▶  │  header            │  HTTP API
│  asks (the card),    │ ◀─ menu│  + tabs.create   │ ?open=id│  rqbit status      │──────────▶ rqbit :3030
│  fetches the .torrent│        │  context menu    │         │  range-player      │──▶ stream/{file}
└──────────────────────┘        └──────────────────┘         │   <movi-player>    │
                                                              └────────────────────┘
```

## What's in this repo

- **[range-torrent-extension](range-torrent-extension/)** — TorrentGlide, the
  extension (Chrome, Edge, Firefox). Catches the clicks, shows the card, opens
  the page.
- **[range-player](range-player/)** — the page the extension opens. Plays the
  file in the browser with [movi-player](https://moviplayer.com), streamed by
  rqbit.

## Running it

You need [Bun](https://bun.sh) and a running rqbit server (9.x), started by
hand (`rqbit server start ~/Downloads`).

```bash
bun install
bun run dev              # range-player dev server; load .output/chrome-mv3-dev once
bun run build            # .output/chrome-mv3
bun run build:firefox    # .output/firefox-mv3
bun run test             # unit tests for both projects
bun run typecheck        # tsc --noEmit
```

Load the output folder as an unpacked extension: `chrome://extensions` →
Developer mode → Load unpacked (Chrome, Edge, Brave), or
`about:debugging#/runtime/this-firefox` → Load Temporary Add-on → its
`manifest.json` (Firefox).

See [range-torrent-extension/README.md](range-torrent-extension/README.md) for
the full picture: what it catches, how it talks to rqbit, and how the page
works.
