/**
 * An Env with a hand-moved clock and a page the test hides, shows,
 * leaves and returns to.
 */

import type { Env } from '../../../src/controller/ports.ts'

interface Timer {
  ms: number
  next: number
  callback: () => void
}

export class FakeEnv implements Env {
  time = 0
  hidden = false
  private readonly timers = new Set<Timer>()
  private readonly visibility = new Set<() => void>()
  private readonly pageHides = new Set<() => void>()
  private readonly pageShows = new Set<(persisted: boolean) => void>()

  /** Timers running and listeners attached. */
  get attached(): number {
    return this.timers.size + this.visibility.size + this.pageHides.size + this.pageShows.size
  }

  now(): number {
    return this.time
  }

  every(ms: number, callback: () => void): () => void {
    const timer = { ms, next: this.time + ms, callback }
    this.timers.add(timer)
    return () => this.timers.delete(timer)
  }

  visible(): boolean {
    return !this.hidden
  }

  onVisibility(listener: () => void): () => void {
    return subscribe(this.visibility, listener)
  }

  onPageHide(listener: () => void): () => void {
    return subscribe(this.pageHides, listener)
  }

  onPageShow(listener: (persisted: boolean) => void): () => void {
    return subscribe(this.pageShows, listener)
  }

  /** Moves the clock, firing timers that come due on the way. */
  advance(ms: number): void {
    const end = this.time + ms
    for (;;) {
      const due = [...this.timers].filter((timer) => timer.next <= end).sort((a, b) => a.next - b.next)[0]
      if (!due) break
      this.time = due.next
      due.next += due.ms
      due.callback()
    }
    this.time = end
  }

  hide(): void {
    this.hidden = true
    for (const listener of this.visibility) listener()
  }

  show(): void {
    this.hidden = false
    for (const listener of this.visibility) listener()
  }

  pageHide(): void {
    for (const listener of this.pageHides) listener()
  }

  pageShow(persisted: boolean): void {
    for (const listener of this.pageShows) listener(persisted)
  }
}

function subscribe<T>(set: Set<T>, listener: T): () => void {
  set.add(listener)
  return () => set.delete(listener)
}
