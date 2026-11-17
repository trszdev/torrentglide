import { describe, expect, test } from 'bun:test'
import {
  createTranslator,
  isLanguage,
  LANGUAGES,
  languageName,
  resolveLanguage,
  type Message,
} from '../../../src/core/i18n.ts'

describe('LANGUAGES', () => {
  test('the twelve languages of the spec, English first', () => {
    expect(LANGUAGES.map((language) => language.code)).toEqual([
      'en', 'de', 'es', 'fr', 'it', 'pt-BR', 'pl', 'tr', 'ru', 'uk', 'ja', 'zh-CN',
    ])
  })

  test('isLanguage and languageName', () => {
    expect(isLanguage('pt-BR')).toBe(true)
    expect(isLanguage('pt')).toBe(false)
    expect(isLanguage(undefined)).toBe(false)
    expect(languageName('ru')).toBe('Русский')
  })
})

describe('resolveLanguage', () => {
  test('the first preferred language with a translation, by its tag or its base language', () => {
    expect(resolveLanguage(['ru-RU', 'en-US'])).toBe('ru')
    expect(resolveLanguage(['de-AT'])).toBe('de')
    expect(resolveLanguage(['pt-BR'])).toBe('pt-BR')
    expect(resolveLanguage(['pt-PT'])).toBe('pt-BR')
    expect(resolveLanguage(['nl-NL', 'fr-CA', 'en'])).toBe('fr')
    expect(resolveLanguage(['UK'])).toBe('uk')
  })

  test('Chinese: only Simplified', () => {
    expect(resolveLanguage(['zh-CN'])).toBe('zh-CN')
    expect(resolveLanguage(['zh'])).toBe('zh-CN')
    expect(resolveLanguage(['zh-Hans-SG'])).toBe('zh-CN')
    expect(resolveLanguage(['zh-TW', 'en-US'])).toBe('en')
    expect(resolveLanguage(['zh-Hant-HK', 'ja'])).toBe('ja')
  })

  test('English when nothing matches', () => {
    expect(resolveLanguage(['nl', 'sv-SE'])).toBe('en')
    expect(resolveLanguage([])).toBe('en')
  })
})

describe('createTranslator', () => {
  const english = {
    hello: 'Hello, {name}',
    files: { one: '{n} file', other: '{n} files' },
    only: 'Only in English',
  } satisfies Record<string, Message>
  const catalogs = {
    ru: {
      hello: 'Привет, {name}',
      files: { one: '{n} файл', few: '{n} файла', many: '{n} файлов', other: '{n} файла' },
      only: 'Только по-английски',
    },
  }

  test('fills placeholders and leaves unknown ones as they are', () => {
    const { t } = createTranslator('en', english, catalogs)
    expect(t('hello', { name: 'Ann' })).toBe('Hello, Ann')
    expect(t('hello')).toBe('Hello, {name}')
  })

  test("picks plural forms by n, by the language's own rules", () => {
    const ru = createTranslator('ru', english, catalogs)
    expect([1, 2, 5, 11, 21, 22].map((n) => ru.t('files', { n }))).toEqual([
      '1 файл', '2 файла', '5 файлов', '11 файлов', '21 файл', '22 файла',
    ])
    expect(createTranslator('en', english, catalogs).t('files', { n: 1 })).toBe('1 file')
  })

  test('English for a language without a catalog', () => {
    const ja = createTranslator('ja', english, catalogs)
    expect(ja.language).toBe('ja')
    expect(ja.t('only')).toBe('Only in English')
  })
})
