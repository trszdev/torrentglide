import { describe, expect, test } from 'bun:test'
import type { RqbitStats } from '../../../src/core/rqbit.ts'
import type { OpenedTorrent } from '../../../src/core/session.ts'
import { reduce, type PlayerEvent } from '../../../src/controller/machine.ts'
import { initialState, isBusy, markedFile, type PlayerState } from '../../../src/controller/state.ts'
import { files } from '../fakes/files.ts'

const SEASON: OpenedTorrent = {
  infoHash: 'a'.repeat(40),
  name: 'Show.S01',
  files: files('Show.S01E01.mkv', 'Show.S01E02.mkv', 'Show.S01E01.en.srt'),
  managed: true,
  torrentBytes: null,
}
const MOVIE: OpenedTorrent = {
  infoHash: 'b'.repeat(40),
  name: 'Movie',
  files: files('Movie.mkv', 'Movie.en.srt'),
  managed: false,
  torrentBytes: new Uint8Array([1]),
}
const STATS = { state: 'live', file_progress: [0, 0, 0] } as unknown as RqbitStats
const ERROR = { code: 'rqbit', detail: 'boom' } as const

function run(state: PlayerState, ...events: PlayerEvent[]): PlayerState {
  return events.reduce(reduce, state)
}

/** SEASON open, file `index` playing, with some state of its own. */
function playing(index = 0): PlayerState {
  return run(
    initialState,
    { type: 'open', step: { kind: 'opening' }, at: 0 },
    { type: 'opened', torrent: SEASON, play: index },
    { type: 'prepared', torrent: SEASON, index },
    { type: 'media', event: 'loadedmetadata' },
    { type: 'stats', infoHash: SEASON.infoHash, stats: STATS },
    { type: 'toggle-group', key: 'g' },
  )
}

describe('open', () => {
  test('from any phase: opening, the wait timed, layers cleared, the shown video kept', () => {
    const before = run(playing(), { type: 'error', error: ERROR }, { type: 'notify', notice: { kind: 'busy', text: 'x' } })
    const state = reduce(before, { type: 'open', step: { kind: 'resolving', name: 'Movie' }, at: 100 })
    expect(state).toMatchObject({
      phase: { name: 'opening', step: { kind: 'resolving', name: 'Movie' } },
      torrent: SEASON,
      shown: 0,
      error: null,
      hostNotice: null,
      busySince: 100,
    })
    expect(isBusy(state.phase)).toBe(true)
  })
})

describe('opened', () => {
  test('another torrent with a file to play: preparing it, the old file, stats and folds dropped', () => {
    const state = run(playing(), { type: 'open', step: { kind: 'opening' }, at: 5 }, { type: 'opened', torrent: MOVIE, play: 0 })
    expect(state).toMatchObject({
      phase: { name: 'preparing', index: 0, step: { kind: 'preparing' } },
      torrent: MOVIE,
      shown: null,
      stats: null,
      menuOpen: false,
      busySince: 5,
    })
    expect(state.collapsed.size).toBe(0)
  })

  test('nothing to play: choosing, not busy', () => {
    const state = run(initialState, { type: 'open', step: { kind: 'opening' }, at: 5 }, { type: 'opened', torrent: SEASON, play: null })
    expect(state).toMatchObject({ phase: { name: 'choosing' }, torrent: SEASON, busySince: null })
  })

  test('the torrent already playing: playback, stats and folds stay', () => {
    const before = playing(1)
    const state = run(before, { type: 'open', step: { kind: 'opening' }, at: 5 }, { type: 'opened', torrent: SEASON, play: null })
    expect(state).toMatchObject({ phase: { name: 'playing', index: 1 }, shown: 1, stats: STATS, busySince: null })
    expect(state.collapsed).toEqual(new Set(['g']))
  })
})

describe('failed', () => {
  test('opening fails back to what was there, with the error', () => {
    const open = { type: 'open', step: { kind: 'opening' }, at: 0 } as const
    const failed = { type: 'failed', error: ERROR } as const
    expect(run(initialState, open, failed)).toMatchObject({ phase: { name: 'idle' }, error: ERROR, busySince: null })
    expect(run(playing(1), open, failed)).toMatchObject({ phase: { name: 'playing', index: 1 }, error: ERROR })
    const choosing = run(initialState, open, { type: 'opened', torrent: SEASON, play: null })
    expect(run(choosing, open, failed)).toMatchObject({ phase: { name: 'choosing' }, error: ERROR })
  })

  test('preparing fails back to the shown file, or to choosing', () => {
    const failed = { type: 'failed', error: ERROR } as const
    expect(run(playing(0), { type: 'play', index: 1, at: 9 }, failed)).toMatchObject({
      phase: { name: 'playing', index: 0 },
      error: ERROR,
      busySince: null,
    })
    const first = run(initialState, { type: 'open', step: { kind: 'opening' }, at: 0 }, { type: 'opened', torrent: SEASON, play: 1 })
    expect(reduce(first, failed)).toMatchObject({ phase: { name: 'choosing' }, error: ERROR })
  })
})

