import { describe, expect, test } from 'bun:test'
import {
  fileName,
  filePath,
  formatBytes,
  matchSubtitles,
  mediaFiles,
  mediaKind,
  pickDefaultFile,
} from '../../../src/core/media.ts'
import { files } from '../fakes/files.ts'

describe('mediaKind', () => {
  test('classifies by extension, case aside', () => {
    expect(mediaKind('Movie.2014.MKV')).toBe('video')
    expect(mediaKind('clip.m2ts')).toBe('video')
    expect(mediaKind('track01.flac')).toBe('audio')
    expect(mediaKind('Movie.en.srt')).toBe('subtitle')
    expect(mediaKind('Movie.dfxp')).toBe('subtitle')
    expect(mediaKind('Movie.ass')).toBe('other') // movi reads ASS only muxed in
    expect(mediaKind('release.nfo')).toBe('other')
    expect(mediaKind('README')).toBe('other')
    expect(mediaKind('.mkv')).toBe('other')
  })
})

describe('fileName and filePath', () => {
  test("the name is the last path component: rqbit's `name` is the whole path", () => {
    const [nested, top] = files('Sample/sample.mkv', 'movie.mkv')
    expect(fileName(nested!)).toBe('sample.mkv')
    expect(filePath(nested!)).toBe('Sample/sample.mkv')
    expect(fileName(top!)).toBe('movie.mkv')
  })
})

describe('mediaFiles', () => {
  test('the videos, without padding', () => {
    expect(mediaFiles(files('Movie.mkv', 'Movie.en.srt', 'theme.mp3', '.pad/1.mkv', 'Extras/a.mp4'))).toEqual([0, 4])
  })

  test('the audio files when there is no video', () => {
    expect(mediaFiles(files('Album/01.flac', 'Album/cover.jpg', 'Album/02.flac'))).toEqual([0, 2])
  })
})

describe('pickDefaultFile', () => {
  test('a film next to its sample: the film', () => {
    expect(pickDefaultFile(files('Sample/sample.mkv:40', 'Movie.mkv:4000', 'Movie.nfo:0'))).toBe(1)
  })

  test('the only playable file, even audio', () => {
    expect(pickDefaultFile(files('cover.jpg', 'album.flac:300'))).toBe(1)
  })

  test('a season of similar episodes: no pick', () => {
    expect(pickDefaultFile(files('S01E01.mkv:900', 'S01E02.mkv:950', 'S01E03.mkv:920'))).toBeNull()
  })

  test('exactly half of the video bytes is not enough', () => {
    expect(pickDefaultFile(files('A.mkv:500', 'B.mkv:250', 'C.mkv:250'))).toBeNull()
  })

  test('an album of several tracks: no pick', () => {
    expect(pickDefaultFile(files('01.flac:30', '02.flac:300'))).toBeNull()
  })

  test('nothing playable: no pick', () => {
    expect(pickDefaultFile(files('book.pdf', 'notes.txt'))).toBeNull()
  })

  test('padding files never count', () => {
    expect(pickDefaultFile(files('.pad/0.mkv:5000', 'Movie.mkv:4000'))).toBe(1)
  })
})

describe('matchSubtitles', () => {
  test('files named after the video, anywhere in the torrent, come first', () => {
    const torrent = files(
      'Show/S01E01.mkv:900',
      'Show/S01E02.mkv:900',
      'Show/Subs/S01E01.en.srt',
      'Show/Subs/S01E01.Russian.forced.srt',
      'Show/Subs/S01E02.en.srt',
    )
    expect(matchSubtitles(torrent, 0)).toEqual([
      { index: 2, format: 'srt', label: 'English', lang: 'en' },
      { index: 3, format: 'srt', label: 'Russian forced', lang: 'ru' },
    ])
  })

  test('then files in a folder named after the video', () => {
    const torrent = files('Show.S01E01.mkv:900', 'Show.S01E02.mkv:900', 'Subs/Show.S01E01/2_English.srt', 'Subs/Show.S01E02/2_English.srt')
    expect(matchSubtitles(torrent, 1)).toEqual([{ index: 3, format: 'srt', label: 'English', lang: 'en' }])
  })

  test('then, for the only video, every subtitle file', () => {
    const torrent = files('It.Follows.2014.mkv:4000', 'Subs/It.Follows.eng.vtt', 'Subs/french.dfxp')
    expect(matchSubtitles(torrent, 0)).toEqual([
      { index: 1, format: 'vtt', label: 'It Follows eng', lang: 'en' },
      { index: 2, format: 'ttml', label: 'French', lang: 'fr' },
    ])
  })

  test('the language is read from the last word first, so a title word does not win', () => {
    const torrent = files('Film.mkv', 'Subs/It.Follows.fre.srt', 'Subs/Commentary.srt')
    expect(matchSubtitles(torrent, 0)).toEqual([
      { index: 1, format: 'srt', label: 'It Follows fre', lang: 'fr' },
      { index: 2, format: 'srt', label: 'Commentary', lang: '' },
    ])
  })

  test('loose subtitles are not guessed at for one episode of many', () => {
    expect(matchSubtitles(files('E01.mkv:900', 'E02.mkv:900', 'Subs/English.srt'), 0)).toEqual([])
  })

  test('a file that is not there has no subtitles', () => {
    expect(matchSubtitles(files('Movie.mkv', 'Movie.srt'), 5)).toEqual([])
  })
})

describe('formatBytes', () => {
  test('binary units, a decimal below 100', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(2223881447)).toBe('2.1 GB')
    expect(formatBytes(20627042868)).toBe('19.2 GB')
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB')
    expect(formatBytes(3 * 1024 ** 5)).toBe('3072 TB')
  })
})
