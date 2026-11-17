import type { RqbitFile } from '../../../src/core/rqbit.ts'

/**
 * rqbit-shaped files from "path" or "path:size in MB" entries. Paths under
 * `.pad/` are padding files.
 */
export function files(...entries: string[]): RqbitFile[] {
  return entries.map((entry) => {
    const [path = '', size = '1'] = entry.split(':')
    return {
      name: path,
      components: path.split('/'),
      length: Number(size) * 1024 * 1024,
      included: true,
      attributes: { symlink: false, hidden: false, padding: path.startsWith('.pad/'), executable: false },
    }
  })
}
