import { describe, expect, test } from 'bun:test'
import { RqbitClient, type FetchLike } from '../../../src/core/rqbit.ts'
import { createController, type HostEvent } from '../../../src/controller/controller.ts'
import { FakeEnv } from '../fakes/fake-env.ts'
import { FakeRqbit, type FakeTorrent } from '../fakes/fake-rqbit.ts'
import { FakeSurface } from '../fakes/fake-surface.ts'

const SEASON: FakeTorrent = {
  infoHash: '7d4a070ac2bb74f7f4e3c574128b8eec4f747081',
  name: 'Show.S01',
  files: [
    { path: 'Show.S01/Show.S01E01.mkv', length: 900_000_000 },
    { path: 'Show.S01/Show.S01E02.mkv', length: 900_000_000 },
    { path: 'Show.S01/Show.S01E01.en.srt', length: 40_000 },
  ],
}
const MOVIE: FakeTorrent = {
  infoHash: '3e811790c3bb1244584cfad8713d415749bf4ca3',
  name: 'Movie',
  files: [
    { path: 'Movie/Movie.mkv', length: 4_000_000_000 },
    { path: 'Movie/Sample/sample.mkv', length: 40_000_000 },
    { path: 'Movie/Movie.en.srt', length: 50_000 },
  ],
}
const OTHER: FakeTorrent = { infoHash: '1'.repeat(40), name: 'Other', files: [{ path: 'Other.mkv', length: 1_000 }] }
const S = SEASON.infoHash
const M = MOVIE.infoHash

const magnet = (torrent: FakeTorrent) => `magnet:?xt=urn:btih:${torrent.infoHash}&dn=${torrent.name}`

function setup(wrap: (fetch: FetchLike) => FetchLike = (fetch) => fetch, subFolder?: string) {
  const rqbit = new FakeRqbit()
  rqbit.publish(SEASON)
  rqbit.publish(MOVIE)
  const surface = new FakeSurface()
  const env = new FakeEnv()
  const events: HostEvent[] = []
  const player = createController({
    client: new RqbitClient('/rqbit', wrap(rqbit.fetch)),
    surface,
    env,
    onEvent: (event) => events.push(event),
    pollMs: 0,
    subFolder,
  })
  /** Calls since the last look. */
  const calls = () => rqbit.calls.splice(0)
  return { rqbit, surface, env, events, player, calls }
}

/** SEASON managed by rqbit and its file `index` playing. */
async function playingSeason(index = 0) {
  const ctx = setup()
  ctx.rqbit.manage(SEASON, { state: 'paused' })
  ctx.player.openManaged(S, index)
  await ctx.player.settled()
  ctx.surface.media('loadedmetadata')
  ctx.calls()
  ctx.events.length = 0
  return ctx
}

const statsCalls = (calls: string[]) => calls.filter((call) => call.endsWith('/stats/v1'))

/** A request that never gets an answer: it rejects once aborted, as fetch does. */
function hold(init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    const signal = init?.signal
    if (signal?.aborted) return reject(signal.reason)
    signal?.addEventListener('abort', () => reject(signal.reason))
  })
}

