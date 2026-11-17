import { describe, expect, test } from 'bun:test'
import { RqbitClient, type RqbitFile, type RqbitStats, type RqbitTorrentSummary } from 'range-player/core'
import { FileLists, historyFiles, historyRows, type HistoryInput } from '../../src/services/history-model.ts'
import { FakeRqbit, files, flush } from './fakes/rqbit.ts'

const MB = 1024 * 1024
const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const C = 'c'.repeat(40)

// A season of 7 episodes of 2 MB, one watched (SPEC §4's example), with subtitles and a sample text.
const SEASON = files(...[1, 2, 3, 4, 5, 6, 7].map((n) => `Show/E0${n}.mkv:2`), 'Show/E01.srt:1', 'Show/info.txt:1')

function stats(overrides: Partial<RqbitStats> = {}): RqbitStats {
  return {
    state: 'paused',
    file_progress: [],
    error: null,
    progress_bytes: 0,
    uploaded_bytes: 0,
    total_bytes: 0,
    finished: false,
    live: null,
    ...overrides,
  }
}

function summary(infoHash: string, name: string | null, s?: RqbitStats): RqbitTorrentSummary {
  return { id: 0, info_hash: infoHash, name, output_folder: '/downloads/', ...(s ? { stats: s } : {}) }
}

function input(overrides: Partial<HistoryInput>): HistoryInput {
  return {
    torrents: [],
    fileLists: new Map(),
    pendingDelete: new Set(),
    inIncognito: false,
    current: null,
    ...overrides,
  }
}

describe('historyFiles', () => {
  test('the videos the player lists; audio without video; else everything but padding', () => {
    expect(historyFiles(SEASON)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(historyFiles(files('Album/01.flac', 'Album/cover.jpg'))).toEqual([0])
    expect(historyFiles(files('Book/a.pdf', '.pad/0', 'Book/b.epub'))).toEqual([0, 2])
  })
})

describe('historyRows (SPEC §4)', () => {
  test('size, percent and “downloaded” count every media file, not rqbit’s selection', () => {
    const progress = SEASON.map((file, i) => (i === 0 ? file.length : 0))
    // rqbit counts only the selected file: by its stats, it's finished.
    const s = stats({ file_progress: progress, total_bytes: 2 * MB, progress_bytes: 2 * MB, finished: true })
    const [row] = historyRows(input({ torrents: [summary(A, 'Show', s)], fileLists: new Map([[A, SEASON]]) }))
    expect(row?.line).toEqual({ kind: 'progress', percent: 14, bytes: 14 * MB, speed: null })
  })

  test('every media file whole: downloaded, with their size', () => {
    const progress = SEASON.map((file, i) => (i < 7 ? file.length : 0))
    const [row] = historyRows(input({ torrents: [summary(A, 'Show', stats({ file_progress: progress }))], fileLists: new Map([[A, SEASON]]) }))
    expect(row?.line).toEqual({ kind: 'done', bytes: 14 * MB })
  })

  test('percent rounds down, and a file’s progress never counts past its length', () => {
    const list = files('a.mkv:1', 'b.mkv:1')
    const s = stats({ file_progress: [5 * MB, MB - 1] })
    const [row] = historyRows(input({ torrents: [summary(A, 'x', s)], fileLists: new Map([[A, list]]) }))
    expect(row?.line).toMatchObject({ kind: 'progress', percent: 99 })
  })

  test('a live torrent adds its download speed', () => {
    const s = stats({
      state: 'live',
      file_progress: [0],
      live: {
        snapshot: { downloaded_and_checked_bytes: 0, fetched_bytes: 0, uploaded_bytes: 0, peer_stats: { queued: 0, connecting: 0, live: 1, seen: 1, dead: 0, not_needed: 0 } },
        download_speed: { mbps: 1.5, human_readable: '1.50 MiB/s' },
        upload_speed: { mbps: 0, human_readable: '0 B/s' },
        time_remaining: null,
      },
    })
    const [row] = historyRows(input({ torrents: [summary(A, 'x', s)], fileLists: new Map([[A, files('a.mkv:1')]]) }))
    expect(row?.line).toEqual({ kind: 'progress', percent: 0, bytes: MB, speed: '1.50 MiB/s' })
  })

  test('error and checking come first; nothing known yet is an empty line', () => {
    const rows = historyRows(
      input({
        torrents: [
          summary(A, 'x', stats({ state: 'error', error: 'disk full' })),
          summary(B, 'y', stats({ state: 'initializing' })),
          summary(C, null, stats()),
        ],
      }),
    )
    expect(rows.map((row) => row.line)).toEqual([{ kind: 'error', error: 'disk full' }, { kind: 'checking' }, { kind: 'none' }])
    expect(rows[2]?.name).toBe(C)
  })

  test('in rqbit’s order; the open torrent is marked', () => {
    const rows = historyRows(input({ torrents: [summary(B, 'b'), summary(A, 'a')], current: A }))
    expect(rows.map((row) => [row.infoHash, row.active])).toEqual([
      [B, false],
      [A, true],
    ])
  })
})

describe('FileLists', () => {
  const SHOW = { infoHash: A, name: 'Show', files: [{ path: 'Show/E01.mkv', length: MB }] }

  test('takes lists from the summaries; asks rqbit once for a torrent whose summary has none', async () => {
    const rqbit = new FakeRqbit()
    rqbit.manage(SHOW)
    let changes = 0
    const lists = new FileLists(new RqbitClient('http://r', rqbit.fetch), () => changes++)
    const withFiles: RqbitFile[] = files('B/x.mkv')
    lists.update([summary(A, 'Show'), { ...summary(B, 'B'), files: withFiles }])
    lists.update([summary(A, 'Show')])
    await flush()
    lists.update([summary(A, 'Show')])
    expect(rqbit.calls).toEqual([`GET /torrents/${A}`])
    expect(lists.map.get(A)?.map((file) => file.name)).toEqual(['Show/E01.mkv'])
    expect(lists.map.get(B)).toBe(withFiles)
    expect(changes).toBe(2)
  })

  test('a failed request is tried again on the next update', async () => {
    const rqbit = new FakeRqbit()
    const lists = new FileLists(new RqbitClient('http://r', rqbit.fetch), () => {})
    lists.update([summary(A, 'Show')])
    await flush()
    rqbit.manage(SHOW)
    lists.update([summary(A, 'Show')])
    await flush()
    expect(rqbit.calls).toEqual([`GET /torrents/${A}`, `GET /torrents/${A}`])
    expect(lists.map.has(A)).toBe(true)
  })
})
