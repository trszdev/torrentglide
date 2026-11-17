/**
 * What the e2e tests share: the built extension in Playwright's Chromium
 * with its rqbit address set before any page loads, the scratch rqbit, and
 * pages in incognito windows, which Playwright doesn't hand out (they live
 * in another browser context) and are reached through CDP.
 *
 * `tv e2e` passes E2E_RQBIT (the scratch rqbit) and the hashes of the
 * samples it seeds: E2E_H264 (h264-10s, one file) and E2E_SEASON
 * (season-10s, three episodes and a subtitle).
 */

import { chromium, type BrowserContext, type Page, type Worker } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const RQBIT = process.env.E2E_RQBIT ?? 'http://127.0.0.1:3041'
// Playing a file pauses every other torrent: never the owner's rqbit.
if (/:3030\b/.test(RQBIT) || /\/\/localhost\b/.test(RQBIT)) throw new Error(`e2e runs against the scratch rqbit only, not ${RQBIT}`)
export const H264 = required('E2E_H264')
export const SEASON = required('E2E_SEASON')

const EXTENSION = resolve(import.meta.dirname, '../.output/chrome-mv3')

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set: run the e2e tests with .pi/scripts/tv e2e`)
  return value
}

export interface Extension {
  context: BrowserContext
  worker: Worker
  id: string
  profile: string
  playerUrl: string
  /** Runs `code`, the body of an async function, in the extension's (normal) background; `chrome` is there. */
  background<T = unknown>(code: string): Promise<T>
}

export async function launch(profile = mkdtempSync(join(tmpdir(), 'torrentglide-e2e-'))): Promise<Extension> {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const id = new URL(worker.url()).host
  // A string: Playwright evaluates it over CDP, which the extension's CSP doesn't cover.
  const background: Extension['background'] = (code) => worker.evaluate(`(async () => { ${code} })()`)
  await background(`await chrome.storage.local.set({ rqbitUrl: ${JSON.stringify(RQBIT)} })`)
  return { context, worker, id, profile, playerUrl: `chrome-extension://${id}/player.html`, background }
}

/**
 * Turns on "Allow in Incognito" and starts the browser again with the same
 * profile: Playwright's Chromium unloads an extension loaded from the
 * command line when the switch reloads it. The switch is saved a few
 * seconds later; the profile is read until it is.
 */
export async function allowIncognito(extension: Extension): Promise<Extension> {
  const page = await extension.context.newPage()
  await page.goto(`chrome://extensions/?id=${extension.id}`)
  await page.locator('#allow-incognito').click()
  const saved = () => {
    try {
      const prefs = JSON.parse(readFileSync(join(extension.profile, 'Default', 'Secure Preferences'), 'utf8'))
      return prefs.extensions?.settings?.[extension.id]?.incognito === true
    } catch {
      return false
    }
  }
  for (let i = 0; i < 60 && !saved(); i++) await new Promise((resolve) => setTimeout(resolve, 500))
  if (!saved()) throw new Error('"Allow in Incognito" was not saved')
  await extension.context.close()
  const again = await launch(extension.profile)
  if (!(await again.background<boolean>('return await chrome.extension.isAllowedIncognitoAccess()'))) {
    throw new Error('the extension has no incognito access after the restart')
  }
  return again
}

/** A page of another browser context (an incognito window), found by URL, driven through CDP. */
export async function otherContextPage(page: Page, matches: (url: string) => boolean) {
  const cdp = await page.context().newCDPSession(page)
  const { targetInfo: own } = await cdp.send('Target.getTargetInfo')
  const { targetInfos } = await cdp.send('Target.getTargets')
  const target = targetInfos.find((t) => t.type === 'page' && t.browserContextId !== own.browserContextId && matches(t.url))
  if (!target) return null
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false })
  let next = 1
  const send = (method: string, params: object = {}) =>
    new Promise<Record<string, unknown>>((resolve) => {
      const id = next++
      const onMessage = (event: { message: string }) => {
        const message = JSON.parse(event.message) as { id?: number; result?: Record<string, unknown> }
        if (message.id !== id) return
        cdp.off('Target.receivedMessageFromTarget', onMessage)
        resolve(message.result ?? {})
      }
      cdp.on('Target.receivedMessageFromTarget', onMessage)
      void cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) })
    })
  return {
    async evaluate<T>(expression: string): Promise<T> {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      return (result.result as { value: T }).value
    },
    reload: () => send('Page.reload'),
    close: () => cdp.send('Target.closeTarget', { targetId: target.targetId }),
  }
}

/** The scratch rqbit, for setup and assertions. */
export const rqbit = {
  async torrents(): Promise<{ info_hash: string; name: string; output_folder: string }[]> {
    return (await (await fetch(`${RQBIT}/torrents`)).json()).torrents
  },
  async has(infoHash: string): Promise<boolean> {
    return (await rqbit.torrents()).some((torrent) => torrent.info_hash === infoHash)
  },
  async details(infoHash: string): Promise<{ name: string; output_folder: string; files: { name: string }[] }> {
    return (await fetch(`${RQBIT}/torrents/${infoHash}`)).json()
  },
  /** The .torrent file of a torrent rqbit has. */
  async metadata(infoHash: string): Promise<Uint8Array> {
    return new Uint8Array(await (await fetch(`${RQBIT}/torrents/${infoHash}/metadata`)).arrayBuffer())
  },
  /** Makes a torrent of a file or folder and seeds it; returns its info hash. */
  async create(path: string): Promise<string> {
    const magnet = await (await fetch(`${RQBIT}/torrents/create`, { method: 'POST', body: path })).text()
    const hash = /btih:([0-9a-f]{40})/i.exec(magnet)?.[1]
    if (!hash) throw new Error(`rqbit made no torrent of ${path}: ${magnet}`)
    return hash.toLowerCase()
  },
  async forget(infoHash: string): Promise<void> {
    await fetch(`${RQBIT}/torrents/${infoHash}/forget`, { method: 'POST' })
  },
}

/** Polls `check` until it's true, for up to `ms`. */
export async function until(check: () => Promise<boolean>, ms = 15_000): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if (await check()) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return check()
}
