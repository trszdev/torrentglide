import { describe, expect, test } from 'bun:test'
import { formatRoute, parseRoute } from '../../../src/core/route.ts'

const HASH = '7d4a070ac2bb74f7f4e3c574128b8eec4f747081'

describe('parseRoute', () => {
  test('reads a torrent and its file', () => {
    expect(parseRoute(`#${HASH}/3`)).toEqual({ infoHash: HASH, fileIndex: 3 })
  })

  test('a torrent without a file leaves the pick to the player', () => {
    expect(parseRoute(`#${HASH}`)).toEqual({ infoHash: HASH, fileIndex: null })
  })

  test('takes an uppercase hash, and the hash without its #', () => {
    expect(parseRoute(`#${HASH.toUpperCase()}/0`)).toEqual({ infoHash: HASH, fileIndex: 0 })
    expect(parseRoute(`${HASH}/1`)).toEqual({ infoHash: HASH, fileIndex: 1 })
  })

  test('anything else is no route', () => {
    for (const hash of ['', '#', `#${HASH}/`, `#${HASH}/x`, `#${HASH}/1/2`, `#${HASH.slice(1)}`, '#hello']) {
      expect(parseRoute(hash)).toBeNull()
    }
  })
})

describe('formatRoute', () => {
  test('is what parseRoute reads', () => {
    expect(formatRoute({ infoHash: HASH, fileIndex: 3 })).toBe(`#${HASH}/3`)
    expect(formatRoute({ infoHash: HASH, fileIndex: null })).toBe(`#${HASH}`)
  })
})
