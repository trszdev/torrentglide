/**
 * Incognito (SPEC §11, ARCHITECTURE §3.3): a torrent added from an
 * incognito window is hidden from normal ones and masked in incognito, and
 * deleted with its files only once no incognito window is left: not on a
 * reload, not when the player tab closes, not by a check while the window
 * is open. Chrome's normal copy finds that out by its 30 s alarm.
 *
 * The torrent is made for the test: a copy of the h264 sample under its own
 * name (so its own info hash), made into a torrent by rqbit, its .torrent
 * kept, then forgotten, so the incognito window adds it anew.
 */

import { expect, test } from '@playwright/test'
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { allowIncognito, H264, launch, otherContextPage, rqbit, RQBIT, until, type Extension } from './extension.ts'

const NAME = 'e2e-incognito.mp4'

let extension: Extension
let hash = ''
let base64 = ''
let folder = ''

test.beforeEach(async () => {
  const sample = await rqbit.details(H264)
  folder = mkdtempSync(join(tmpdir(), 'torrentglide-e2e-incognito-'))
  copyFileSync(join(sample.output_folder, sample.files[0]!.name), join(folder, NAME))
  hash = await rqbit.create(join(folder, NAME))
  base64 = Buffer.from(await rqbit.metadata(hash)).toString('base64')
  await rqbit.forget(hash)
  extension = await allowIncognito(await launch())
})

test.afterEach(async () => {
  await extension.context.close()
  if (await rqbit.has(hash)) await rqbit.forget(hash)
  rmSync(folder, { recursive: true, force: true })
})

test('added in incognito: hidden in normal windows, masked in incognito, deleted once no incognito window is left', async () => {
  test.setTimeout(150_000)
  // The incognito window: the player for the .torrent, and a blank tab that keeps the window open.
  await extension.background(`
    await chrome.storage.session.set({ 'open:e2e-incognito': { kind: 'torrent-file', base64: '${base64}', fileName: 'e2e.torrent' } })
    await chrome.windows.create({ incognito: true, url: [chrome.runtime.getURL('/player.html?open=e2e-incognito'), 'about:blank'] })
  `)
  const marked = () => extension.background<boolean>(`return 'incognito:${hash}' in (await chrome.storage.local.get(null))`)
  expect(await until(marked), 'the torrent is recorded as incognito').toBe(true)
  expect(await rqbit.has(hash)).toBe(true)
  // Its files go to a folder of rqbit's own (SPEC §11.2).
  expect((await rqbit.details(hash)).output_folder.endsWith('.torrentglide-incognito')).toBe(true)

  // A normal window: not in History, no mask.
  const page = await extension.context.newPage()
  await page.goto(extension.playerUrl)
  await expect(page.locator('#rqbit-status')).toHaveAttribute('data-state', 'running')
  await expect(page.locator('.history-name', { hasText: 'h264-10s' })).toBeVisible()
  await expect(page.locator('.history-name', { hasText: NAME })).toHaveCount(0)
  await expect(page.locator('.ext-mask')).toHaveCount(0)
  // Bookmarks are shared: its hash opens nothing here, and goes.
  await page.goto(`${extension.playerUrl}#${hash}`)
  await expect(page).toHaveURL(extension.playerUrl)
  await expect(page.locator('movi-player')).toHaveCount(0)

  // The incognito window: in History with the mask, and the mask in the header.
  const incognito = await otherContextPage(page, (url) => url.includes('/player.html'))
  expect(incognito, 'the incognito player page').not.toBeNull()
  const seen = () =>
    incognito!.evaluate<{ inIncognito: boolean; header: boolean; row: boolean; masked: boolean }>(`({
      inIncognito: chrome.extension.inIncognitoContext,
      header: !!document.querySelector('.ext-mask'),
      row: [...document.querySelectorAll('.history-name')].some((name) => name.textContent === ${JSON.stringify(NAME)}),
      masked: !![...document.querySelectorAll('.history-row')].find((row) => row.textContent.includes(${JSON.stringify(NAME)}))?.querySelector('.history-mask'),
    })`)
  expect(await until(async () => (await seen()).masked)).toBe(true)
  expect(await seen()).toEqual({ inIncognito: true, header: true, row: true, masked: true })

  // A reload closes no tab: the torrent stays.
  await incognito!.reload()
  await page.waitForTimeout(3000)
  expect(await rqbit.has(hash)).toBe(true)
  expect(await marked()).toBe(true)

  // The checks run every 30 s while there is an incognito torrent.
  expect(await extension.background(`return (await chrome.alarms.get('incognitoCheck'))?.periodInMinutes`)).toBe(0.5)

  // The player tab closes, the window stays with its blank tab: a check comes and goes, the torrent stays.
  const ping = () => extension.background<string | undefined>(`return (await chrome.storage.local.get('incognitoPing')).incognitoPing`)
  const before = await ping()
  await incognito!.close()
  expect(await until(async () => (await ping()) !== before, 40_000), 'a check ran').toBe(true)
  await page.waitForTimeout(1000)
  expect(await rqbit.has(hash)).toBe(true)
  expect(await marked()).toBe(true)

  // The last incognito window closes: deleted by the next check, record and all.
  const blank = await otherContextPage(page, (url) => url === 'about:blank')
  expect(blank, 'the blank incognito tab').not.toBeNull()
  await blank!.close()
  expect(await until(async () => !(await rqbit.has(hash)), 50_000), 'rqbit deleted the torrent').toBe(true)
  expect(await until(async () => !(await marked()))).toBe(true)
  expect(await extension.background(`return (await chrome.alarms.get('incognitoCheck')) ?? null`), 'no alarm left').toBeNull()
})

