/**
 * The player page (SPEC §3–§7): rqbit's status, History, a row that plays,
 * the hash, the "+" dialog and the settings.
 */

import { expect, test } from '@playwright/test'
import { H264, launch, SEASON, type Extension } from './extension.ts'

let extension: Extension

test.beforeEach(async () => {
  extension = await launch()
})

test.afterEach(async () => {
  await extension.context.close()
})

test('the status dot is green and History lists what rqbit has', async () => {
  const page = await extension.context.newPage()
  await page.goto(extension.playerUrl)
  await expect(page.locator('#rqbit-status')).toHaveAttribute('data-state', 'running')
  await expect(page.locator('.history-name', { hasText: 'h264-10s' })).toBeVisible()
  await expect(page.locator('.history-name', { hasText: 'season-10s' })).toBeVisible()
})

test('a History row plays its file, and the hash and the highlight follow', async () => {
  const page = await extension.context.newPage()
  await page.goto(extension.playerUrl)
  const row = page.locator('.history-row', { has: page.locator('.history-name', { hasText: 'h264-10s' }) })
  await row.locator('.history-item').click()
  await expect(page).toHaveURL(new RegExp(`#${H264}/0$`))
  await expect(page.locator('movi-player source')).toHaveAttribute('src', new RegExp(`/torrents/${H264}/stream/0/`))
  await expect(row).toHaveClass(/is-open/)
})

test('a hash opens its torrent on load: a season without a default file pins the file menu', async () => {
  const page = await extension.context.newPage()
  await page.goto(`${extension.playerUrl}#${SEASON}`)
  await expect(page.locator('.rp-files')).toBeVisible()
  await expect(page.locator('.history-row.is-open .history-name')).toHaveText('season-10s')
})

test('"+" keeps text that is no torrent, with the reason under the field', async () => {
  const page = await extension.context.newPage()
  await page.goto(extension.playerUrl)
  await page.locator('.panel-actions button').first().click()
  const dialog = page.locator('dialog[open]')
  await dialog.locator('input[name=magnet]').fill('hello')
  await dialog.locator('input[name=magnet]').press('Enter')
  await expect(dialog.getByRole('alert')).toHaveText('Not a magnet link, an info hash or an http(s) URL of a .torrent file.')
  await expect(dialog.locator('input[name=magnet]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('dialog[open]')).toHaveCount(0)
})

test('settings: a bad address is refused, and Cancel puts the previewed theme back', async () => {
  const page = await extension.context.newPage()
  await page.goto(extension.playerUrl)
  await page.locator('.panel-actions button').nth(1).click()
  const dialog = page.locator('dialog[open]')
  await dialog.locator('select[name=theme]').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await dialog.locator('input[name=rqbit-url]').fill('ftp://x')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('The torrent service’s address starts with http:// or https://.')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)
  expect(await extension.background('return (await chrome.storage.local.get("theme")).theme ?? null')).toBeNull()
})
