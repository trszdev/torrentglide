import { describe, expect, test } from 'bun:test'
import { LANGUAGES, type Message } from '../../../src/core/i18n.ts'
import type { RqbitStats } from '../../../src/core/rqbit.ts'
import type { OpenedTorrent } from '../../../src/core/session.ts'
import { parseTorrentText, type TorrentInputError } from '../../../src/core/torrent-input.ts'
import { CATALOGS, playerText } from '../../../src/view/i18n.ts'
import { en } from '../../../src/view/locales/en.ts'
import { busyText, connectionRows, errorText, inputErrorText, withElapsed } from '../../../src/view/text.ts'
import { files } from '../fakes/files.ts'

const text = playerText('en')

/** The placeholders of each form of a message. */
const placeholders = (message: Message) =>
  (typeof message === 'string' ? [message] : Object.values(message)).map((form) =>
    [...form!.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(','),
  )

describe('translations', () => {
  test('one catalog per language', () => {
    expect(Object.keys(CATALOGS).sort()).toEqual(LANGUAGES.map((language) => language.code).sort())
  })

  for (const [code, catalog] of Object.entries(CATALOGS)) {
    test(`${code}: the keys and placeholders of English`, () => {
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort())
      for (const [key, english] of Object.entries(en)) {
        const want = placeholders(english)[0]
        for (const got of placeholders((catalog as Record<string, Message>)[key]!)) expect(`${key}: ${got}`).toBe(`${key}: ${want}`)
      }
    })
  }

  test("only the player's keys: the host's moved to the extension (SPEC §7)", () => {
    expect(Object.keys(en).filter((key) => /^(history|open|remove)\.|^status\.removing|^player\.drop|^common\.cancel/.test(key))).toEqual([])
  })
})

describe('busyText', () => {
  test('says what opening waits on', () => {
    expect(busyText(text, { name: 'opening', step: { kind: 'resolving', name: 'Movie' } })).toBe(
      'Resolving “Movie” — the torrent service is asking peers for the torrent’s metadata…',
    )
    expect(busyText(text, { name: 'opening', step: { kind: 'resolving', name: null } })).toStartWith('Resolving the magnet link')
    expect(busyText(text, { name: 'opening', step: { kind: 'fetching' } })).toBe('The torrent service is fetching the .torrent file…')
    expect(busyText(text, { name: 'opening', step: { kind: 'reading', name: 'a.torrent' } })).toBe('Reading a.torrent…')
    expect(busyText(text, { name: 'opening', step: { kind: 'opening' } })).toBe('Opening…')
  })

  test('says what preparing and buffering wait on', () => {
    const preparing = (step: object) => busyText(text, { name: 'preparing', index: 0, step } as never)
    expect(preparing({ kind: 'preparing' })).toBe('Preparing the stream…')
    expect(preparing({ kind: 'adding' })).toBe('Adding the torrent…')
    expect(preparing({ kind: 'checking', percent: 40 })).toBe('The torrent service is checking data already on disk… 40%')
    expect(preparing({ kind: 'checking', percent: null })).toBe('The torrent service is checking data already on disk…')
    expect(preparing({ kind: 'resuming' })).toBe('Resuming the torrent…')
    expect(busyText(text, { name: 'buffering', index: 0 })).toStartWith('Buffering')
  })

  test('nothing for a phase that does not wait', () => {
    expect(busyText(text, { name: 'playing', index: 0 })).toBeNull()
    expect(busyText(text, { name: 'choosing' })).toBeNull()
    expect(busyText(text, { name: 'idle' })).toBeNull()
  })

  test('the counter joins from the third second', () => {
    expect(withElapsed(text, 'Opening…', 1_000, 3_999)).toBe('Opening…')
    expect(withElapsed(text, 'Opening…', 1_000, 4_000)).toBe('Opening… 3 s')
  })

  test('in the player’s language', () => {
    expect(busyText(playerText('ru'), { name: 'opening', step: { kind: 'opening' } })).not.toBe('Opening…')
  })
})

describe('errorText', () => {
  test('each code in words; rqbit’s own errors as they are', () => {
    expect(errorText(text, { code: 'input-empty', detail: '' })).toBe('Enter a magnet link, an info hash or a .torrent URL.')
    expect(errorText(text, { code: 'input-invalid-url', detail: 'http://a b' })).toBe('Not a valid URL: http://a b')
    expect(errorText(text, { code: 'rqbit-unreachable', detail: '/rqbit' })).toBe(
      'The torrent service isn’t reachable at /rqbit. Is it running?',
    )
    expect(errorText(text, { code: 'no-file', detail: '7' })).toBe('The torrent has no file #7.')
    expect(errorText(text, { code: 'torrent-error', detail: 'disk full' })).toBe('The torrent service can’t run this torrent: disk full')
    expect(errorText(text, { code: 'pause-failed', detail: 'boom' })).toBe('Couldn’t pause the other downloads: boom')
    expect(errorText(text, { code: 'rqbit', detail: 'torrent not found' })).toBe('torrent not found')
  })
})

describe('inputErrorText', () => {
  test("parseTorrentText's errors as the player words them, for a host's own field", () => {
    const words = (input: string) => {
      try {
        parseTorrentText(input)
        return null
      } catch (err) {
        return inputErrorText(playerText('ru'), err as TorrentInputError)
      }
    }
    expect(words(' ')).toBe(playerText('ru').t('error.inputEmpty'))
    expect(words('https://a b')).toBe(playerText('ru').t('error.inputInvalidUrl', { value: 'https://a b' }))
    expect(words('hello')).toBe(playerText('ru').t('error.inputUnrecognized'))
  })
})

describe('connectionRows', () => {
  const torrent: OpenedTorrent = {
    infoHash: 'a'.repeat(40),
    name: 'Movie',
    files: files('Movie.mkv:100'),
    managed: true,
    torrentBytes: null,
  }
  const MB = 1024 * 1024
  const stats = (patch: object) =>
    ({ state: 'live', error: null, file_progress: [25 * MB], live: { download_speed: { human_readable: '1.5 MiB/s' }, snapshot: { peer_stats: { live: 3 } } }, ...patch }) as unknown as RqbitStats

  test('before the first answer: …', () => {
    expect(connectionRows(text, torrent, 0, null).map((row) => row.value)).toEqual(['…', '…', '…'])
  })

  test('live: progress, speed, peers', () => {
    expect(connectionRows(text, torrent, 0, stats({})).map((row) => row.value)).toEqual(['25.0 MB / 100 MB (25%)', '1.5 MiB/s', '3'])
  })

  test('complete, paused, with an error', () => {
    const rows = connectionRows(text, torrent, 0, stats({ state: 'paused', file_progress: [100 * MB], live: null, error: 'disk full' }))
    expect(rows.map((row) => [row.key, row.value])).toEqual([
      ['downloaded', '100 MB · complete'],
      ['speed', 'paused'],
      ['peers', 'paused'],
      ['error', 'disk full'],
    ])
  })
})
