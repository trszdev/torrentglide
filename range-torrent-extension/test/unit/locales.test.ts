import { describe, expect, test } from 'bun:test'
import { LANGUAGES, type Message } from 'range-player/core'
import { CATALOGS, extensionText, languageFor } from '../../src/i18n.ts'
import { en } from '../../src/locales/en.ts'

/** The placeholders of each form of a message. */
const placeholders = (message: Message) =>
  (typeof message === 'string' ? [message] : Object.values(message)).map((form) =>
    [...form!.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(','),
  )

describe('translations (SPEC §12)', () => {
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

  test('the groups of the spec, the player’s host keys included', () => {
    const count = (pattern: RegExp) => Object.keys(en).filter((key) => pattern.test(key)).length
    expect({
      common: count(/^common\./),
      page: count(/^page\./),
      rqbit: count(/^rqbit\./),
      settings: count(/^settings\./),
      url: count(/^url\./),
      incognito: count(/^incognito\./),
      install: count(/^install\./),
      review: count(/^review\./),
      card: count(/^card\./),
      menu: count(/^menu\./),
      history: count(/^history\./),
      open: count(/^open\./),
      remove: count(/^remove\./),
      drop: count(/^player\.drop$/),
      removing: count(/^status\.removing/),
    }).toEqual({
      common: 2, page: 1, rqbit: 7, settings: 13, url: 3, incognito: 2, install: 37, review: 15, card: 14, menu: 1,
      history: 8, open: 5, remove: 6, drop: 1, removing: 2,
    })
  })
})

test('extensionText speaks its language, plurals included', () => {
  expect(extensionText('ru').t('rqbit.start')).toBe('Запустить')
  expect(extensionText('en').t('review.stars', { n: 1 })).toBe('1 star')
  expect(extensionText('en').t('review.stars', { n: 4 })).toBe('4 stars')
})

test('languageFor: a chosen language as is; “auto” the browser’s first one with a translation, else English', () => {
  expect(languageFor('de', ['ru-RU'])).toBe('de')
  expect(languageFor('auto', ['xx', 'pt-BR', 'ru'])).toBe('pt-BR')
  expect(languageFor('auto', ['xx'])).toBe('en')
})
