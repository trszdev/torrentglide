import { describe, expect, test } from 'bun:test'
import { RqbitClient, RqbitError } from '../../../src/core/rqbit.ts'
import {
  openManagedTorrent,
  openTorrent,
  pauseOtherTorrents,
  PrepareError,
  prepareStream,
  type PrepareStatus,
} from '../../../src/core/session.ts'
import { parseTorrentText } from '../../../src/core/torrent-input.ts'
import { FakeRqbit, type FakeTorrent } from '../fakes/fake-rqbit.ts'

const PACK: FakeTorrent = {
  infoHash: '7d4a070ac2bb74f7f4e3c574128b8eec4f747081',
  name: 'Show.S01',
  files: [
    { path: 'Show.S01/Show.S01E01.mkv', length: 900_000_000 },
    { path: 'Show.S01/Show.S01E02.mkv', length: 950_000_000 },
    { path: 'Show.S01/Show.S01E01.en.srt', length: 40_000 },
  ],
}
const SOLO: FakeTorrent = {
  infoHash: 'fbf744c07e94e4dd258d78de495498866dffd696',
  name: 'single sample.mp4',
  files: [{ path: 'single sample.mp4', length: 150_000 }],
}
/** A name that would climb out of rqbit's folder if it went into `sub_folder`. */
const ESCAPING: FakeTorrent = {
  infoHash: 'b'.repeat(40),
  name: '../../elsewhere',
  files: [
    { path: 'a.bin', length: 1_000 },
    { path: 'b.bin', length: 1_000 },
  ],
}
const H = PACK.infoHash
const MAGNET = `magnet:?xt=urn:btih:${H}&dn=Show.S01`

function setup() {
  const rqbit = new FakeRqbit()
  rqbit.publish(PACK)
  return { rqbit, client: new RqbitClient('/rqbit', rqbit.fetch) }
}

/** A client over the fake whose stats answers are changed by `patch`. */
function patchingStats(rqbit: FakeRqbit, patch: (stats: Record<string, unknown>) => Record<string, unknown>) {
  return new RqbitClient('/rqbit', async (url, init) => {
    const res = await rqbit.fetch(url, init)
    return url.endsWith('/stats/v1') ? Response.json(patch(await res.json())) : res
  })
}

describe('openTorrent', () => {
  test('a new magnet is resolved and listed, not added', async () => {
    const { rqbit, client } = setup()
    const opened = await openTorrent(client, parseTorrentText(MAGNET))
    expect(opened).toMatchObject({ infoHash: H, name: 'Show.S01', managed: false, torrentBytes: FakeRqbit.torrentBytes(PACK) })
    expect(opened.files.map((f) => f.name)).toEqual(PACK.files.map((f) => f.path))
    expect(rqbit.managed.size).toBe(0)
    expect(rqbit.calls).toEqual([
      `GET /torrents/${H}`,
      'POST /torrents/resolve_magnet',
      'POST /torrents?list_only=true',
      `GET /torrents/${H}`,
    ])
  })

  test('a magnet rqbit already has needs no metadata', async () => {
    const { rqbit, client } = setup()
    rqbit.manage(PACK, { state: 'paused' })
    expect(await openTorrent(client, parseTorrentText(MAGNET))).toMatchObject({ managed: true, torrentBytes: null })
    expect(rqbit.calls).toEqual([`GET /torrents/${H}`])
  })

  test('a magnet without a btih hash goes straight to resolving', async () => {
    const { rqbit } = setup()
    const client = new RqbitClient('/rqbit', (url, init) =>
      rqbit.fetch(url, url.endsWith('/resolve_magnet') ? { ...init, body: MAGNET } : init),
    )
    await openTorrent(client, { kind: 'magnet', uri: 'magnet:?xt=urn:btmh:1220ab', infoHash: null, displayName: null })
    expect(rqbit.calls).toEqual(['POST /torrents/resolve_magnet', 'POST /torrents?list_only=true', `GET /torrents/${H}`])
  })

  test('a .torrent URL is handed to rqbit to fetch', async () => {
    const { rqbit } = setup()
    const bodies: unknown[] = []
    const client = new RqbitClient('/rqbit', (url, init) => {
      if (!url.endsWith('/resolve_magnet')) return rqbit.fetch(url, init)
      bodies.push(init?.body)
      return rqbit.fetch(url, { ...init, body: MAGNET })
    })
    const opened = await openTorrent(client, parseTorrentText('https://example.org/pack.torrent'))
    expect(bodies).toEqual(['https://example.org/pack.torrent'])
    expect(opened.managed).toBe(false)
    expect(rqbit.calls).toEqual(['POST /torrents/resolve_magnet', 'POST /torrents?list_only=true', `GET /torrents/${H}`])
  })

  test('.torrent bytes are listed and checked against the session', async () => {
    const { rqbit, client } = setup()
    rqbit.manage(PACK)
    const bytes = FakeRqbit.torrentBytes(PACK)
    expect(await openTorrent(client, { kind: 'file', bytes, fileName: 'pack.torrent' })).toMatchObject({
      managed: true,
      torrentBytes: null,
    })
    expect(rqbit.calls).toEqual(['POST /torrents?list_only=true', `GET /torrents/${H}`])
  })

  test("rqbit's refusal comes through as its error", async () => {
    const { client } = setup()
    const err = await openTorrent(client, parseTorrentText('0'.repeat(40))).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RqbitError)
    expect(err).toMatchObject({ message: 'error adding torrent: no peers' })
  })

  test('a torrent without a name is called by its hash', async () => {
    const { rqbit } = setup()
    const client = new RqbitClient('/rqbit', async (url, init) => {
      const res = await rqbit.fetch(url, init)
      return url.endsWith(`/torrents/${H}`) ? Response.json({ ...(await res.json()), name: null }) : res
    })
    rqbit.manage(PACK)
    expect((await openManagedTorrent(client, H)).name).toBe(H)
  })
})