describe('play', () => {
  test('preparing the file, marked at once, the menu closed and the layers cleared', () => {
    const before = run(playing(0), { type: 'menu', open: true }, { type: 'error', error: ERROR })
    const state = reduce(before, { type: 'play', index: 1, at: 7 })
    expect(state).toMatchObject({
      phase: { name: 'preparing', index: 1, step: { kind: 'preparing' } },
      shown: 0,
      menuOpen: false,
      error: null,
      busySince: 7,
    })
    expect(markedFile(state)).toBe(1)
  })

  test('without a torrent nothing happens', () => {
    expect(reduce(initialState, { type: 'play', index: 0, at: 1 })).toBe(initialState)
  })
})

describe('preparing', () => {
  test("follows prepareStream's steps", () => {
    const state = run(playing(0), { type: 'play', index: 1, at: 0 }, { type: 'prepare-step', step: { kind: 'checking', percent: 40 } })
    expect(state.phase).toEqual({ name: 'preparing', index: 1, step: { kind: 'checking', percent: 40 } })
  })

  test('a step after the phase moved on is dropped', () => {
    const before = playing(0)
    expect(reduce(before, { type: 'prepare-step', step: { kind: 'adding' } })).toBe(before)
  })

  test('prepared: buffering the file, now shown, with the fresh torrent', () => {
    const fresh = { ...MOVIE, managed: true, torrentBytes: null }
    const state = run(
      initialState,
      { type: 'open', step: { kind: 'opening' }, at: 0 },
      { type: 'opened', torrent: MOVIE, play: 0 },
      { type: 'prepared', torrent: fresh, index: 0 },
    )
    expect(state).toMatchObject({ phase: { name: 'buffering', index: 0 }, shown: 0, torrent: fresh, busySince: 0 })
  })
})

describe('media', () => {
  const buffering = () => run(playing(0), { type: 'play', index: 1, at: 0 }, { type: 'prepared', torrent: SEASON, index: 1 })

  test('loadedmetadata or movi’s error screen end the buffering', () => {
    for (const event of ['loadedmetadata', 'errordisplay'] as const) {
      expect(reduce(buffering(), { type: 'media', event })).toMatchObject({ phase: { name: 'playing', index: 1 }, busySince: null })
    }
  })

  test('loadedmetadata of the old file while another prepares changes nothing', () => {
    const before = run(playing(0), { type: 'play', index: 1, at: 0 })
    expect(reduce(before, { type: 'media', event: 'loadedmetadata' })).toBe(before)
  })

  test('ended opens the menu when there is another file', () => {
    expect(reduce(playing(0), { type: 'media', event: 'ended' }).menuOpen).toBe(true)
  })

  test('ended with a single file leaves the menu shut', () => {
    const single = run(
      initialState,
      { type: 'open', step: { kind: 'opening' }, at: 0 },
      { type: 'opened', torrent: MOVIE, play: 0 },
      { type: 'prepared', torrent: MOVIE, index: 0 },
      { type: 'media', event: 'loadedmetadata' },
    )
    expect(reduce(single, { type: 'media', event: 'ended' }).menuOpen).toBe(false)
  })
})

describe('layers', () => {
  test('a host notice replaces the error, and an error replaces the notice', () => {
    const noticed = run(playing(), { type: 'error', error: ERROR }, { type: 'notify', notice: { kind: 'busy', text: 'Removing' } })
    expect(noticed).toMatchObject({ error: null, hostNotice: { kind: 'busy', text: 'Removing' } })
    expect(reduce(noticed, { type: 'error', error: ERROR })).toMatchObject({ error: ERROR, hostNotice: null })
  })

  test('an error leaves the phase alone; dismissing clears it', () => {
    const state = reduce(playing(1), { type: 'error', error: ERROR })
    expect(state.phase).toEqual({ name: 'playing', index: 1 })
    expect(reduce(state, { type: 'dismiss-error' }).error).toBeNull()
  })

  test("dismissing closes the host's error too, never its busy message", () => {
    const error = run(playing(), { type: 'notify', notice: { kind: 'error', text: 'x' } }, { type: 'dismiss-error' })
    expect(error.hostNotice).toBeNull()
    const busy = run(playing(), { type: 'notify', notice: { kind: 'busy', text: 'x' } }, { type: 'dismiss-error' })
    expect(busy.hostNotice).toEqual({ kind: 'busy', text: 'x' })
  })

  test('notify(null) takes the notice away', () => {
    const state = run(playing(), { type: 'notify', notice: { kind: 'error', text: 'x' } }, { type: 'notify', notice: null })
    expect(state.hostNotice).toBeNull()
  })
})

describe('menu, groups, stats', () => {
  test('the menu opens and closes', () => {
    expect(run(playing(), { type: 'menu', open: true }).menuOpen).toBe(true)
    expect(run(playing(), { type: 'menu', open: true }, { type: 'menu', open: false }).menuOpen).toBe(false)
  })

  test('a group folds and unfolds', () => {
    expect(run(playing(), { type: 'toggle-group', key: 'g' }).collapsed).toEqual(new Set())
    expect(run(playing(), { type: 'toggle-group', key: 'h' }).collapsed).toEqual(new Set(['g', 'h']))
  })

  test('stats of a torrent no longer open are dropped', () => {
    const before = playing()
    expect(reduce(before, { type: 'stats', infoHash: MOVIE.infoHash, stats: STATS })).toBe(before)
  })
})

describe('close', () => {
  test('from any phase: back to the empty player', () => {
    expect(reduce(playing(), { type: 'close' })).toEqual(initialState)
    expect(run(initialState, { type: 'open', step: { kind: 'opening' }, at: 0 }, { type: 'close' })).toEqual(initialState)
  })
})
