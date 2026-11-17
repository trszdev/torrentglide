import { describe, expect, test } from 'bun:test'
import { looksLikeTorrentFile, torrentFileName, torrentLink } from '../../src/services/torrent-links.ts'

const HASH = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c'

describe('torrentLink', () => {
  test('a magnet link, named after its dn', () => {
    const uri = `magnet:?xt=urn:btih:${HASH}&dn=Big+Buck+Bunny&tr=udp%3A%2F%2Fexplodie.org%3A6969`
    expect(torrentLink(uri)).toEqual({ kind: 'magnet', uri, name: 'Big Buck Bunny' })
    expect(torrentLink(`MAGNET:?xt=urn:btih:${HASH}`)).toMatchObject({ kind: 'magnet', name: null })
  })

  test('a link whose path ends in .torrent, named after its file', () => {
    expect(torrentLink('https://example.org/files/Big%20Buck%20Bunny.torrent?session=1')).toEqual({
      kind: 'torrent-file',
      url: 'https://example.org/files/Big%20Buck%20Bunny.torrent?session=1',
      name: 'Big Buck Bunny.torrent',
    })
    expect(torrentLink('http://example.org/a.TORRENT')).toMatchObject({ kind: 'torrent-file', name: 'a.TORRENT' })
  })

  test('a link that says it is a .torrent through its type or download attribute', () => {
    expect(torrentLink('https://tracker.example/dl.php?t=42', { type: 'application/x-bittorrent' })).toEqual({
      kind: 'torrent-file',
      url: 'https://tracker.example/dl.php?t=42',
      name: null,
    })
    expect(torrentLink('https://tracker.example/dl.php?t=42', { download: 'Movie.torrent' })).toMatchObject({
      kind: 'torrent-file',
      name: 'Movie.torrent',
    })
  })

  test('a link whose text mentions a .torrent, like rutracker’s “Скачать .torrent”', () => {
    expect(torrentLink('https://rutracker.org/forum/dl.php?t=6089733', { text: 'Скачать .torrent' })).toEqual({
      kind: 'torrent-file',
      url: 'https://rutracker.org/forum/dl.php?t=6089733',
      name: null,
    })
    expect(torrentLink('https://t.example/get?item=7', { text: 'Download .TORRENT file' })).toMatchObject({ kind: 'torrent-file' })
  })

  test('a tracker’s download script, asked for a torrent by id', () => {
    expect(torrentLink('https://rutracker.org/forum/dl.php?t=6089733')).toMatchObject({ kind: 'torrent-file', name: null })
    expect(torrentLink('https://tracker.example/download.php?id=42&name=x')).toMatchObject({ kind: 'torrent-file' })
    expect(torrentLink('https://tracker.example/download.php')).toBeNull()
    expect(torrentLink('https://tracker.example/download.php?file=setup.exe')).toBeNull()
  })

  test('anything else is left alone', () => {
    expect(torrentLink('https://tracker.example/get?t=42')).toBeNull()
    expect(torrentLink('https://example.org/how-torrents-work', { text: 'How torrents work' })).toBeNull()
    expect(torrentLink('https://example.org/torrent-guide.html')).toBeNull()
    expect(torrentLink('https://example.org/?file=a.torrent')).toBeNull()
    expect(torrentLink('ftp://example.org/a.torrent')).toBeNull()
    expect(torrentLink('javascript:void(0)')).toBeNull()
    expect(torrentLink('not a url')).toBeNull()
    expect(torrentLink('https://example.org/a', { download: 'a.zip', type: 'application/zip' })).toBeNull()
  })
})

describe('looksLikeTorrentFile', () => {
  const bytes = (text: string) => new TextEncoder().encode(text)

  test('a bencoded dictionary with an info dictionary', () => {
    expect(looksLikeTorrentFile(bytes('d8:announce3:url4:infod4:name1:aee'))).toBe(true)
    expect(looksLikeTorrentFile(bytes('d4:infod6:lengthi1eee'))).toBe(true)
  })

  test('not a web page, an empty body or another bencoded value', () => {
    expect(looksLikeTorrentFile(bytes('<!doctype html><title>Sign in</title>'))).toBe(false)
    expect(looksLikeTorrentFile(new Uint8Array())).toBe(false)
    expect(looksLikeTorrentFile(bytes('d8:announce3:urle'))).toBe(false)
    expect(looksLikeTorrentFile(bytes('l4:infod1:ae'))).toBe(false)
  })
})

describe('torrentFileName', () => {
  test("Content-Disposition's name comes first, the RFC 6266 spelling over the plain one", () => {
    expect(torrentFileName('https://t.example/dl.php?t=1', 'attachment; filename="Movie [1080p].torrent"')).toBe(
      'Movie [1080p].torrent',
    )
    expect(torrentFileName('https://t.example/dl.php?t=1', 'attachment; filename=plain.torrent')).toBe('plain.torrent')
    expect(
      torrentFileName(
        'https://t.example/dl.php?t=1',
        `attachment; filename="fallback.torrent"; filename*=UTF-8''%D0%A4%D0%B8%D0%BB%D1%8C%D0%BC.torrent`,
      ),
    ).toBe('Фильм.torrent')
  })

  test("then the link's name, the URL's file, or a generic name", () => {
    expect(torrentFileName('https://t.example/dl.php?t=1', 'attachment', 'From link.torrent')).toBe('From link.torrent')
    expect(torrentFileName('https://t.example/files/a%20b.torrent', null)).toBe('a b.torrent')
    expect(torrentFileName('https://t.example/dl.php?t=1', null)).toBe('download.torrent')
  })
})