describe('P-02 opening', () => {
  test('a season is listed without downloading anything, and the menu is pinned', async () => {
    const { rqbit, surface, events, player } = setup()
    player.openText(magnet(SEASON))
    expect(surface.state.phase).toEqual({ name: 'opening', step: { kind: 'resolving', name: 'Show.S01' } })
    await player.settled()
    expect(surface.state.phase).toEqual({ name: 'choosing' })
    expect(rqbit.managed.size).toBe(0)
    expect(surface.loads).toEqual([])
    expect(events).toEqual([
      { type: 'opened', detail: { infoHash: S, managed: false } },
      { type: 'current', detail: { infoHash: S, fileIndex: null } },
    ])
    expect(player.current).toEqual({ infoHash: S, fileIndex: null })
  })

  test('a film plays its main file by itself, with its subtitles', async () => {
    const { rqbit, surface, events, player } = setup()
    player.openText(magnet(MOVIE))
    await player.settled()
    expect(surface.state.phase).toEqual({ name: 'buffering', index: 0 })
    expect(surface.loads).toEqual([
      {
        url: `/rqbit/torrents/${M}/stream/0/Movie.mkv`,
        title: 'Movie',
        resumeKey: `${M}/0`,
        subtitles: [{ url: `/rqbit/torrents/${M}/stream/2/Movie.en.srt`, label: 'English', lang: 'en', format: 'srt' }],
      },
    ])
    expect(rqbit.posts).toContain('POST /torrents?overwrite=true&only_files=0')
    expect(events).toEqual([
      { type: 'opened', detail: { infoHash: M, managed: false } },
      { type: 'current', detail: { infoHash: M, fileIndex: null } },
      { type: 'added', detail: { infoHash: M } },
      { type: 'current', detail: { infoHash: M, fileIndex: 0 } },
      { type: 'torrentschange' },
    ])
    surface.media('loadedmetadata')
    expect(surface.state.phase).toEqual({ name: 'playing', index: 0 })
  })

  test('the host’s sub-folder is where a torrent it adds goes', async () => {
    const { rqbit, player } = setup((fetch) => fetch, '.torrentglide-incognito')
    player.openText(magnet(MOVIE))
    await player.settled()
    expect(rqbit.posts).toContain('POST /torrents?overwrite=true&only_files=0&sub_folder=.torrentglide-incognito%2FMovie')
  })

  test('the wait says what it waits on: a URL, a file, a known torrent', async () => {
    const { surface, rqbit, player } = setup()
    player.openText('https://example.org/x.torrent')
    expect(surface.state.phase).toEqual({ name: 'opening', step: { kind: 'fetching' } })
    await player.settled()
    player.openTorrentFile(FakeRqbit.torrentBytes(SEASON), 'pack.torrent')
    expect(surface.state.phase).toEqual({ name: 'opening', step: { kind: 'reading', name: 'pack.torrent' } })
    await player.settled()
    rqbit.manage(MOVIE)
    player.openManaged(M)
    expect(surface.state.phase).toEqual({ name: 'opening', step: { kind: 'opening' } })
    expect(surface.state.busySince).toBe(0)
    await player.settled()
  })

  test('openManaged plays the file asked for', async () => {
    const { rqbit, surface, events, player } = setup()
    rqbit.manage(SEASON, { state: 'paused' })
    player.openManaged(S, 1)
    await player.settled()
    expect(surface.loads.map((load) => load.resumeKey)).toEqual([`${S}/1`])
    expect(events.map((event) => event.type)).not.toContain('added')
  })

  test('openManaged with a file the torrent does not have falls back to the default', async () => {
    const { rqbit, surface, player } = setup()
    rqbit.manage(SEASON)
    player.openManaged(S, 9)
    await player.settled()
    expect(surface.state.phase).toEqual({ name: 'choosing' })
  })

  test('reopening the torrent that plays leaves playback alone', async () => {
    const { surface, rqbit, player } = await playingSeason(1)
    player.openManaged(S)
    await player.settled()
    player.openManaged(S, 1)
    await player.settled()
    player.openText(magnet(SEASON))
    await player.settled()
    expect(surface.loads).toHaveLength(1)
    expect(surface.resets).toBe(0)
    expect(surface.state.phase).toEqual({ name: 'playing', index: 1 })
    expect(rqbit.posts).toEqual([])
  })

  test('reopening it with another file switches in the same player', async () => {
    const { surface, player } = await playingSeason(1)
    player.openManaged(S, 0)
    await player.settled()
    expect(surface.loads.map((load) => load.resumeKey)).toEqual([`${S}/1`, `${S}/0`])
    expect(surface.resets).toBe(0)
  })

  test('another torrent pauses the one that played and gets a fresh player', async () => {
    const { surface, rqbit, events, player } = await playingSeason()
    player.openText(magnet(MOVIE))
    await player.settled()
    const posts = rqbit.posts
    expect(posts.indexOf(`POST /torrents/${S}/pause`)).toBeGreaterThan(-1)
    expect(posts.indexOf(`POST /torrents/${S}/pause`)).toBeLessThan(posts.indexOf('POST /torrents?overwrite=true&only_files=0'))
    expect(surface.resets).toBe(1)
    expect(surface.state.torrent?.infoHash).toBe(M)
    expect(events.filter((event) => event.type === 'torrentschange').length).toBe(2)
  })

  test('a torrent only looked at is not paused when another opens', async () => {
    const { surface, rqbit, player } = setup()
    rqbit.manage(SEASON, { state: 'paused' })
    player.openManaged(S)
    await player.settled()
    player.openText(magnet(MOVIE))
    await player.settled()
    expect(rqbit.posts).not.toContain(`POST /torrents/${S}/pause`)
    expect(surface.resets).toBe(1)
  })
})

