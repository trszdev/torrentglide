import { describe, expect, test } from 'bun:test'
import { RqbitClient } from 'range-player/core'
import { extensionText } from '../../src/i18n.ts'
import { encodeBase64, parkOpenRequest } from '../../src/services/open-request.ts'
import { memoryStorage, type StorageArea } from '../../src/services/storage.ts'
import { createAppState, type PagePlayer } from '../../src/state/app.ts'
import { FakeEnv, FakeRqbit, flush } from './fakes/rqbit.ts'

const SHOW = {
  infoHash: 'a'.repeat(40),
  name: 'Show',
  files: [
    { path: 'Show/E01.mkv', length: 100 },
    { path: 'Show/E02.mkv', length: 100 },
  ],
}
const FILM = { infoHash: 'b'.repeat(40), name: 'Film', files: [{ path: 'Film.mkv', length: 400 }] }

type Current = { infoHash: string; fileIndex: number | null } | null

/** The player's side the page uses, recording what it was asked to do. */
class FakePlayer extends EventTarget implements PagePlayer {
  current: Current = null
  readonly log: string[]

  constructor(log: string[]) {
    super()
    this.log = log
  }

  openText(text: string) {
    this.log.push(`openText ${text}`)
  }
  openTorrentFile(bytes: Uint8Array, fileName: string) {
    this.log.push(`openTorrentFile ${fileName} ${new TextDecoder().decode(bytes)}`)
  }
  openManaged(infoHash: string, fileIndex?: number) {
    this.log.push(`openManaged ${infoHash}${fileIndex === undefined ? '' : `/${fileIndex}`}`)
  }
  play(fileIndex: number) {
    this.log.push(`play ${fileIndex}`)
  }
  close() {
    this.log.push('close')
    this.show(null)
  }
  notify(notice: { kind: 'busy' | 'error'; text: string } | null) {
    this.log.push(notice ? `notify ${notice.kind} ${notice.text}` : 'notify null')
  }

  show(current: Current) {
    this.current = current
    this.dispatchEvent(new CustomEvent('current', { detail: current }))
  }
  emit(type: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail }))
  }
}

function fakeLocation(hash = '') {
  const listeners = new Set<() => void>()
  const location = {
    hash,
    read: () => location.hash,
    replace: (next: string) => void (location.hash = next),
    onChange(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** The user edits the hash. */
    go(next: string) {
      location.hash = next
      for (const listener of listeners) listener()
    },
  }
  return location
}

function setup({
  local = memoryStorage(),
  session = memoryStorage(),
  prepare = () => {},
  failPosts = false,
}: {
  local?: StorageArea
  session?: StorageArea
  /** rqbit before the page asks it the first time. */
  prepare?: (rqbit: FakeRqbit) => void
  /** rqbit answers every POST with a 500. */
  failPosts?: boolean
} = {}) {
  const rqbit = new FakeRqbit()
  prepare(rqbit)
  const log: string[] = []
  const fetch = async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') log.push(`${init.method} ${new URL(url).pathname}`)
    if (failPosts && init?.method === 'POST') return Response.json({ human_readable: 'disk full' }, { status: 500 })
    return rqbit.fetch(url, init)
  }
  const env = new FakeEnv()
  const app = createAppState({
    client: new RqbitClient('http://127.0.0.1:3041', fetch),
    local,
    session,
    env,
    allowed: async () => true,
    text: extensionText('en'),
  })
  const player = new FakePlayer(log)
  return { rqbit, env, app, player, log, local, session }
}

const names = (rows: { name: string }[] | null) => rows?.map((row) => row.name) ?? null
const showOnly = (rqbit: FakeRqbit) => void rqbit.manage(SHOW)
const showAndFilm = (rqbit: FakeRqbit) => {
  rqbit.manage(SHOW)
  rqbit.manage(FILM)
}