test('added elsewhere: the incognito folder is the whole sign of it, with no record at all', async () => {
  test.setTimeout(120_000)
  // rqbit itself knows where it put it, as when another browser's incognito window or a lost
  // `storage.local` added it: no `incognito:` key anywhere (SPEC §11.2).
  await fetch(`${RQBIT}/torrents?overwrite=true&sub_folder=.torrentglide-incognito`, {
    method: 'POST',
    body: Buffer.from(base64, 'base64'),
    headers: { 'content-type': 'application/x-bittorrent' },
  })
  expect((await rqbit.details(hash)).output_folder.endsWith('.torrentglide-incognito')).toBe(true)
  const records = () => extension.background<string[]>(`return Object.keys(await chrome.storage.local.get(null)).filter((key) => key.startsWith('incognito'))`)
  expect(await records()).toEqual([])

  // A normal window: no row, and its hash opens nothing.
  const page = await extension.context.newPage()
  await page.goto(extension.playerUrl)
  await expect(page.locator('#rqbit-status')).toHaveAttribute('data-state', 'running')
  await expect(page.locator('.history-name', { hasText: NAME })).toHaveCount(0)
  await page.goto(`${extension.playerUrl}#${hash}`)
  await expect(page).toHaveURL(extension.playerUrl)
  await expect(page.locator('movi-player')).toHaveCount(0)

  // An incognito window: there, with the mask.
  await extension.background(`await chrome.windows.create({ incognito: true, url: chrome.runtime.getURL('/player.html') })`)
  // The incognito copy of the extension loads its page in that window: a moment.
  let incognito: Awaited<ReturnType<typeof otherContextPage>> = null
  for (let end = Date.now() + 20_000; !incognito && Date.now() < end; ) {
    incognito = await otherContextPage(page, (url) => url.includes('/player.html'))
    if (!incognito) await page.waitForTimeout(250)
  }
  expect(incognito, 'the incognito player page').not.toBeNull()
  const seen = () =>
    incognito!.evaluate<{ header: boolean; masked: boolean }>(`({
      header: !!document.querySelector('.ext-mask'),
      masked: !![...document.querySelectorAll('.history-row')].find((row) => row.textContent.includes(${JSON.stringify(NAME)}))?.querySelector('.history-mask'),
    })`)
  expect(await until(async () => (await seen()).masked)).toBe(true)
  expect(await seen()).toEqual({ header: true, masked: true })

  // No record, so its closing deletes nothing.
  await incognito!.close()
  await page.waitForTimeout(3000)
  expect(await rqbit.has(hash)).toBe(true)
  expect(await records()).toEqual([])
})

test('removed from History in incognito: nothing to answer, its files go too', async () => {
  test.setTimeout(120_000)
  await fetch(`${RQBIT}/torrents?overwrite=true&sub_folder=.torrentglide-incognito`, {
    method: 'POST',
    body: Buffer.from(base64, 'base64'),
    headers: { 'content-type': 'application/x-bittorrent' },
  })
  // A file where rqbit writes it: a forget would leave it on disk, a delete doesn't (SPEC §11.2).
  const file = join((await rqbit.details(hash)).output_folder, NAME)
  writeFileSync(file, 'x')

  const page = await extension.context.newPage()
  await page.goto(extension.playerUrl)
  await expect(page.locator('#rqbit-status')).toHaveAttribute('data-state', 'running')
  await extension.background(`await chrome.windows.create({ incognito: true, url: chrome.runtime.getURL('/player.html') })`)
  let incognito: Awaited<ReturnType<typeof otherContextPage>> = null
  for (let end = Date.now() + 20_000; !incognito && Date.now() < end; ) {
    incognito = await otherContextPage(page, (url) => url.includes('/player.html'))
    if (!incognito) await page.waitForTimeout(250)
  }
  expect(incognito, 'the incognito player page').not.toBeNull()
  const row = `[...document.querySelectorAll('.history-row')].find((row) => row.textContent.includes(${JSON.stringify(NAME)}))`
  expect(await until(async () => (await incognito!.evaluate<boolean>(`!!${row}`)) === true)).toBe(true)

  // The × of the row, not a dialog: the torrent leaves rqbit with its file.
  await incognito!.evaluate(`${row}.querySelector('.history-remove').click()`)
  expect(await incognito!.evaluate<boolean>(`document.getElementById('remove-title') !== null`)).toBe(false)
  expect(await until(async () => !(await rqbit.has(hash))), 'gone from rqbit').toBe(true)
  expect(await until(async () => !existsSync(file)), 'its file deleted').toBe(true)
})
