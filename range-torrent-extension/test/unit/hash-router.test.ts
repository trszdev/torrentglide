import { describe, expect, test } from 'bun:test'
import { createHashRouter, type RoutedPlayer } from '../../src/services/hash-router.ts'
import { flush } from './fakes/rqbit.ts'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)

class FakePlayer extends EventTarget implements RoutedPlayer {
  current: { infoHash: string; fileIndex: number | null } | null = null
  readonly calls: string[] = []
  play(fileIndex: number): void {
    this.calls.push(`play ${fileIndex}`)
  }
  openManaged(infoHash: string, fileIndex?: number): void {
    this.calls.push(`openManaged ${infoHash.slice(0, 1)} ${fileIndex}`)
  }
  emit(type: string, detail: unknown): void {
    if (type === 'current') this.current = detail as typeof this.current
    this.dispatchEvent(new CustomEvent(type, { detail }))
  }
}

function setup(hash: string, hidden: string[] = []) {
  const player = new FakePlayer()
  const location = {
    hash,
    replaced: [] as string[],
    listeners: new Set<() => void>(),
    read() {
      return this.hash
    },
    replace(next: string) {
      this.hash = next
      this.replaced.push(next)
    },
    onChange(listener: () => void) {
      this.listeners.add(listener)
      return () => this.listeners.delete(listener)
    },
    go(next: string) {
      this.hash = next
      for (const listener of this.listeners) listener()
    },
  }
  const stop = createHashRouter({ player, location, hidden: async (infoHash) => hidden.includes(infoHash) })
  return { player, location, stop }
}

describe('createHashRouter (SPEC §3)', () => {
  test('on load, opens the torrent and file of the hash', async () => {
    const { player } = setup(`#${A}/3`)
    await flush()
    expect(player.calls).toEqual(['openManaged a 3'])
  })

  test('a hash without a file opens the torrent; no hash or a broken one, nothing', async () => {
    expect((await (async () => {
      const { player } = setup(`#${A}`)
      await flush()
      return player.calls
    })())).toEqual(['openManaged a undefined'])
    for (const hash of ['', '#nope', `#${A}/x`]) {
      const { player } = setup(hash)
      await flush()
      expect(player.calls).toEqual([])
    }
  })

  test('hashchange: the same file does nothing, another file of it plays, another torrent opens', async () => {
    const { player, location } = setup('')
    player.emit('opened', { infoHash: A, managed: true })
    player.emit('current', { infoHash: A, fileIndex: 1 })
    location.go(`#${A}/1`)
    location.go(`#${A}`)
    location.go(`#${A}/2`)
    location.go(`#${B}/0`)
    await flush()
    expect(player.calls).toEqual(['play 2', 'openManaged b 0'])
  })

  test('writes what plays with replace, only for torrents rqbit has', () => {
    const { player, location } = setup('')
    player.emit('current', { infoHash: A, fileIndex: null })
    player.emit('opened', { infoHash: A, managed: false })
    player.emit('current', { infoHash: A, fileIndex: 0 })
    player.emit('added', { infoHash: A })
    player.emit('current', { infoHash: A, fileIndex: 0 })
    player.emit('opened', { infoHash: B, managed: true })
    player.emit('current', { infoHash: B, fileIndex: null })
    player.emit('current', null)
    expect(location.replaced).toEqual(['', '', `#${A}/0`, `#${B}`, ''])
  })

  test('a hidden torrent isn’t opened: the hash goes back to what plays (SPEC §11.2)', async () => {
    const { player, location } = setup(`#${A}/0`, [A])
    await flush()
    expect(player.calls).toEqual([])
    expect(location.hash).toBe('')
    player.emit('opened', { infoHash: B, managed: true })
    player.emit('current', { infoHash: B, fileIndex: 2 })
    location.go(`#${A}`)
    await flush()
    expect(player.calls).toEqual([])
    expect(location.hash).toBe(`#${B}/2`)
  })

  test('only the latest hash counts while the hidden check is out', async () => {
    const { player, location } = setup(`#${A}/0`)
    location.go(`#${B}/1`)
    await flush()
    expect(player.calls).toEqual(['openManaged b 1'])
  })

  test('stop() lets go of the player and the location', async () => {
    const { player, location, stop } = setup('')
    stop()
    location.go(`#${A}`)
    player.emit('current', { infoHash: A, fileIndex: 0 })
    await flush()
    expect(player.calls).toEqual([])
    expect(location.replaced).toEqual([])
  })
})
