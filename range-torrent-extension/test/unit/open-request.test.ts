import { describe, expect, test } from 'bun:test'
import { decodeBase64, encodeBase64, openParam, parkOpenRequest, takeOpenRequest } from '../../src/services/open-request.ts'
import { memoryStorage } from '../../src/services/storage.ts'

test('.torrent bytes survive the trip through base64, past one String.fromCharCode batch', () => {
  const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 7919) % 256)
  const base64 = encodeBase64(bytes)
  expect(base64).toBe(Buffer.from(bytes).toString('base64'))
  expect(decodeBase64(base64)).toEqual(bytes)
})

describe('parking a request for the page (SPEC §10.1)', () => {
  test('the page takes it once', async () => {
    const area = memoryStorage()
    const id = await parkOpenRequest(area, { kind: 'text', text: 'magnet:?xt=urn:btih:x' }, 'id-1')
    expect(id).toBe('id-1')
    expect(await area.get(null)).toEqual({ 'open:id-1': { kind: 'text', text: 'magnet:?xt=urn:btih:x' } })
    expect(await takeOpenRequest(area, 'id-1')).toEqual({ kind: 'text', text: 'magnet:?xt=urn:btih:x' })
    expect(await takeOpenRequest(area, 'id-1')).toBeNull()
    expect(await area.get(null)).toEqual({})
  })

  test('something else under the key is no request', async () => {
    const area = memoryStorage({ 'open:x': { kind: 'torrent-file', base64: 1 } })
    expect(await takeOpenRequest(area, 'x')).toBeNull()
  })

  test('openParam takes ?open= off the URL and keeps the hash', () => {
    expect(openParam('chrome-extension://id/player.html?open=abc&x=1#hash')).toEqual({
      id: 'abc',
      url: 'chrome-extension://id/player.html?x=1#hash',
    })
    expect(openParam('chrome-extension://id/player.html#h')).toEqual({ id: null, url: 'chrome-extension://id/player.html#h' })
  })
})
