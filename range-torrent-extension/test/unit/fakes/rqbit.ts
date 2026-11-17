/** range-player's in-memory rqbit, and its files helper, for the extension's tests. */

export { FakeRqbit, type FakeTorrent } from '../../../../range-player/test/unit/fakes/fake-rqbit.ts'
export { FakeEnv } from '../../../../range-player/test/unit/fakes/fake-env.ts'
export { files } from '../../../../range-player/test/unit/fakes/files.ts'

/** A promise and the functions that settle it. */
export function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Lets pending promise callbacks run. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