describe('P-04 one action at a time', () => {
  test('a newer open cancels the older one, whose result and error never show', async () => {
    let held = 0
    const { surface, player } = setup((fetch) => async (url, init) => {
      // SEASON's metadata never comes: the request waits until it is aborted.
      if (url.endsWith('/resolve_magnet') && String(init?.body).includes(S)) {
        held++
        return hold(init)
      }
      return fetch(url, init)
    })
    player.openText(magnet(SEASON))
    player.openText(magnet(MOVIE))
    await player.settled()
    expect(held).toBe(1)
    expect(surface.state).toMatchObject({ phase: { name: 'buffering', index: 0 }, error: null })
    expect(surface.state.torrent?.infoHash).toBe(M)
  })

  test('a newer play cancels the older prepare before it changes the selection', async () => {
    const { rqbit, surface, player } = setup()
    const managed = rqbit.manage(SEASON, { state: 'initializing', initializingPolls: Number.MAX_SAFE_INTEGER })
    player.openManaged(S)
    await player.settled()
    player.play(0)
    await Bun.sleep(5)
    expect(surface.state.phase).toMatchObject({ name: 'preparing', index: 0, step: { kind: 'checking' } })
    managed.initializingPolls = 0
    player.play(1)
    await player.settled()
    expect(rqbit.posts).toEqual([`POST /torrents/${S}/update_only_files`])
    expect(managed.included).toEqual(new Set([1]))
    expect(surface.loads.map((load) => load.resumeKey)).toEqual([`${S}/1`])
  })

  test('close cancels an open in progress', async () => {
    const { surface, player } = setup((fetch) => async (url, init) => {
      return url.endsWith('/resolve_magnet') ? hold(init) : fetch(url, init)
    })
    player.openText(magnet(SEASON))
    player.close()
    await player.settled()
    expect(surface.state).toMatchObject({ phase: { name: 'idle' }, error: null, torrent: null })
  })
})

describe('P-05 playing a file', () => {
  test('picking a file in the menu plays it in the same player; picking the playing one only closes the menu', async () => {
    const { surface, player } = await playingSeason(0)
    surface.intent({ type: 'menu', open: true })
    expect(surface.state.menuOpen).toBe(true)
    surface.intent({ type: 'play', index: 0 })
    expect(surface.state.menuOpen).toBe(false)
    await player.settled()
    expect(surface.loads).toHaveLength(1)

    surface.intent({ type: 'menu', open: true })
    surface.intent({ type: 'play', index: 1 })
    expect(surface.state.phase).toMatchObject({ name: 'preparing', index: 1 })
    await player.settled()
    expect(surface.loads.map((load) => load.resumeKey)).toEqual([`${S}/0`, `${S}/1`])
    expect(surface.resets).toBe(0)
  })

  test('the file plays only with every other live torrent paused', async () => {
    const { rqbit, player } = setup()
    rqbit.manage(OTHER)
    player.openText(magnet(MOVIE))
    await player.settled()
    expect(rqbit.posts).toContain(`POST /torrents/${OTHER.infoHash}/pause`)
    expect(rqbit.managed.get(OTHER.infoHash)?.state).toBe('paused')
  })

  test('ended opens the menu when there is another file', async () => {
    const { surface } = await playingSeason(0)
    surface.media('ended')
    expect(surface.state.menuOpen).toBe(true)
  })

  test('groups fold and errors dismiss from the view', async () => {
    const { surface, player } = await playingSeason(0)
    surface.intent({ type: 'toggle-group', key: 'series::Show.S01E …' })
    expect(surface.state.collapsed).toEqual(new Set(['series::Show.S01E …']))
    player.play(7)
    await player.settled()
    expect(surface.state.error).not.toBeNull()
    surface.intent({ type: 'dismiss-error' })
    expect(surface.state.error).toBeNull()
  })
})

