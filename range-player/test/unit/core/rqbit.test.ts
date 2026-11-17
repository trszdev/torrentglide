import { describe, expect, test } from 'bun:test'
import { RqbitClient, RqbitError } from '../../../src/core/rqbit.ts'
import { FakeRqbit } from '../fakes/fake-rqbit.ts'

const MOVIE = {
  infoHash: '3e811790c3bb1244584cfad8713d415749bf4ca3',
  name: 'Movie',
  files: [{ path: 'Movie/Movie.mkv', length: 2_000_000_000 }],
}
const OTHER = { ...MOVIE, infoHash: 'f'.repeat(40) }

function setup() {
  const rqbit = new FakeRqbit()
  return { rqbit, client: new RqbitClient('/rqbit/', rqbit.fetch) }
}

/** A client whose every request gets `answer`, recording what it was sent. */
function answering(answer: () => Response | Promise<Response>) {
  const sent: { url: string; init: RequestInit }[] = []
  const client = new RqbitClient('/rqbit', async (url, init = {}) => {
    sent.push({ url, init })
    return answer()
  })
  return { client, sent }
}

describe('RqbitClient', () => {
  test('trailing slashes of the base URL are dropped', async () => {
    const { rqbit, client } = setup()
    expect(client.baseUrl).toBe('/rqbit')
    expect(await client.serverInfo()).toEqual({ server: 'rqbit', version: '9.0.1' })
    expect(rqbit.calls).toEqual(['GET /'])
  })

  test('the torrent list is asked for with stats', async () => {
    const { rqbit, client } = setup()
    rqbit.manage(MOVIE, { state: 'paused' })
    const list = await client.listTorrents()
    expect(list.map((t) => [t.info_hash, t.stats?.state])).toEqual([[MOVIE.infoHash, 'paused']])
    expect(rqbit.calls).toEqual(['GET /torrents?with_stats=true'])
  })

  test('addTorrent maps its options onto query parameters and the body onto a content type', async () => {
    const { client, sent } = answering(() => Response.json({ id: null, details: {}, output_folder: '' }))
    await client.addTorrent(new Uint8Array([1, 2]), { listOnly: true })
    await client.addTorrent('magnet:?xt=urn:btih:abc', { overwrite: true, onlyFiles: [0, 3] })
    await client.addTorrent('magnet:?xt=urn:btih:abc')
    expect(sent.map(({ url, init }) => [init.method, url, (init.headers as Record<string, string>)['content-type']])).toEqual([
      ['POST', '/rqbit/torrents?list_only=true', 'application/x-bittorrent'],
      ['POST', '/rqbit/torrents?overwrite=true&only_files=0%2C3', 'text/plain'],
      ['POST', '/rqbit/torrents', 'text/plain'],
    ])
  })

  test('a sub_folder is asked for as a query parameter', async () => {
    const { client, sent } = answering(() => Response.json({ id: null, details: {}, output_folder: '' }))
    await client.addTorrent('magnet:?xt=urn:btih:abc', { subFolder: '.torrentglide-incognito' })
    expect(sent.map(({ url }) => url)).toEqual(['/rqbit/torrents?sub_folder=.torrentglide-incognito'])
  })

  test('resolveMagnet posts the link as text and returns the .torrent bytes', async () => {
    const { rqbit, client } = setup()
    rqbit.publish(MOVIE)
    const bytes = await client.resolveMagnet(`magnet:?xt=urn:btih:${MOVIE.infoHash}`)
    expect(bytes).toEqual(FakeRqbit.torrentBytes(MOVIE))
    expect(rqbit.calls).toEqual(['POST /torrents/resolve_magnet'])
  })

  test('start, pause, forget and delete post to the torrent', async () => {
    const { rqbit, client } = setup()
    rqbit.manage(MOVIE)
    rqbit.manage(OTHER)
    await client.pause(MOVIE.infoHash)
    await client.start(MOVIE.infoHash)
    await client.forget(MOVIE.infoHash)
    await client.delete(OTHER.infoHash)
    expect(rqbit.posts).toEqual([
      `POST /torrents/${MOVIE.infoHash}/pause`,
      `POST /torrents/${MOVIE.infoHash}/start`,
      `POST /torrents/${MOVIE.infoHash}/forget`,
      `POST /torrents/${OTHER.infoHash}/delete`,
    ])
    expect(rqbit.managed.size).toBe(0)
  })

  test('a pause can be sent to outlive the page', async () => {
    const { client, sent } = answering(() => Response.json({}))
    await client.pause('abc')
    await client.pause('abc', undefined, { keepalive: true })
    expect(sent.map(({ init }) => init.keepalive)).toEqual([false, true])
  })

  test('updateOnlyFiles posts the JSON rqbit expects', async () => {
    const { client, sent } = answering(() => Response.json({}))
    await client.updateOnlyFiles(MOVIE.infoHash, [2])
    expect(sent[0]).toMatchObject({
      url: `/rqbit/torrents/${MOVIE.infoHash}/update_only_files`,
      init: { method: 'POST', body: '{"only_files":[2]}', headers: { 'content-type': 'application/json' } },
    })
  })

  test('stats come from stats/v1', async () => {
    const { rqbit, client } = setup()
    rqbit.manage(MOVIE, { state: 'paused', fileProgress: [1000] })
    expect(await client.torrentStats(MOVIE.infoHash)).toMatchObject({ state: 'paused', file_progress: [1000] })
    expect(rqbit.calls).toEqual([`GET /torrents/${MOVIE.infoHash}/stats/v1`])
  })

  test('findTorrent turns 404 into null and rethrows anything else', async () => {
    const { rqbit, client } = setup()
    expect(await client.findTorrent(MOVIE.infoHash)).toBeNull()
    rqbit.manage(MOVIE)
    expect((await client.findTorrent(MOVIE.infoHash))?.info_hash).toBe(MOVIE.infoHash)

    const { client: failing } = answering(() => Response.json({ human_readable: 'boom' }, { status: 500 }))
    await expect(failing.findTorrent(MOVIE.infoHash)).rejects.toMatchObject({ status: 500 })
  })

  test('streamUrl appends the encoded file name for players and people to read', () => {
    const client = new RqbitClient('http://localhost:3030/')
    expect(client.streamUrl('abc', 2, 'Movie (2014) #1.mkv')).toBe(
      'http://localhost:3030/torrents/abc/stream/2/Movie%20(2014)%20%231.mkv',
    )
    expect(client.streamUrl(5, 0)).toBe('http://localhost:3030/torrents/5/stream/0')
  })
})

