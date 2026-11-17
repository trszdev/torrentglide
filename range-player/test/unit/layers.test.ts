import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { dirname, join, relative, resolve } from 'node:path'

// docs/ARCHITECTURE.md §2.1: core → controller → view, imports only go down.
const SRC = resolve(import.meta.dir, '../../src')

const LAYERS = {
  core: { layers: ['core'], packages: [] },
  controller: { layers: ['core', 'controller'], packages: [] },
  view: { layers: ['core', 'controller', 'view'], packages: ['movi-player', 'lit-html'] },
} satisfies Record<string, { layers: string[]; packages: string[] }>

const IMPORT = /(?:^|\s)(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm

async function importsOf(file: string): Promise<string[]> {
  const text = await Bun.file(file).text()
  return [...text.matchAll(IMPORT)].map(m => m[1] ?? m[2] ?? m[3] ?? '')
}

describe('layers', () => {
  for (const [layer, allowed] of Object.entries(LAYERS)) {
    test(`${layer} imports only what its layer may`, async () => {
      const bad: string[] = []
      for await (const path of new Glob(`${layer}/**/*.ts`).scan(SRC)) {
        const file = join(SRC, path)
        for (const spec of await importsOf(file)) {
          if (spec.startsWith('.')) {
            const target = relative(SRC, resolve(dirname(file), spec)).split('/')[0] ?? ''
            if (!(allowed.layers as string[]).includes(target)) bad.push(`${path} → ${spec}`)
          } else if (!(allowed.packages as string[]).some(p => spec === p || spec.startsWith(`${p}/`))) {
            bad.push(`${path} → ${spec}`)
          }
        }
      }
      expect(bad).toEqual([])
    })
  }
})