describe('P-08 errors inside the player', () => {
  test('input that is not a torrent', async () => {
    const { surface, player } = setup()
    player.openText(' ')
    expect(surface.state.error).toEqual({ code: 'input-empty', detail: '' })
    player.openText('https://exa mple.org/x')
    expect(surface.state.error).toEqual({ code: 'input-invalid-url', detail: 'https://exa mple.org/x' })
    player.openText('words')
    expect(surface.state).toMatchObject({ phase: { name: 'idle' }, error: { code: 'input-unrecognized', detail: '' } })
    await player.settled()
  })

  test('rqbit not running, with the address it was looked for at', async () => {
    const { surface, player } = setup(() => async () => {
      throw new TypeError('Failed to fetch')
    })
    player.openText(magnet(SEASON))
    await player.settled()
    expect(surface.state).toMatchObject({ phase: { name: 'idle' }, error: { code: 'rqbit-unreachable', detail: '/rqbit' } })
  })

  test("rqbit's own errors as it words them", async () => {
    const { surface, player } = setup()
    player.openText(`magnet:?xt=urn:btih:${'0'.repeat(40)}`)
    await player.settled()
    expect(surface.state.error).toEqual({ code: 'rqbit', detail: 'error adding torrent: no peers' })
  })

  test('a failed prepare goes back to the shown file', async () => {
    const { surface, player } = await playingSeason(0)
    player.play(7)
    await player.settled()
    expect(surface.state).toMatchObject({ phase: { name: 'playing', index: 0 }, error: { code: 'no-file', detail: '7' } })
    expect(surface.loads).toHaveLength(1)
  })

  test('a torrent rqbit cannot run', async () => {
    const { rqbit, surface, player } = setup((fetch) => async (url, init) => {
      const res = await fetch(url, init)
      return url.endsWith('/stats/v1') ? Response.json({ ...(await res.json()), state: 'error', error: 'disk full' }) : res
    })
    rqbit.manage(SEASON)
    player.openManaged(S, 0)
    await player.settled()
    expect(surface.state).toMatchObject({ phase: { name: 'choosing' }, error: { code: 'torrent-error', detail: 'disk full' } })
  })

  test('failing to pause the other torrents is an error, and playback goes on', async () => {
    const { rqbit, surface, events, player } = setup((fetch) => async (url, init) =>
      url.endsWith(`/${OTHER.infoHash}/pause`)
        ? Response.json({ error_kind: 'internal_error', human_readable: 'disk' }, { status: 500 })
        : fetch(url, init),
    )
    rqbit.manage(OTHER)
    player.openText(magnet(MOVIE))
    await player.settled()
    expect(surface.state).toMatchObject({ phase: { name: 'buffering', index: 0 }, error: { code: 'pause-failed', detail: 'disk' } })
    expect(events.map((event) => event.type)).not.toContain('torrentschange')
  })

  test('the host’s notice shows inside the player', async () => {
    const { surface, player } = await playingSeason()
    player.notify({ kind: 'busy', text: 'Removing…' })
    expect(surface.state.hostNotice).toEqual({ kind: 'busy', text: 'Removing…' })
    player.notify(null)
    expect(surface.state.hostNotice).toBeNull()
  })
})

