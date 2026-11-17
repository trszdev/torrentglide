import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_SETTINGS,
  normalizeRqbitUrl,
  readSettings,
  rqbitUrlFromField,
  saveOutcome,
  saveSettings,
  watchSettings,
  type Settings,
} from '../../src/services/settings.ts'
import { memoryStorage } from '../../src/services/storage.ts'
import { flush } from './fakes/rqbit.ts'

describe('readSettings', () => {
  test('defaults: rqbit on this computer, the system theme, the browser’s language', async () => {
    expect(await readSettings(memoryStorage())).toEqual({
      rqbitUrl: 'http://localhost:3030',
      theme: 'system',
      language: 'auto',
    })
  })

  test('takes stored values, and the default for one that isn’t valid', async () => {
    const area = memoryStorage({ rqbitUrl: 'http://127.0.0.1:3041', theme: 'dark', language: 'ru' })
    expect(await readSettings(area)).toEqual({ rqbitUrl: 'http://127.0.0.1:3041', theme: 'dark', language: 'ru' })
    const broken = memoryStorage({ rqbitUrl: 'ftp://x', theme: 'blue', language: 'xx' })
    expect(await readSettings(broken)).toEqual(DEFAULT_SETTINGS)
  })
})

test('saveSettings writes only the given keys', async () => {
  const area = memoryStorage({ theme: 'dark' })
  await saveSettings(area, { language: 'de' })
  expect(await area.get(null)).toEqual({ theme: 'dark', language: 'de' })
})

test('watchSettings gives the whole settings on a change of one, and ignores other keys', async () => {
  const area = memoryStorage()
  const seen: Settings[] = []
  const stop = watchSettings(area, (settings) => seen.push(settings))
  await area.set({ 'incognito:abc': { addedAt: 1 } })
  await saveSettings(area, { theme: 'light' })
  await flush()
  stop()
  expect(seen).toEqual([{ ...DEFAULT_SETTINGS, theme: 'light' }])
})

describe('normalizeRqbitUrl', () => {
  test('keeps http(s) addresses, without a trailing slash', () => {
    expect(normalizeRqbitUrl(' http://localhost:3030/ ')).toBe('http://localhost:3030')
    expect(normalizeRqbitUrl('https://nas.lan/rqbit/')).toBe('https://nas.lan/rqbit')
    expect(normalizeRqbitUrl('http://192.168.1.20:3030')).toBe('http://192.168.1.20:3030')
  })

  test('adds http:// when no scheme is given', () => {
    expect(normalizeRqbitUrl('localhost:3030')).toBe('http://localhost:3030')
    expect(normalizeRqbitUrl('127.0.0.1:3031')).toBe('http://127.0.0.1:3031')
  })

  test('refuses anything that is not an http(s) address, with a code', () => {
    const error = (text: string) => {
      try {
        normalizeRqbitUrl(text)
      } catch (err) {
        return err
      }
    }
    expect(error('')).toMatchObject({ name: 'RqbitUrlError', code: 'empty' })
    expect(error('ftp://localhost:3030')).toMatchObject({ code: 'not-http' })
    expect(error('http://')).toMatchObject({ code: 'invalid', detail: 'http://' })
  })
})

test('an empty address field means the default address', () => {
  expect(rqbitUrlFromField('  ')).toBe('http://localhost:3030')
  expect(rqbitUrlFromField('127.0.0.1:3041/')).toBe('http://127.0.0.1:3041')
})

describe('saveOutcome (SPEC §7.1)', () => {
  const saved = DEFAULT_SETTINGS

  test('theme only: save and close', () => {
    expect(saveOutcome(saved, { ...saved, theme: 'dark' })).toEqual({ kind: 'close' })
  })

  test('the language: save and reload the page', () => {
    expect(saveOutcome(saved, { ...saved, language: 'ja' })).toEqual({ kind: 'reload' })
  })

  test('the address: ask for its host first, then open the page again without its hash', () => {
    expect(saveOutcome(saved, { ...saved, rqbitUrl: 'https://nas.lan:8443/rqbit', language: 'ja' })).toEqual({
      kind: 'reopen',
      permission: 'https://nas.lan/*',
    })
  })
})
