import { describe, expect, test } from 'bun:test'
import { RqbitClient } from 'range-player/core'
import { createRqbitPoller, type PollerState } from '../../src/services/rqbit-poller.ts'
import { deferred, FakeEnv, FakeRqbit, flush } from './fakes/rqbit.ts'

const SHOW = { infoHash: 'a'.repeat(40), name: 'Show', files: [{ path: 'Show/E01.mkv', length: 100 }] }
const URL_ = 'http://127.0.0.1:3041'

function setup({ allowed = true, down: startDown = false } = {}) {
  const rqbit = new FakeRqbit()
  rqbit.manage(SHOW)
  const env = new FakeEnv()
  let down = startDown
  let gate: Promise<void> | null = null
  const fetch = async (url: string, init?: RequestInit) => {
    // rqbit's state when the request goes out, whenever it answers.
    const failing = down
    const wait = gate
    if (wait) await wait
    if (failing) throw new TypeError('Failed to fetch')
    return rqbit.fetch(url, init)
  }
  const client = new RqbitClient(URL_, fetch)
  const states: PollerState[] = []
  const permission = { allowed }
  const poller = createRqbitPoller({
    client,
    env,
    allowed: async () => permission.allowed,
    onChange: (state) => states.push(state),
  })
  return {
    rqbit,
    env,
    poller,
    states,
    permission,
    setDown: (value: boolean) => void (down = value),
    /** Requests from now on wait until release(); stopHolding() lets later ones through. */
    hold: () => {
      const d = deferred()
      gate = d.promise
      return {
        stopHolding: () => void (gate = null),
        release: () => {
          gate = null
          d.resolve()
        },
      }
    },
  }
}

describe('createRqbitPoller', () => {
  test('connecting until rqbit first answers, then running with its version and torrents', async () => {
    const { poller, rqbit } = setup()
    expect(poller.state).toEqual({ status: { kind: 'connecting' }, torrents: null })
    await flush()
    expect(poller.state.status).toEqual({ kind: 'running', version: '9.0.1' })
    expect(poller.state.torrents?.map((t) => t.info_hash)).toEqual([SHOW.infoHash])
    expect(rqbit.calls.sort()).toEqual(['GET /', 'GET /torrents?with_stats=true'])
  })

  test('every 5 s while the tab is visible; when it shows again, at once', async () => {
    const { env, rqbit } = setup()
    await flush()
    const lists = () => rqbit.calls.filter((call) => call.startsWith('GET /torrents')).length
    env.advance(5000)
    await flush()
    expect(lists()).toBe(2)
    env.hide()
    env.advance(15000)
    await flush()
    expect(lists()).toBe(2)
    env.show()
    await flush()
    expect(lists()).toBe(3)
  })

  test('not answering: says so with the error, and keeps the last list', async () => {
    const { poller, setDown } = setup()
    await flush()
    setDown(true)
    await poller.refresh()
    expect(poller.state.status).toMatchObject({ kind: 'not-answering' })
    expect(poller.state.torrents?.length).toBe(1)
  })

  test('without the host permission: not allowed', async () => {
    const { poller, permission } = setup({ allowed: false, down: true })
    await flush()
    expect(poller.state.status).toEqual({ kind: 'not-allowed' })
    permission.allowed = true
    await poller.refresh()
    expect(poller.state.status).toMatchObject({ kind: 'not-answering' })
  })

  test('an older answer never overwrites a newer one', async () => {
    const { poller, hold, setDown } = setup()
    await flush()
    setDown(true)
    const held = hold()
    const older = poller.refresh()
    // rqbit is back, and the newer refresh answers first.
    held.stopHolding()
    setDown(false)
    await poller.refresh()
    held.release()
    await older
    expect(poller.state.status).toEqual({ kind: 'running', version: '9.0.1' })
  })

  test('a tick while a refresh is still waiting starts no second one', async () => {
    const { env, rqbit, hold } = setup()
    await flush()
    const held = hold()
    env.advance(5000)
    env.advance(5000)
    await flush()
    held.release()
    await flush()
    expect(rqbit.calls.filter((call) => call === 'GET /').length).toBe(2)
  })

  test('onChange gets every new state; stop() ends the polling', async () => {
    const { env, poller, states, rqbit } = setup()
    await flush()
    expect(states.map((s) => s.status.kind)).toEqual(['running'])
    poller.stop()
    expect(env.attached).toBe(0)
    env.advance(20000)
    await flush()
    expect(rqbit.calls.length).toBe(2)
  })
})
