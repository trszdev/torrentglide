/**
 * rqbit 9's HTTP API in memory: answers through `fetch` and records every
 * call as "METHOD /path?query", so tests can assert the exact requests.
 *
 * It covers what range-player and TorrentGlide use: list_only and real adds
 * (with only_files and overwrite), resolve_magnet, the initializing → live
 * check after an add, start/pause, selection updates, the torrent list with
 * stats, forget/delete. The extension's tests import it too.
 */

import type { RqbitFile, RqbitStats, RqbitTorrentState } from '../../../src/core/rqbit.ts'

export interface FakeTorrent {
  infoHash: string
  name: string
  files: { path: string; length: number; padding?: boolean }[]
  /** Where rqbit reports the torrent; its download folder when omitted. */
  outputFolder?: string
}

export interface ManagedTorrent {
  torrent: FakeTorrent
  id: number
  included: Set<number>
  state: RqbitTorrentState
  /** Stats polls left that report `initializing`; the next one after them reports `live`. */
  initializingPolls: number
  error: string | null
  /** Bytes rqbit has of each file. */
  fileProgress: number[]
}

export type ManageOptions = Partial<Pick<ManagedTorrent, 'state' | 'included' | 'error' | 'fileProgress' | 'initializingPolls'>>

export class FakeRqbit {
  readonly calls: string[] = []
  readonly managed = new Map<string, ManagedTorrent>()
  /** Torrents reachable by magnet (info hash in the body) or by .torrent bytes. */
  readonly known = new Map<string, FakeTorrent>()
  /** Stats polls a torrent added from now on spends initializing. */
  initializingPollsOnAdd = 0
  private nextId = 0

  /** Makes a torrent resolvable without adding it. */
  publish(torrent: FakeTorrent): FakeTorrent {
    this.known.set(torrent.infoHash, torrent)
    return torrent
  }

  /** Puts a torrent in rqbit's session, as if added earlier. */
  manage(torrent: FakeTorrent, options: ManageOptions = {}): ManagedTorrent {
    this.publish(torrent)
    const managed: ManagedTorrent = {
      torrent,
      id: this.nextId++,
      included: options.included ?? new Set(torrent.files.map((_, i) => i)),
      state: options.state ?? 'live',
      initializingPolls: options.initializingPolls ?? 0,
      error: options.error ?? null,
      fileProgress: options.fileProgress ?? torrent.files.map(() => 0),
    }
    this.managed.set(torrent.infoHash, managed)
    return managed
  }

  /** The .torrent "encoding" the fake reads back: the info hash in bencode-ish bytes. */
  static torrentBytes(torrent: FakeTorrent): Uint8Array<ArrayBuffer> {
    return new TextEncoder().encode(`d8:infohash40:${torrent.infoHash}e`)
  }

  /** The POSTs recorded so far: what changed rqbit's state. */
  get posts(): string[] {
    return this.calls.filter((call) => call.startsWith('POST '))
  }

  readonly fetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    // Like fetch: a request whose signal is already aborted never reaches rqbit.
    if (init.signal?.aborted) throw init.signal.reason
    const url = new URL(input, 'http://fake')
    const method = init.method ?? 'GET'
    const path = url.pathname.replace(/^\/rqbit/, '') || '/'
    this.calls.push(`${method} ${path}${url.search}`)
    const body = init.body instanceof Uint8Array ? new TextDecoder().decode(init.body) : (init.body as string | undefined)

    if (method === 'GET' && path === '/') return Response.json({ server: 'rqbit', version: '9.0.1' })

    if (method === 'GET' && path === '/torrents') {
      const withStats = url.searchParams.get('with_stats') === 'true'
      const torrents = [...this.managed.values()].map((managed) => ({
        ...this.details(managed.torrent, managed),
        ...(withStats ? { stats: this.stats(managed, false) } : {}),
      }))
      return Response.json({ torrents })
    }

    if (method === 'POST' && path === '/torrents/resolve_magnet') {
      const torrent = this.fromBody(body)
      if (!torrent) return this.error(400, 'internal_error', 'error adding torrent: no peers')
      return new Response(FakeRqbit.torrentBytes(torrent), { headers: { 'content-type': 'application/x-bittorrent' } })
    }

    if (method === 'POST' && path === '/torrents') return this.add(url, body)

