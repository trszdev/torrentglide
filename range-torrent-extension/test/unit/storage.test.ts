import { describe, expect, test } from 'bun:test'
import { browserArea, memoryStorage, type StorageChange } from '../../src/services/storage.ts'

describe('memoryStorage', () => {
  test('gets what was set, all of it with null, and forgets what was removed', async () => {
    const area = memoryStorage({ a: 1 })
    await area.set({ b: { c: 2 } })
    expect(await area.get(['a', 'b', 'x'])).toEqual({ a: 1, b: { c: 2 } })
    expect(await area.get(null)).toEqual({ a: 1, b: { c: 2 } })
    await area.remove(['a'])
    expect(await area.get(null)).toEqual({ b: { c: 2 } })
  })

  test('keeps copies, like a real storage area', async () => {
    const area = memoryStorage()
    const value = { n: 1 }
    await area.set({ k: value })
    value.n = 2
    const got = (await area.get(['k'])).k as { n: number }
    got.n = 3
    expect(await area.get(['k'])).toEqual({ k: { n: 1 } })
  })

  test('tells watchers what changed; removing a missing key changes nothing', async () => {
    const area = memoryStorage({ a: 1 })
    const seen: Record<string, StorageChange>[] = []
    const stop = area.watch((changes) => seen.push(changes))
    await area.set({ a: 2 })
    await area.remove(['a', 'missing'])
    await area.remove(['missing'])
    stop()
    await area.set({ a: 3 })
    expect(seen).toEqual([{ a: { oldValue: 1, newValue: 2 } }, { a: { oldValue: 2 } }])
  })
})

describe('browserArea', () => {
  test('passes calls to its area and watches only that area’s changes', async () => {
    const listeners = new Set<(changes: Record<string, StorageChange>, area: string) => void>()
    const calls: string[] = []
    const fake = {
      local: {
        get: async (keys: string[] | null) => (calls.push(`get ${keys}`), { a: 1 }),
        set: async (items: Record<string, unknown>) => void calls.push(`set ${Object.keys(items)}`),
        remove: async (keys: string[]) => void calls.push(`remove ${keys}`),
      },
      onChanged: {
        addListener: (listener: (changes: Record<string, StorageChange>, area: string) => void) => listeners.add(listener),
        removeListener: (listener: (changes: Record<string, StorageChange>, area: string) => void) => listeners.delete(listener),
      },
    }
    const area = browserArea(fake, 'local')
    expect(await area.get(['a'])).toEqual({ a: 1 })
    await area.set({ b: 2 })
    await area.remove(['b'])
    const seen: unknown[] = []
    const stop = area.watch((changes) => seen.push(changes))
    for (const listener of listeners) listener({ x: { newValue: 1 } }, 'session')
    for (const listener of listeners) listener({ y: { newValue: 2 } }, 'local')
    stop()
    expect(listeners.size).toBe(0)
    expect(calls).toEqual(['get a', 'set b', 'remove b'])
    expect(seen).toEqual([{ y: { newValue: 2 } }])
  })
})
