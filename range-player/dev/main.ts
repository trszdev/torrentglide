/**
 * range-player's minimal dev host: a field to open a torrent, a .torrent
 * picker and drop, rqbit's status, the player, and `#<hash>/<idx>` kept in
 * step with what plays. rqbit is reached through the dev server's /rqbit
 * proxy (scripts/serve.ts), which also serves movi.wasm. `?debug` turns on
 * movi's logs.
 *
 * Its own text is English only: it is a developer's page, not a product.
 */

import { createRangePlayer } from '../src/index.ts'
import { RqbitClient } from '../src/core/rqbit.ts'
import { resolveLanguage } from '../src/core/i18n.ts'
import { formatRoute, parseRoute } from '../src/core/route.ts'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const client = new RqbitClient('/rqbit')
const player = createRangePlayer($('player'), {
  client,
  wasmUrl: '/movi.wasm',
  language: resolveLanguage(navigator.languages),
  debug: new URLSearchParams(location.search).has('debug'),
  emptyText: { title: 'Paste a magnet link, an info hash or a .torrent URL above.', hint: 'Or drop a .torrent file on the page.' },
})

$<HTMLFormElement>('open').addEventListener('submit', (event) => {
  event.preventDefault()
  player.openText($<HTMLInputElement>('input').value)
})
$<HTMLInputElement>('file').addEventListener('change', async (event) => {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  if (file) player.openTorrentFile(new Uint8Array(await file.arrayBuffer()), file.name)
  input.value = ''
})
$('close').addEventListener('click', () => player.close())

window.addEventListener('dragover', (event) => event.preventDefault())
window.addEventListener('drop', async (event) => {
  event.preventDefault()
  const file = event.dataTransfer?.files[0]
  if (file) player.openTorrentFile(new Uint8Array(await file.arrayBuffer()), file.name)
  else {
    const text = event.dataTransfer?.getData('text/uri-list') || event.dataTransfer?.getData('text/plain')
    if (text) player.openText(text)
  }
})

// The hash names a torrent rqbit has; one it doesn't have yet can't be reopened from it.
const managed = new Set<string>()
player.addEventListener('opened', ({ detail }) => {
  if (detail.managed) managed.add(detail.infoHash)
})
player.addEventListener('added', ({ detail }) => managed.add(detail.infoHash))
player.addEventListener('current', ({ detail }) => {
  const hash = detail && managed.has(detail.infoHash) ? formatRoute(detail) : ''
  // replaceState fires no hashchange, so this never loops.
  history.replaceState(null, '', `${location.pathname}${location.search}${hash}`)
})

function openFromHash(): void {
  const route = parseRoute(location.hash)
  if (!route) return
  const { current } = player
  if (current?.infoHash === route.infoHash && (route.fileIndex === null || current.fileIndex === route.fileIndex)) return
  player.openManaged(route.infoHash, route.fileIndex ?? undefined)
}
window.addEventListener('hashchange', openFromHash)
openFromHash()

async function checkRqbit(): Promise<void> {
  const status = $('rqbit-status')
  try {
    const info = await client.serverInfo()
    status.dataset.state = 'connected'
    status.textContent = `rqbit ${info.version}`
  } catch (err) {
    status.dataset.state = 'error'
    status.textContent = err instanceof Error ? err.message : String(err)
  }
}
void checkRqbit()
setInterval(() => {
  if (document.visibilityState === 'visible') void checkRqbit()
}, 5000)
