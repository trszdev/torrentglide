/**
 * `player.html?open=<id>` (SPEC §3, §10.1): the request waits in
 * storage.session, the page takes it once, and `?open=` leaves the URL.
 */

import { expect, test } from '@playwright/test'
import { H264, launch, rqbit, SEASON, type Extension } from './extension.ts'

let extension: Extension

test.beforeEach(async () => {
  extension = await launch()
})

test.afterEach(async () => {
  await extension.context.close()
})

test('a magnet link: opened, the request gone, the URL without ?open=', async () => {
  await extension.background(
    `await chrome.storage.session.set({ 'open:e2e-text': { kind: 'text', text: 'magnet:?xt=urn:btih:${SEASON}' } })`,
  )
  const page = await extension.context.newPage()
  await page.goto(`${extension.playerUrl}?open=e2e-text`)
  await expect(page).toHaveURL(`${extension.playerUrl}#${SEASON}`)
  await expect(page.locator('.history-row.is-open .history-name')).toHaveText('season-10s')
  expect(await extension.background(`return Object.keys(await chrome.storage.session.get(null)).filter((key) => key.startsWith('open:'))`)).toEqual([])
})

test('a .torrent file: its bytes, base64 in storage.session, play its file', async () => {
  const base64 = Buffer.from(await rqbit.metadata(H264)).toString('base64')
  await extension.background(
    `await chrome.storage.session.set({ 'open:e2e-file': { kind: 'torrent-file', base64: '${base64}', fileName: 'h264.torrent' } })`,
  )
  const page = await extension.context.newPage()
  await page.goto(`${extension.playerUrl}?open=e2e-file`)
  await expect(page).toHaveURL(`${extension.playerUrl}#${H264}/0`)
  await expect(page.locator('movi-player source')).toHaveAttribute('src', new RegExp(`/torrents/${H264}/stream/0/`))
})
