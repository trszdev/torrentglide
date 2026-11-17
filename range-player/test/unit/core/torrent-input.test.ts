import { describe, expect, test } from 'bun:test'
import { infoHashFromBtih, parseMagnet, parseTorrentText, TorrentInputError } from '../../../src/core/torrent-input.ts'

const HEX = 'd6a7303d77548da786cc68793089a9a0413e928e'

function refusal(text: string): unknown {
  try {
    parseTorrentText(text)
  } catch (err) {
    return err
  }
  throw new Error(`accepted ${JSON.stringify(text)}`)
}

describe('parseTorrentText', () => {
  test('a magnet link keeps its URI and yields its info hash and name', () => {
    const uri = `magnet:?xt=urn:btih:${HEX.toUpperCase()}&dn=The+Odyssey&tr=udp%3A%2F%2Ftracker.example%3A1337`
    expect(parseTorrentText(`  ${uri}\n`)).toEqual({ kind: 'magnet', uri, infoHash: HEX, displayName: 'The Odyssey' })
  })

  test('a bare hex info hash becomes a magnet link', () => {
    expect(parseTorrentText(HEX.toUpperCase())).toEqual({
      kind: 'magnet',
      uri: `magnet:?xt=urn:btih:${HEX}`,
      infoHash: HEX,
      displayName: null,
    })
  })

  test('a bare base32 info hash becomes a hex magnet link', () => {
    expect(parseTorrentText(hexToBase32(HEX))).toEqual({
      kind: 'magnet',
      uri: `magnet:?xt=urn:btih:${HEX}`,
      infoHash: HEX,
      displayName: null,
    })
  })

  test('an http(s) URL is passed on for rqbit to fetch', () => {
    expect(parseTorrentText('https://example.org/files/movie.torrent')).toEqual({
      kind: 'url',
      url: 'https://example.org/files/movie.torrent',
    })
    expect(parseTorrentText('HTTP://example.org/a b.torrent')).toEqual({ kind: 'url', url: 'http://example.org/a%20b.torrent' })
  })

  test('anything else is refused with a code', () => {
    expect(refusal('  ')).toBeInstanceOf(TorrentInputError)
    expect(refusal('  ')).toMatchObject({ code: 'empty' })
    expect(refusal('just some words')).toMatchObject({ code: 'unrecognized' })
    expect(refusal('ftp://example.org/movie.torrent')).toMatchObject({ code: 'unrecognized' })
    expect(refusal('https://exa mple.org/x')).toMatchObject({ code: 'invalid-url', detail: 'https://exa mple.org/x' })
  })
})

describe('parseMagnet', () => {
  test('takes the first xt that is a v1 btih hash', () => {
    const uri = `magnet:?xt=urn:btmh:1220${'ab'.repeat(32)}&xt=urn:btih:nothash&xt=urn:btih:${HEX}`
    expect(parseMagnet(uri).infoHash).toBe(HEX)
  })

  test('a magnet without a btih hash has no info hash', () => {
    expect(parseMagnet('magnet:?dn=nothing')).toEqual({ infoHash: null, displayName: 'nothing' })
  })

  test('an empty dn is no name', () => {
    expect(parseMagnet(`magnet:?xt=urn:btih:${HEX}&dn=%20`)).toEqual({ infoHash: HEX, displayName: null })
  })
})

describe('infoHashFromBtih', () => {
  test('reads hex and base32 spellings into lowercase hex', () => {
    expect(infoHashFromBtih(HEX.toUpperCase())).toBe(HEX)
    expect(infoHashFromBtih(hexToBase32(HEX).toLowerCase())).toBe(HEX)
  })

  test('rejects wrong lengths and alphabets', () => {
    expect(infoHashFromBtih(HEX.slice(1))).toBeNull()
    expect(infoHashFromBtih('z'.repeat(40))).toBeNull()
    expect(infoHashFromBtih('1'.repeat(32))).toBeNull()
  })
})

function hexToBase32(hex: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of hex) bits += parseInt(char, 16).toString(2).padStart(4, '0')
  let out = ''
  for (let i = 0; i < bits.length; i += 5) out += alphabet[parseInt(bits.slice(i, i + 5), 2)]
  return out
}
