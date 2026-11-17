import { describe, expect, test } from 'bun:test'
import { reviewMailto, storeReviewUrl } from '../../src/services/review.ts'

describe('reviewMailto', () => {
  const context = { version: '0.1.0', browser: 'chrome' }

  test('addresses the review email, with the rating and the message', () => {
    const url = new URL(reviewMailto(2, 'Seeking stalls on HEVC files & more', context))
    expect(url.protocol).toBe('mailto:')
    expect(url.pathname).toBe('torrent.glide@mailservice.com.de')
    const params = new URLSearchParams(url.search)
    expect(params.get('subject')).toBe('TorrentGlide User Review')
    expect(params.get('body')).toBe('Seeking stalls on HEVC files & more\n\n★★☆☆☆ · TorrentGlide 0.1.0 · chrome')
  })

  test('encodes spaces as %20, which mail apps read', () => {
    expect(reviewMailto(1, 'a b', context)).toContain('subject=TorrentGlide%20User%20Review&body=a%20b')
  })

  test('without a message, the body is the rating line', () => {
    const body = new URLSearchParams(new URL(reviewMailto(3, '  ', context)).search).get('body')
    expect(body).toBe('★★★☆☆ · TorrentGlide 0.1.0 · chrome')
  })
})

test('storeReviewUrl points at the store of the browser the build is for', () => {
  expect(storeReviewUrl('chrome', 'abcdefghijklmnopabcdefghijklmnop')).toBe(
    'https://chromewebstore.google.com/detail/abcdefghijklmnopabcdefghijklmnop/reviews',
  )
  expect(storeReviewUrl('edge', 'abc')).toBe('https://microsoftedge.microsoft.com/addons/detail/abc')
})

// addons.mozilla.org finds an add-on by its listing's slug, not by the gecko
// id the manifest has: /addon/@rangeglide/reviews/ is a 404.
test('storeReviewUrl asks Firefox for the listing by its slug, whatever the id', () => {
  const reviews = 'https://addons.mozilla.org/firefox/addon/torrentglide/reviews/'
  expect(storeReviewUrl('firefox', '@rangeglide')).toBe(reviews)
  expect(storeReviewUrl('firefox', '6f3c1a52-1c3e-4f39-9c1b-6a5e0d9b7f11')).toBe(reviews)
})
