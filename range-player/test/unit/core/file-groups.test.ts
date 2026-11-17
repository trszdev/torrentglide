import { describe, expect, test } from 'bun:test'
import { groupFiles } from '../../../src/core/file-groups.ts'
import { files } from '../fakes/files.ts'

/** Groups as "kind dir | name: label, label" lines. */
function groups(...paths: string[]): string[] {
  return groupFiles(files(...paths)).map(
    (group) => `${group.kind} ${group.dir} | ${group.name}: ${group.files.map((file) => file.label).join(', ')}`,
  )
}

describe('groupFiles: the table of SPEC §6.2', () => {
  test('episodes: a group named by the shared start and end, files by their numbers', () => {
    expect(groups('Show.S01E01.1080p.WEB.mkv', 'Show.S01E02.1080p.WEB.mkv', 'Show.S01E03.1080p.WEB.mkv')).toEqual([
      'series  | Show.S01E … 1080p.WEB: 01, 02, 03',
    ])
  })

  test('roman numerals group too, in the order of their values', () => {
    expect(groups('Rocky II.mkv', 'Rocky III.mkv', 'Rocky IV.mkv')).toEqual(['series  | Rocky …: II, III, IV'])
    expect(groups('Rocky IX.mkv', 'Rocky V.mkv', 'Rocky IV.mkv', 'Rocky II.mkv')).toEqual(['series  | Rocky …: II, IV, V, IX'])
  })

  test('words in a folder: a group named by the folder', () => {
    expect(groups('Extras/Behind the Scenes.mkv', 'Extras/Bloopers.mkv')).toEqual([
      'folder Extras | Extras: Behind the Scenes, Bloopers',
    ])
  })

  test('numbered titles in a folder: a group named by the folder', () => {
    expect(groups('Course/01 - Intro.mp4', 'Course/02 - Setup.mp4')).toEqual(['folder Course | Course: 01 - Intro, 02 - Setup'])
  })

  test('an empty label is not a number: the folder groups them', () => {
    expect(groups('Show/Show.mkv', 'Show/Show.Extended.mkv')).toEqual(['folder Show | Show: Show, Show.Extended'])
  })

  test('a file whose label is a word stays out of the episodes, in the folder group', () => {
    expect(groups('Pack/sample.mkv', 'Pack/Show.S01.Extras.mkv', 'Pack/Show.S01E01.mkv', 'Pack/Show.S01E02.mkv')).toEqual([
      'folder Pack | Pack: sample, Show.S01.Extras',
      'series Pack | Show.S01E …: 01, 02',
    ])
  })

  test('at the top, names sharing a word part are no group', () => {
    expect(groups('Part.Pilot.mkv', 'Part.Pillow.mkv')).toEqual([
      'single  | : Part.Pillow.mkv',
      'single  | : Part.Pilot.mkv',
    ])
  })

  test('at the top, a resolution is no number', () => {
    expect(groups('Movie.720p.mkv', 'Movie.1080p.mkv')).toEqual(['single  | : Movie.720p.mkv', 'single  | : Movie.1080p.mkv'])
  })

  test('arabic and roman labels together are no group', () => {
    expect(groups('Film Part 1.mkv', 'Film Part II.mkv')).toEqual(['single  | : Film Part 1.mkv', 'single  | : Film Part II.mkv'])
  })
})

describe('groupFiles', () => {
  test('a real pack in rqbit order: sorted, other media and folders left out', () => {
    const tag = '[WEB-DL CR 1080p AVC DDP]'
    const pack = files(
      `Dandadan - 06 ${tag}.mkv`,
      `Dandadan - 02 ${tag}.mkv`,
      `Dandadan - 01 ${tag}.mkv`,
      `Dandadan - 10 ${tag}.mkv`,
      `ENG Sound/Dandadan - 01 ${tag}.DUB.eng.mka`,
      `ENG Subs/Dandadan - 01 ${tag}.CR.full.eng.ass`,
      'Fonts/Arial (Bold).ttf',
    )
    const [group, ...rest] = groupFiles(pack)
    expect(rest).toEqual([])
    expect(group).toEqual({
      kind: 'series',
      dir: '',
      name: `Dandadan … ${tag}`,
      files: [
        { index: 2, label: '01' },
        { index: 1, label: '02' },
        { index: 0, label: '06' },
        { index: 3, label: '10' },
      ],
    })
  })

  test('never cuts a number or a word in two', () => {
    expect(groups('Show.S01E09.mkv', 'Show.S01E10.mkv', 'Show.S01E11.mkv')).toEqual(['series  | Show.S01E …: 09, 10, 11'])
    expect(groups('Show.E9.720p.mkv', 'Show.E10.720p.mkv')).toEqual(['series  | Show.E … 720p: 9, 10'])
    expect(groups('Show 1x01.mkv', 'Show 1x02.mkv')).toEqual(['series  | Show 1x …: 01, 02'])
  })

  test('a file that would make the labels mixed starts outside the group', () => {
    expect(groups('Show.S01E01.mkv', 'Show.S01E02.mkv', 'Show.S01E02.Extended.mkv')).toEqual([
      'series  | Show.S01E …: 01, 02',
      'single  | : Show.S01E02.Extended.mkv',
    ])
  })

  test('numbers with nothing shared are no group by name', () => {
    expect(groups('Album/01.flac', 'Album/02.flac')).toEqual(['folder Album | Album: 01, 02'])
    expect(groups('01.mkv', '02.mkv')).toEqual(['single  | : 01.mkv', 'single  | : 02.mkv'])
  })

  test('a lone file in a folder stays on its own, with its folder', () => {
    expect(groups('Sample/movie-sample.mkv', 'Movie.2014.1080p.mkv')).toEqual([
      'single  | : Movie.2014.1080p.mkv',
      'single Sample | : movie-sample.mkv',
    ])
  })

  test('a folder group is named by the whole path', () => {
    expect(groups('Show Complete/Extras/Bloopers.mkv', 'Show Complete/Extras/Interview.mkv')).toEqual([
      'folder Show Complete/Extras | Show Complete/Extras: Bloopers, Interview',
    ])
  })

  test('folders in natural order, the top first', () => {
    expect(groups('Season 10/E01.mkv', 'Season 2/E01.mkv', 'Pilot.mkv').map((line) => line.split(' |')[0])).toEqual([
      'single ',
      'single Season 2',
      'single Season 10',
    ])
  })

  test('the groups of a folder in the natural order of their first files', () => {
    expect(groups('B.E01.mkv', 'B.E02.mkv', 'a.mkv', 'C.mkv')).toEqual([
      'single  | : a.mkv',
      'series  | B.E …: 01, 02',
      'single  | : C.mkv',
    ])
  })

  test('only videos are listed', () => {
    expect(groups('Movie.mkv', 'Movie.en.srt', 'Movie.nfo', 'Soundtrack/theme.mp3', 'Movie.eng.mka')).toEqual([
      'single  | : Movie.mkv',
    ])
  })

  test('a torrent without videos lists its audio', () => {
    expect(groups('Album/01 - Intro.flac', 'Album/02 - Outro.flac', 'Album/cover.jpg')).toEqual([
      'folder Album | Album: 01 - Intro, 02 - Outro',
    ])
  })

  test('nothing to play: no groups', () => {
    expect(groups('book.pdf')).toEqual([])
  })
})