describe('P-07 stats', () => {
  test('polled at once and every 2 s while the page is visible, again as soon as it shows', async () => {
    const { env, surface, calls, player } = await playingSeason()
    env.advance(2_000)
    await player.settled()
    expect(statsCalls(calls())).toEqual([`GET /torrents/${S}/stats/v1`])
    expect(surface.state.stats?.state).toBe('live')

    env.hide()
    env.advance(6_000)
    await player.settled()
    expect(statsCalls(calls())).toEqual([])

    env.show()
    await player.settled()
    expect(statsCalls(calls())).toEqual([`GET /torrents/${S}/stats/v1`])
  })

  test('a managed torrent is polled as soon as it opens', async () => {
    const { rqbit, calls, player } = setup()
    rqbit.manage(SEASON)
    player.openManaged(S)
    await player.settled()
    expect(statsCalls(calls())).toEqual([`GET /torrents/${S}/stats/v1`])
  })

  test('a torrent rqbit does not have is not polled', async () => {
    const { env, calls, player } = setup()
    player.openText(magnet(SEASON))
    await player.settled()
    env.advance(10_000)
    await player.settled()
    expect(statsCalls(calls())).toEqual([])
  })

  test('the poll of a torrent that left stops', async () => {
    const { env, calls, player } = await playingSeason()
    player.openText(magnet(MOVIE))
    await player.settled()
    calls()
    env.advance(2_000)
    await player.settled()
    expect(statsCalls(calls())).toEqual([`GET /torrents/${M}/stats/v1`])
  })
})

describe('P-10 the page leaving and coming back', () => {
  function recording() {
    const keepalive: [string, boolean | undefined][] = []
    const ctx = setup((fetch) => async (url, init) => {
      if (init?.method === 'POST') keepalive.push([url, init.keepalive])
      return fetch(url, init)
    })
    return { ...ctx, keepalive }
  }

  test('pagehide pauses the playing torrent with keepalive; back from the cache it starts again', async () => {
    const { rqbit, env, keepalive, player } = recording()
    rqbit.manage(SEASON)
    player.openManaged(S, 0)
    await player.settled()
    keepalive.length = 0
    env.pageHide()
    await player.settled()
    expect(keepalive).toEqual([[`/rqbit/torrents/${S}/pause`, true]])
    env.pageShow(false)
    env.pageShow(true)
    await player.settled()
    expect(rqbit.posts.slice(-2)).toEqual([`POST /torrents/${S}/pause`, `POST /torrents/${S}/start`])
  })

  test('nothing played: the page leaving changes nothing in rqbit', async () => {
    const { rqbit, env, player } = setup()
    rqbit.manage(SEASON)
    player.openManaged(S)
    await player.settled()
    env.pageHide()
    env.pageShow(true)
    await player.settled()
    expect(rqbit.posts).toEqual([])
  })
})

describe('close and destroy', () => {
  test('close pauses the torrent, empties the player and tells the host', async () => {
    const { rqbit, surface, env, events, calls, player } = await playingSeason()
    player.close()
    await player.settled()
    expect(rqbit.posts).toEqual([`POST /torrents/${S}/pause`])
    expect(surface.resets).toBe(1)
    expect(surface.state.phase).toEqual({ name: 'idle' })
    expect(player.current).toBeNull()
    expect(events).toEqual([{ type: 'current', detail: null }, { type: 'torrentschange' }])
    calls()
    env.advance(4_000)
    await player.settled()
    expect(calls()).toEqual([])
  })

  test('destroy also lets go of every listener and timer', async () => {
    const { rqbit, surface, env, player } = await playingSeason()
    player.destroy()
    await player.settled()
    expect(rqbit.posts).toEqual([`POST /torrents/${S}/pause`])
    expect(surface.listeners).toBe(0)
    expect(env.attached).toBe(0)
  })
})