    const match = /^\/torrents\/([^/]+)(\/.*)?$/.exec(path)
    if (match?.[1]) {
      const managed = this.find(match[1])
      if (!managed) return this.error(404, 'torrent_not_found', `torrent not found ${match[1]}`)
      switch (`${method} ${match[2] ?? ''}`) {
        case 'GET ':
          return Response.json(this.details(managed.torrent, managed))
        case 'GET /stats/v1':
          return Response.json(this.stats(managed, true))
        case 'POST /start':
          managed.state = 'live'
          managed.error = null
          return Response.json({})
        case 'POST /pause':
          managed.state = 'paused'
          return Response.json({})
        case 'POST /forget':
        case 'POST /delete':
          this.managed.delete(managed.torrent.infoHash)
          return Response.json({})
        case 'POST /update_only_files':
          if (managed.state === 'initializing') return this.error(500, 'internal_error', "can't update initializing torrent")
          managed.included = new Set((JSON.parse(body ?? '{}') as { only_files: number[] }).only_files)
          return Response.json({})
      }
    }
    return this.error(404, 'not_found', `no route for ${method} ${path}`)
  }

  private add(url: URL, body: string | undefined): Response {
    const torrent = this.fromBody(body)
    if (!torrent) return this.error(400, 'internal_error', 'error adding torrent: error decoding torrent: invalid value')
    if (url.searchParams.get('list_only') === 'true') {
      // rqbit answers `id: null` whether or not its session has the torrent.
      return Response.json({ id: null, details: this.details(torrent, null), output_folder: '/downloads/' })
    }
    // Already managed: rqbit keeps it as it is and ignores only_files.
    const existing = this.managed.get(torrent.infoHash)
    if (existing) return Response.json({ id: existing.id, details: this.details(torrent, existing), output_folder: '/downloads/' })
    const onlyFiles = url.searchParams.get('only_files')
    const added = this.manage(torrent, {
      included: onlyFiles ? new Set(onlyFiles.split(',').map(Number)) : undefined,
      state: this.initializingPollsOnAdd > 0 ? 'initializing' : 'live',
      initializingPolls: this.initializingPollsOnAdd,
    })
    return Response.json({ id: added.id, details: this.details(torrent, added), output_folder: '/downloads/' })
  }

  private fromBody(body: string | undefined): FakeTorrent | undefined {
    if (!body) return undefined
    const hash = /btih:([0-9a-f]{40})/i.exec(body)?.[1] ?? /infohash40:([0-9a-f]{40})/.exec(body)?.[1]
    return hash ? this.known.get(hash.toLowerCase()) : undefined
  }

  private find(ref: string): ManagedTorrent | undefined {
    for (const managed of this.managed.values()) {
      if (managed.torrent.infoHash === ref || String(managed.id) === ref) return managed
    }
    return undefined
  }

  private details(torrent: FakeTorrent, managed: ManagedTorrent | null) {
    const files: RqbitFile[] = torrent.files.map((file, i) => ({
      name: file.path,
      components: file.path.split('/'),
      length: file.length,
      included: managed ? managed.included.has(i) : true,
      attributes: { symlink: false, hidden: false, padding: file.padding ?? false, executable: false },
    }))
    return {
      ...(managed ? { id: managed.id } : {}),
      info_hash: torrent.infoHash,
      name: torrent.name,
      output_folder: torrent.outputFolder ?? '/downloads/',
      total_pieces: 10,
      files,
    }
  }

  /** `poll`: a stats/v1 request, which advances an initializing torrent's check by one step. */
  private stats(managed: ManagedTorrent, poll: boolean): RqbitStats {
    if (poll && managed.state === 'initializing' && managed.initializingPolls-- <= 0) managed.state = 'live'
    const { files } = managed.torrent
    // rqbit counts only the selected files.
    const selected = files.flatMap((file, i) => (managed.included.has(i) ? [{ file, i }] : []))
    const total = selected.reduce((sum, { file }) => sum + file.length, 0)
    const have = selected.reduce((sum, { i }) => sum + (managed.fileProgress[i] ?? 0), 0)
    return {
      state: managed.state,
      file_progress: [...managed.fileProgress],
      error: managed.error,
      progress_bytes: have,
      uploaded_bytes: 0,
      total_bytes: total,
      finished: total > 0 && have >= total,
      live:
        managed.state === 'live'
          ? {
              snapshot: {
                downloaded_and_checked_bytes: have,
                fetched_bytes: have,
                uploaded_bytes: 0,
                peer_stats: { queued: 0, connecting: 0, live: 3, seen: 5, dead: 0, not_needed: 0 },
              },
              download_speed: { mbps: 1.5, human_readable: '1.50 MiB/s' },
              upload_speed: { mbps: 0, human_readable: '0 B/s' },
              time_remaining: null,
            }
          : null,
    }
  }

  private error(status: number, kind: string, message: string): Response {
    return Response.json({ error_kind: kind, human_readable: message, status, status_text: String(status) }, { status })
  }
}
