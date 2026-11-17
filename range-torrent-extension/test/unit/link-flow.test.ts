import { describe, expect, test } from 'bun:test'
import { createMenuUpdater, MENU_ID, openLinkFromMenu } from '../../src/services/context-menu.ts'
import { FetchTorrentError, openRequestFor } from '../../src/services/fetch-torrent.ts'
import { decodeBase64, takeOpenRequest } from '../../src/services/open-request.ts'
import { openPlayerTab } from '../../src/services/player-tab.ts'
import { memoryStorage } from '../../src/services/storage.ts'
import { deferred, flush } from './fakes/rqbit.ts'

const HASH = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c'
const TORRENT = new TextEncoder().encode('d8:announce3:url4:infod4:name1:xee')
const FILE_LINK = { kind: 'torrent-file' as const, url: 'https://tracker.example/dl.php?t=42', name: null }

describe('openRequestFor', () => {
  test('a magnet goes as text, without a fetch', async () => {
    const calls: string[] = []
    const uri = `magnet:?xt=urn:btih:${HASH}`
    const request = await openRequestFor({ kind: 'magnet', uri, name: null }, async (url) => {
      calls.push(url)
      return new Response()
    })
    expect(request).toEqual({ kind: 'text', text: uri })
    expect(calls).toEqual([])
  })

  test("a .torrent is fetched with the site's cookies and goes as bytes, named by Content-Disposition", async () => {
    let init: RequestInit | undefined
    const request = await openRequestFor(FILE_LINK, async (_url, given) => {
      init = given
      return new Response(TORRENT, { headers: { 'content-disposition': `attachment; filename*=UTF-8''Movie%201.torrent` } })
    })
    expect(init).toEqual({ credentials: 'include' })
    expect(request.kind).toBe('torrent-file')
    if (request.kind !== 'torrent-file') return
    expect(request.fileName).toBe('Movie 1.torrent')
    expect(decodeBase64(request.base64)).toEqual(TORRENT)
  })

  test('a refused fetch (CORS, mixed content, offline) hands the URL to rqbit', async () => {
    const request = await openRequestFor(FILE_LINK, async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(request).toEqual({ kind: 'text', text: FILE_LINK.url })
  })

  test("the site's error status, coded", async () => {
    const error = await openRequestFor(FILE_LINK, async () => new Response('no', { status: 403, statusText: 'Forbidden' })).catch(
      (err: unknown) => err,
    )
    expect(error).toBeInstanceOf(FetchTorrentError)
    expect(error).toMatchObject({ code: 'site-status', detail: '403 Forbidden' })
  })

  test('a page instead of a .torrent, coded with its type', async () => {
    const error = await openRequestFor(
      FILE_LINK,
      async () => new Response('<html>sign in</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    ).catch((err: unknown) => err)
    expect(error).toMatchObject({ code: 'not-torrent', detail: 'text/html' })
  })
})

describe('openPlayerTab', () => {
  const PLAYER = 'chrome-extension://id/player.html'

  function fakeTabs() {
    const created: Record<string, unknown>[] = []
    return { created, tabs: { create: async (props: Record<string, unknown>) => void created.push(props) } }
  }

  test("the request waits in storage.session, the tab opens next to the sender's, in its window", async () => {
    const session = memoryStorage()
    const { created, tabs } = fakeTabs()
    await openPlayerTab({
      request: { kind: 'text', text: `magnet:?xt=urn:btih:${HASH}` },
      from: { id: 7, index: 3, windowId: 2 },
      session,
      tabs,
      playerUrl: PLAYER,
    })
    expect(created).toHaveLength(1)
    const tab = created[0]!
    expect(tab).toMatchObject({ windowId: 2, index: 4, openerTabId: 7 })
    const id = new URL(tab.url as string).searchParams.get('open')!
    expect(tab.url).toBe(`${PLAYER}?open=${id}`)
    expect(await takeOpenRequest(session, id)).toEqual({ kind: 'text', text: `magnet:?xt=urn:btih:${HASH}` })
  })

  test('the toolbar button: an empty player, no request, no sender tab', async () => {
    const session = memoryStorage()
    const { created, tabs } = fakeTabs()
    await openPlayerTab({ request: null, from: undefined, session, tabs, playerUrl: PLAYER })
    expect(created).toEqual([{ url: PLAYER }])
    expect(await session.get(null)).toEqual({})
  })
})

describe('createMenuUpdater', () => {
  function fakeMenus() {
    const items = new Map<string, string>()
    const log: string[] = []
    return {
      items,
      log,
      menus: {
        async update(id: string, { title }: { title: string }) {
          // Like Chrome: no such item yet.
          await flush()
          if (!items.has(id)) throw new Error(`Cannot find menu item with id ${id}`)
          items.set(id, title)
          log.push(`update ${title}`)
        },
        async create({ id, title }: { id: string; title: string; contexts: string[] }) {
          await flush()
          if (items.has(id)) throw new Error(`Cannot create item with duplicate id ${id}`)
          items.set(id, title)
          log.push(`create ${title}`)
        },
      },
    }
  }

  test('creates the item once, then retitles it, one call at a time', async () => {
    const { items, log, menus } = fakeMenus()
    const titles = ['Open link in TorrentGlide', 'Открыть ссылку в TorrentGlide']
    let call = 0
    const update = createMenuUpdater(menus, async () => titles[Math.min(call++, 1)]!)
    await Promise.all([update(), update()])
    expect(log).toEqual(['create Open link in TorrentGlide', 'update Открыть ссылку в TorrentGlide'])
    expect([...items]).toEqual([[MENU_ID, 'Открыть ссылку в TorrentGlide']])
  })

  test('one failing call does not stop the next', async () => {
    const { log, menus } = fakeMenus()
    let fail = true
    const update = createMenuUpdater(menus, async () => {
      if (fail) throw new Error('storage gone')
      return 'Open link in TorrentGlide'
    })
    await expect(update()).rejects.toThrow('storage gone')
    fail = false
    await update()
    expect(log).toEqual(['create Open link in TorrentGlide'])
  })
})

describe('openLinkFromMenu', () => {
  const TAB = { id: 5, index: 0, windowId: 1 }

  function setup(answer: () => Promise<{ accepted: true }>) {
    const log: string[] = []
    return {
      log,
      deps: {
        askContentScript: (tabId: number, frameId: number, url: string) => {
          log.push(`ask ${tabId}/${frameId} ${url}`)
          return answer()
        },
        openPlayer: async (request: { kind: string; text?: string }, from: unknown) => {
          log.push(`player ${request.text} ${from === TAB ? 'from tab' : 'no tab'}`)
        },
      },
    }
  }

  test("a link goes to the frame's content script, which takes it from there", async () => {
    const { log, deps } = setup(async () => ({ accepted: true }))
    await openLinkFromMenu({ url: FILE_LINK.url, tab: TAB, frameId: 3, ...deps })
    expect(log).toEqual([`ask 5/3 ${FILE_LINK.url}`])
  })

  test('no content script there: the player tab gets the URL', async () => {
    const { log, deps } = setup(async () => {
      throw new Error('Could not establish connection. Receiving end does not exist.')
    })
    await openLinkFromMenu({ url: FILE_LINK.url, tab: TAB, frameId: undefined, ...deps })
    expect(log).toEqual([`ask 5/0 ${FILE_LINK.url}`, `player ${FILE_LINK.url} from tab`])
  })

  test('a magnet needs no fetch: straight to the player', async () => {
    const { log, deps } = setup(async () => ({ accepted: true }))
    const uri = `magnet:?xt=urn:btih:${HASH}`
    await openLinkFromMenu({ url: uri, tab: TAB, frameId: 0, ...deps })
    expect(log).toEqual([`player ${uri} from tab`])
  })

  test('a content script that never answers does not hold the menu up forever', async () => {
    const hang = deferred<{ accepted: true }>()
    const { log, deps } = setup(() => hang.promise)
    await openLinkFromMenu({ url: FILE_LINK.url, tab: TAB, frameId: 0, ...deps, answerWithinMs: 10 })
    expect(log).toEqual([`ask 5/0 ${FILE_LINK.url}`, `player ${FILE_LINK.url} from tab`])
  })
})
