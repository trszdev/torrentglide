import preact from '@preact/preset-vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'wxt'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  // Explicit imports (`wxt/browser`, `wxt/utils/...`), like the rest of the repo.
  imports: false,
  manifestVersion: 3,
  // The sources zip (`zip:firefox`, for addons.mozilla.org's review) has to
  // build on its own, so it starts at the repo root and takes what the build
  // reads: the workspace root, this project, range-player (a workspace
  // package), and the installers with the scripts that build their packages.
  // This project's README says how to build from it.
  zip: {
    sourcesRoot: repoRoot,
    includeSources: [
      'README.md',
      'package.json',
      'bun.lock',
      'tsconfig.base.json',
      'range-torrent-extension/**',
      'range-player/**',
    ],
    excludeSources: ['range-torrent-extension/store/**', '**/node_modules/**'],
  },
  manifest: ({ browser }) => ({
    name: 'TorrentGlide',
    description: 'Plays torrents and magnet links while they download, through the torrent service running on this computer.',
    // `scripting`: pages open when the extension is installed or updated get the content script.
    permissions: ['storage', 'contextMenus', 'scripting'],
    // Every http(s) page: the content script runs on them anyway (the same
    // install warning), and the background puts it in pages already open.
    // It also covers rqbit's HTTP API, wherever it is: extension pages may
    // call hosts they have permission for across origins, which rqbit's CORS
    // layer wouldn't otherwise allow.
    host_permissions: ['http://*/*', 'https://*/*'],
    action: { default_title: 'Open TorrentGlide' },
    // movi-player compiles its FFmpeg WASM; MV3's default CSP doesn't allow that.
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';" },
    // Same id as the published Chrome Web Store extension, so "Leave review"
    // (4–5 stars, which opens the store) points at that listing even from an
    // unpacked dev build: without it, Chrome gives the extension a random id
    // and the store says the product is unavailable. Firefox keeps its gecko id.
    ...(browser === 'chrome' ? { id: 'ankgbfpkdlajgojmgijifehjbkfekhpb' } : {}),
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: '@rangeglide', data_collection_permissions: { required: ['none'] } },
          },
        }
      : {
          // Cross-origin isolation, as range-player's dev server sends it: movi
          // then streams over HTTP through a SharedArrayBuffer, without copies.
          // Firefox has no manifest keys for it; movi works without.
          cross_origin_embedder_policy: { value: 'require-corp' },
          cross_origin_opener_policy: { value: 'same-origin' },
        }),
  }),
  vite: () => ({
    plugins: [preact()],
    server: {
      // range-player is a workspace package: its sources live outside this project.
      fs: { allow: [repoRoot] },
    },
    build: {
      // The player page's chunk is mostly movi-player (3.6 MB).
      chunkSizeWarningLimit: 4096,
      rolldownOptions: {
        onLog(level, log, handler) {
          // movi's bundle guards a CommonJS export with `typeof exports`; harmless in ESM.
          if (log.code === 'COMMONJS_VARIABLE_IN_ESM' && log.id?.includes('movi-player')) return
          handler(level, log)
        },
      },
    },
  }),
})
