/**
 * A Surface that records what the controller asks of it, and lets a test
 * play the user's and movi's part.
 */

import type { Intent, MediaEvent, MediaSource, Surface } from '../../../src/controller/ports.ts'
import { initialState, type PlayerState } from '../../../src/controller/state.ts'

export class FakeSurface implements Surface {
  readonly states: PlayerState[] = []
  readonly loads: MediaSource[] = []
  resets = 0
  private readonly mediaListeners = new Set<(event: MediaEvent) => void>()
  private readonly intentListeners = new Set<(intent: Intent) => void>()

  /** The last state rendered. */
  get state(): PlayerState {
    return this.states.at(-1) ?? initialState
  }

  /** Listeners still attached. */
  get listeners(): number {
    return this.mediaListeners.size + this.intentListeners.size
  }

  render(state: PlayerState): void {
    this.states.push(state)
  }

  load(source: MediaSource): void {
    this.loads.push(source)
  }

  reset(): void {
    this.resets++
  }

  onMedia(listener: (event: MediaEvent) => void): () => void {
    this.mediaListeners.add(listener)
    return () => this.mediaListeners.delete(listener)
  }

  onIntent(listener: (intent: Intent) => void): () => void {
    this.intentListeners.add(listener)
    return () => this.intentListeners.delete(listener)
  }

  /** movi fires a media event. */
  media(event: MediaEvent): void {
    for (const listener of this.mediaListeners) listener(event)
  }

  /** The user does something in the player. */
  intent(intent: Intent): void {
    for (const listener of this.intentListeners) listener(intent)
  }
}
