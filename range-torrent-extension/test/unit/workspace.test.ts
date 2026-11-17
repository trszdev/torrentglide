import { expect, test } from 'bun:test'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

// The page bundles range-player's sources with this project's movi-player.
// Two copies would register <movi-player> twice and double the bundle.
test('range-player and the extension resolve the same movi-player', () => {
  const from = (dir: string) => realpathSync(Bun.resolveSync('movi-player/element/slim', resolve(import.meta.dir, dir)))
  expect(from('../../../range-player/src')).toBe(from('../..'))
})