describe('openManagedTorrent', () => {
  test('reads the torrent from the session', async () => {
    const { rqbit, client } = setup()
    rqbit.manage(PACK, { included: new Set([1]) })
    const opened = await openManagedTorrent(client, H)
    expect(opened).toMatchObject({ infoHash: H, managed: true, torrentBytes: null })
    expect(opened.files.map((f) => f.included)).toEqual([false, true, false])
    expect(rqbit.calls).toEqual([`GET /torrents/${H}`])
  })
})

describe('prepareStream', () => {
  test('adds a new torrent with only the chosen file, picking up data on disk', async () => {
    const { rqbit, client } = setup()
    const opened = await openTorrent(client, parseTorrentText(MAGNET))
    rqbit.calls.length = 0
    const statuses: PrepareStatus[] = []
    const { url, torrent } = await prepareStream(client, opened, 1, { onStatus: (s) => statuses.push(s) })
    expect(url).toBe(`/rqbit/torrents/${H}/stream/1/Show.S01E02.mkv`)
    expect(torrent).toMatchObject({ managed: true, torrentBytes: null })
    expect(torrent.files.map((f) => f.included)).toEqual([false, true, false])
    expect(statuses).toEqual([{ step: 'adding' }])
    expect(rqbit.calls).toEqual([
      'POST /torrents?overwrite=true&only_files=1',
      `GET /torrents/${H}/stats/v1`,
      `GET /torrents/${H}`,
    ])
  })

  test('a torrent added for a host that asks for a sub-folder goes there, in the folder rqbit would have given it', async () => {
    const { rqbit, client } = setup()
    const opened = await openTorrent(client, parseTorrentText(MAGNET))
    rqbit.calls.length = 0
    await prepareStream(client, opened, 1, { subFolder: '.torrentglide-incognito' })
    // rqbit drops a multi-file torrent's own folder when it has a sub_folder, so the folder is put back.
    expect(rqbit.calls[0]).toBe('POST /torrents?overwrite=true&only_files=1&sub_folder=.torrentglide-incognito%2FShow.S01')
  })

  test('a single-file torrent keeps the sub-folder itself: rqbit gives it no folder of its own either', async () => {
    const { rqbit, client } = setup()
    rqbit.publish(SOLO)
    const opened = await openTorrent(client, parseTorrentText(`magnet:?xt=urn:btih:${SOLO.infoHash}&dn=${SOLO.name}`))
    rqbit.calls.length = 0
    await prepareStream(client, opened, 0, { subFolder: '.torrentglide-incognito' })
    expect(rqbit.calls[0]).toBe('POST /torrents?overwrite=true&only_files=0&sub_folder=.torrentglide-incognito')
  })

  test('a torrent whose name is not one path component keeps the sub-folder as it is', async () => {
    const { rqbit, client } = setup()
    rqbit.publish(ESCAPING)
    const opened = await openTorrent(client, parseTorrentText(`magnet:?xt=urn:btih:${ESCAPING.infoHash}`))
    rqbit.calls.length = 0
    await prepareStream(client, opened, 0, { subFolder: '.torrentglide-incognito' })
    expect(rqbit.calls[0]).toBe('POST /torrents?overwrite=true&only_files=0&sub_folder=.torrentglide-incognito')
  })

  test("waits out rqbit's check of data on disk before touching the selection", async () => {
    const { rqbit, client } = setup()
    rqbit.manage(PACK, { state: 'initializing', initializingPolls: 2, fileProgress: [450_000_000, 0, 0] })
    const opened = await openManagedTorrent(client, H)
    rqbit.calls.length = 0
    const statuses: PrepareStatus[] = []
    await prepareStream(client, opened, 1, { pollMs: 0, onStatus: (s) => statuses.push(s) })
    expect(statuses).toEqual([
      { step: 'checking', percent: 24 },
      { step: 'checking', percent: 24 },
    ])
    expect(rqbit.calls).toEqual([
      `GET /torrents/${H}/stats/v1`,
      `GET /torrents/${H}/stats/v1`,
      `GET /torrents/${H}/stats/v1`,
      `GET /torrents/${H}`,
      `POST /torrents/${H}/update_only_files`,
      `GET /torrents/${H}`,
    ])
  })

  test('a check of a torrent of unknown size has no percent', async () => {
    const { rqbit } = setup()
    rqbit.manage(PACK, { state: 'initializing', initializingPolls: 1 })
    const client = patchingStats(rqbit, (stats) => ({ ...stats, total_bytes: 0 }))
    const statuses: PrepareStatus[] = []
    await prepareStream(client, await openManagedTorrent(client, H), 0, { pollMs: 0, onStatus: (s) => statuses.push(s) })
    expect(statuses).toEqual([{ step: 'checking', percent: null }])
  })

  test('narrows the selection of a paused torrent to the file, then resumes it', async () => {
    const { rqbit, client } = setup()
    rqbit.manage(PACK, { state: 'paused', included: new Set([0, 2]) })
    const opened = await openManagedTorrent(client, H)
    rqbit.calls.length = 0
    const statuses: PrepareStatus[] = []
    const { torrent } = await prepareStream(client, opened, 1, { onStatus: (s) => statuses.push(s) })
    expect(statuses).toEqual([{ step: 'resuming' }])
    expect(rqbit.posts).toEqual([`POST /torrents/${H}/update_only_files`, `POST /torrents/${H}/start`])
    expect(rqbit.managed.get(H)).toMatchObject({ state: 'live', included: new Set([1]) })
    expect(torrent.files.map((f) => f.included)).toEqual([false, true, false])
  })

  test('leaves a running torrent that downloads just that file alone', async () => {
    const { rqbit, client } = setup()
    rqbit.manage(PACK, { included: new Set([0]) })
    const opened = await openManagedTorrent(client, H)
    rqbit.calls.length = 0
    await prepareStream(client, opened, 0)
    expect(rqbit.calls).toEqual([`GET /torrents/${H}/stats/v1`, `GET /torrents/${H}`])
  })

  test('narrows the selection even right after an add: someone may have added the torrent first', async () => {
    const { rqbit, client } = setup()
    const opened = await openTorrent(client, parseTorrentText(MAGNET))
    rqbit.manage(PACK) // added elsewhere meanwhile, every file selected
    await prepareStream(client, opened, 0)
    expect(rqbit.managed.get(H)?.included).toEqual(new Set([0]))
    expect(rqbit.posts).toContain(`POST /torrents/${H}/update_only_files`)
  })

  test('restarts a torrent in error once', async () => {
    const { rqbit, client } = setup()
    rqbit.manage(PACK, { state: 'error', error: 'disk full', included: new Set([0]) })
    const opened = await openManagedTorrent(client, H)
    rqbit.calls.length = 0
    await prepareStream(client, opened, 0)
    expect(rqbit.posts).toEqual([`POST /torrents/${H}/start`])
    expect(rqbit.managed.get(H)?.state).toBe('live')
  })

  test('a torrent still in error after the restart is a torrent-error', async () => {
    const { rqbit } = setup()
    rqbit.manage(PACK, { state: 'error', included: new Set([0]) })
    const stuck = patchingStats(rqbit, (stats) => ({ ...stats, state: 'error', error: 'disk full' }))
    const err = await prepareStream(stuck, await openManagedTorrent(stuck, H), 0).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PrepareError)
    expect(err).toMatchObject({ code: 'torrent-error', detail: 'disk full' })
    expect(rqbit.posts).toEqual([`POST /torrents/${H}/start`])

    const silent = patchingStats(rqbit, (stats) => ({ ...stats, state: 'error', error: null }))
    await expect(prepareStream(silent, await openManagedTorrent(silent, H), 0)).rejects.toMatchObject({
      code: 'torrent-error',
      detail: 'unknown error',
    })
  })

  test('a file the torrent does not have is a no-file error, before any request', async () => {
    const { rqbit, client } = setup()
    const opened = await openTorrent(client, parseTorrentText(MAGNET))
    rqbit.calls.length = 0
    await expect(prepareStream(client, opened, 7)).rejects.toMatchObject({ code: 'no-file', detail: '7' })
    expect(rqbit.calls).toEqual([])
  })

  test('a torrent neither managed nor with .torrent bytes is a no-torrent-data error', async () => {
    const { rqbit, client } = setup()
    const opened = { ...(await openTorrent(client, parseTorrentText(MAGNET))), torrentBytes: null }
    rqbit.calls.length = 0
    await expect(prepareStream(client, opened, 0)).rejects.toMatchObject({ code: 'no-torrent-data' })
    expect(rqbit.calls).toEqual([])
  })

  test('an abort stops the wait and rejects with the abort', async () => {
    const { rqbit } = setup()
    rqbit.manage(PACK, { state: 'initializing', initializingPolls: 1_000 })
    const controller = new AbortController()
    let polls = 0
    const client = new RqbitClient('/rqbit', (url, init) => {
      if (url.endsWith('/stats/v1') && ++polls === 3) controller.abort()
      return rqbit.fetch(url, init)
    })
    const opened = await openManagedTorrent(client, H)
    const err = await prepareStream(client, opened, 0, { signal: controller.signal, pollMs: 0 }).catch((e: unknown) => e)
    expect(err).toBe(controller.signal.reason)
    expect(polls).toBe(3)
  })
})

describe('pauseOtherTorrents', () => {
  const single = (digit: number, name: string): FakeTorrent => ({
    infoHash: String(digit).repeat(40),
    name,
    files: [{ path: `${name}.mkv`, length: 1_000 }],
  })

  test('pauses the other torrents downloading or seeding, and nothing else', async () => {
    const { rqbit, client } = setup()
    const downloading = single(1, 'Downloading')
    const seeding = single(2, 'Seeding')
    rqbit.manage(PACK)
    rqbit.manage(downloading)
    rqbit.manage(seeding, { fileProgress: [1_000] })
    rqbit.manage(single(3, 'Paused'), { state: 'paused' })
    rqbit.manage(single(4, 'Checking'), { state: 'initializing', initializingPolls: 1_000 })
    rqbit.manage(single(5, 'Broken'), { state: 'error', error: 'disk full' })

    expect(await pauseOtherTorrents(client, H)).toEqual([downloading.infoHash, seeding.infoHash])
    expect(rqbit.posts).toEqual([`POST /torrents/${downloading.infoHash}/pause`, `POST /torrents/${seeding.infoHash}/pause`])
    expect(rqbit.managed.get(H)?.state).toBe('live')
  })
})