describe('RqbitError', () => {
  test("rqbit's JSON errors carry its message and kind", async () => {
    const { client } = setup()
    const err = await client.torrentDetails(OTHER.infoHash).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RqbitError)
    expect(err).toMatchObject({ status: 404, kind: 'torrent_not_found', message: `torrent not found ${OTHER.infoHash}` })
  })

  test('a JSON error without error_kind is an http_error', async () => {
    const { client } = answering(() => Response.json({ human_readable: 'boom' }, { status: 500 }))
    await expect(client.serverInfo()).rejects.toMatchObject({ status: 500, kind: 'http_error', message: 'boom' })
  })

  test("the proxy's 502 for an unreachable rqbit keeps its kind", async () => {
    const { client } = answering(() =>
      Response.json({ error_kind: 'rqbit_unreachable', human_readable: 'connection refused' }, { status: 502 }),
    )
    await expect(client.listTorrents()).rejects.toMatchObject({ status: 502, kind: 'rqbit_unreachable' })
  })

  test('any other body becomes "rqbit answered", cut to 200 characters', async () => {
    const { client } = answering(() => new Response(`  ${'x'.repeat(300)}  `, { status: 503 }))
    await expect(client.serverInfo()).rejects.toMatchObject({
      status: 503,
      kind: 'http_error',
      message: `rqbit answered 503: ${'x'.repeat(200)}`,
    })
    const { client: empty } = answering(() => new Response('', { status: 502, statusText: 'Bad Gateway' }))
    await expect(empty.serverInfo()).rejects.toMatchObject({ message: 'rqbit answered 502: Bad Gateway' })
  })

  test('a request nothing answers is rqbit_unreachable with status 0', async () => {
    const client = new RqbitClient('http://localhost:3030', async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(client.listTorrents()).rejects.toMatchObject({ status: 0, kind: 'rqbit_unreachable' })
  })

  test('an aborted request rejects with the abort itself', async () => {
    const controller = new AbortController()
    const client = new RqbitClient('/rqbit', async (_url, init) => {
      controller.abort()
      throw init?.signal?.reason
    })
    const err = await client.listTorrents(controller.signal).catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(RqbitError)
    expect(err).toBe(controller.signal.reason)
  })

  test('every method passes the signal on to fetch', async () => {
    const { client, sent } = answering(() => Response.json({ torrents: [] }))
    const signal = new AbortController().signal
    await client.listTorrents(signal)
    await client.start('abc', signal)
    expect(sent.map(({ init }) => init.signal)).toEqual([signal, signal])
  })
})