describe('createAppState: History', () => {
  test('no rows until rqbit first answers, then a row per torrent, its line over every media file', async () => {
    const { app } = setup({
      prepare(rqbit) {
        rqbit.manage(SHOW, { fileProgress: [100, 0], state: 'paused' })
        rqbit.manage(FILM, { fileProgress: [400] })
      },
    })
    expect(app.rows.value).toBeNull()
    expect(app.status.value).toEqual({ kind: 'connecting' })
    await flush()
    expect(app.status.value).toEqual({ kind: 'running', version: '9.0.1' })
    expect(app.rows.value).toEqual([
      { infoHash: SHOW.infoHash, name: 'Show', incognito: false, active: false, line: { kind: 'progress', percent: 50, bytes: 200, speed: null } },
      { infoHash: FILM.infoHash, name: 'Film', incognito: false, active: false, line: { kind: 'done', bytes: 400 } },
    ])
  })

  test("the player's current torrent is the active row", async () => {
    const { app, player } = setup({ prepare: showAndFilm })
    app.attachPlayer(player, fakeLocation(), null)
    await flush()
    player.show({ infoHash: FILM.infoHash, fileIndex: 0 })
    expect(app.rows.value?.map((row) => row.active)).toEqual([false, true])
    player.show(null)
    expect(app.rows.value?.map((row) => row.active)).toEqual([false, false])
  })

  test("the player's torrentschange asks rqbit again", async () => {
    const { rqbit, app, player } = setup({ prepare: showOnly })
    app.attachPlayer(player, fakeLocation(), null)
    await flush()
    rqbit.manage(FILM)
    player.emit('torrentschange')
    await flush()
    expect(names(app.rows.value)).toEqual(['Show', 'Film'])
  })
})

describe('createAppState: removing from History', () => {
  test('the open torrent: the player closes first, then a busy notice, forget, the notice off, a new list', async () => {
    const { app, player, log, local } = setup({ prepare: showOnly })
    app.attachPlayer(player, fakeLocation(), null)
    await flush()
    player.show({ infoHash: SHOW.infoHash, fileIndex: 0 })
    log.length = 0
    await app.remove(SHOW.infoHash, false)
    expect(log).toEqual(['close', 'notify busy Removing “Show”…', `POST /torrents/${SHOW.infoHash}/forget`, 'notify null'])
    expect(await local.get(null)).toEqual({})
    expect(app.rows.value).toEqual([])
  })

  test('with its files, another torrent than the open one: no close, delete', async () => {
    const { app, player, log } = setup({ prepare: showAndFilm })
    app.attachPlayer(player, fakeLocation(), null)
    await flush()
    player.show({ infoHash: SHOW.infoHash, fileIndex: 0 })
    log.length = 0
    await app.remove(FILM.infoHash, true)
    expect(log).toEqual([
      'notify busy Removing “Film” and deleting its files…',
      `POST /torrents/${FILM.infoHash}/delete`,
      'notify null',
    ])
    expect(names(app.rows.value)).toEqual(['Show'])
  })

  test("rqbit's error stays in the player, and the list is asked for again", async () => {
    const { rqbit, app, player, log } = setup({ prepare: showOnly })
    app.attachPlayer(player, fakeLocation(), null)
    await flush()
    rqbit.managed.delete(SHOW.infoHash)
    log.length = 0
    await app.remove(SHOW.infoHash, false)
    expect(log).toEqual([
      'notify busy Removing “Show”…',
      `POST /torrents/${SHOW.infoHash}/forget`,
      `notify error torrent not found ${SHOW.infoHash}`,
    ])
    expect(app.rows.value).toEqual([])
  })
})

describe('createAppState: the player', () => {
  test('?open= with text: the request is taken from storage.session and opened', async () => {
    const session = memoryStorage()
    const id = await parkOpenRequest(session, { kind: 'text', text: 'magnet:?xt=urn:btih:' + SHOW.infoHash })
    const { app, player, log } = setup({ session })
    app.attachPlayer(player, fakeLocation(), id)
    await flush()
    expect(log).toEqual([`openText magnet:?xt=urn:btih:${SHOW.infoHash}`])
    expect(await session.get(null)).toEqual({})
  })

  test('?open= with a .torrent file: its bytes and name', async () => {
    const session = memoryStorage()
    const bytes = new TextEncoder().encode('d4:infod')
    const id = await parkOpenRequest(session, { kind: 'torrent-file', base64: encodeBase64(bytes), fileName: 'x.torrent' })
    const { app, player, log } = setup({ session })
    app.attachPlayer(player, fakeLocation(), id)
    await flush()
    expect(log).toEqual(['openTorrentFile x.torrent d4:infod'])
  })

  test('detaching stops listening to the player', async () => {
    const { app, player } = setup({ prepare: showOnly })
    const detach = app.attachPlayer(player, fakeLocation(), null)
    await flush()
    detach()
    player.show({ infoHash: SHOW.infoHash, fileIndex: 0 })
    expect(app.rows.value?.[0]?.active).toBe(false)
    expect(app.player.value).toBeNull()
  })
})
