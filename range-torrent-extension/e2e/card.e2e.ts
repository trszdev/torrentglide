/**
 * The content script on a site (SPEC §9): real clicks on torrent links
 * raise the card, a page's own clicks and keys don't reach it, Open opens
 * the player tab. The site is `http://links.test`, served by Playwright.
 * The card is a closed shadow root: tests see its host element and drive
 * it with the keyboard (Open has the focus), as a page's scripts can't.
 */

import { expect, test, type Page } from '@playwright/test'
import { H264, launch, rqbit, type Extension } from './extension.ts'

const SITE = 'http://links.test'

const LINKS = `<!doctype html>
<meta charset="utf-8"><title>links</title>
<p><a id="magnet" href="magnet:?xt=urn:btih:${H264}&dn=h264-10s">magnet</a></p>
<p><a id="file" href="/h264.torrent">h264.torrent</a></p>
<p><a id="html" href="/page.html" download="fake.torrent">fake.torrent</a></p>
<script>
  // What the page sees of clicks on links; its own (untrusted) ones go nowhere.
  window.seen = []
  addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a')
    if (!a) return
    seen.push({ id: a.id, trusted: e.isTrusted })
    if (!e.isTrusted) e.preventDefault()
  })
</script>`

let extension: Extension

test.beforeEach(async () => {
  extension = await launch()
  const torrent = Buffer.from(await rqbit.metadata(H264))
  await extension.context.route(`${SITE}/**`, (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: LINKS })
    if (path === '/h264.torrent') return route.fulfill({ contentType: 'application/x-bittorrent', body: torrent })
    return route.fulfill({ contentType: 'text/html', body: '<p>sign in first</p>' })
  })
})

test.afterEach(async () => {
  await extension.context.close()
})

async function site(): Promise<Page> {
  const page = await extension.context.newPage()
  await page.goto(`${SITE}/`)
  return page
}

const card = (page: Page) => page.locator('torrentglide-card')

test("a page's own click on a link raises no card and goes through", async () => {
  const page = await site()
  await page.evaluate(() => document.getElementById('file')!.click())
  expect(await page.evaluate(() => (window as unknown as { seen: unknown[] }).seen)).toEqual([{ id: 'file', trusted: false }])
  await expect(card(page)).toHaveCount(0)
})

test('a real click on a magnet: the card, the page never sees the click, Open plays it in a new tab', async () => {
  const page = await site()
  await page.locator('#magnet').click()
  await expect(card(page)).toHaveCount(1)
  expect(await page.evaluate(() => (window as unknown as { seen: unknown[] }).seen)).toEqual([])
  const opened = extension.context.waitForEvent('page')
  await page.keyboard.press('Enter')
  const player = await opened
  await expect(player).toHaveURL(new RegExp(`player\\.html#${H264}/0$`))
  await expect(card(page)).toHaveCount(0)
})

test('a .torrent link: fetched on the site, its bytes open in the player', async () => {
  const page = await site()
  await page.locator('#file').click()
  await expect(card(page)).toHaveCount(1)
  const opened = extension.context.waitForEvent('page')
  await page.keyboard.press('Enter')
  const player = await opened
  await expect(player).toHaveURL(new RegExp(`player\\.html#${H264}/0$`))
})

test('a link that gives a page instead of a .torrent: the card stays, no tab opens', async () => {
  const page = await site()
  await page.locator('#html').click()
  await expect(card(page)).toHaveCount(1)
  const pages = extension.context.pages().length
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  await expect(card(page)).toHaveCount(1)
  expect(extension.context.pages()).toHaveLength(pages)
})

test("the page's Escape doesn't close the card; the user's does", async () => {
  const page = await site()
  await page.locator('#magnet').click()
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  await expect(card(page)).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(card(page)).toHaveCount(0)
})
