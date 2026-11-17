import { describe, expect, test } from 'bun:test'
import { createDecoderTimestamps, createFrameTimestamps } from '../../../src/core/frame-timestamps.ts'

// An AVI with B-frames at 25 fps, as movi's software decoder sees it. AVI has
// no presentation times, so every packet's pts is its dts: packets in decode
// order I P B P B P at 0, 0.04, 0.08, …; frames come out a packet later, in
// display order I B P B P, each with the pts of the packet that carried it.
const AVI = [
  { pts: 0, dts: 0.04 },
  { pts: 0.08, dts: 0.08 },
  { pts: 0.04, dts: 0.12 },
  { pts: 0.16, dts: 0.16 },
  { pts: 0.12, dts: 0.2 },
]

// The same order from an MKV: real presentation times, packets in decode order.
const MKV = [
  { pts: 0, dts: 0.04 },
  { pts: 0.04, dts: 0.12 },
  { pts: 0.08, dts: 0.08 },
  { pts: 0.12, dts: 0.2 },
  { pts: 0.16, dts: 0.16 },
]

function play(frames: { pts: number; dts: number }[], timestamps = createFrameTimestamps()): number[] {
  return frames.map(({ pts, dts }) => timestamps.frame(pts, dts))
}

describe('frame timestamps', () => {
  test('frames of an AVI with B-frames keep their display order', () => {
    expect(play(AVI)).toEqual([0, 0.08, 0.12, 0.16, 0.2])
  })

  test('frames with real presentation times keep them', () => {
    expect(play(MKV)).toEqual([0, 0.04, 0.08, 0.12, 0.16])
  })

  test('a frame without a pts takes its packet dts', () => {
    expect(play([{ pts: -1, dts: 0.04 }, { pts: -1, dts: 0.08 }])).toEqual([0.04, 0.08])
  })

  test('a frame with neither keeps what movi passed', () => {
    expect(play([{ pts: -1, dts: Number.NaN }])).toEqual([-1])
  })

  test('after a reset, an AVI that came before no longer counts', () => {
    const timestamps = createFrameTimestamps()
    play(AVI, timestamps)
    timestamps.reset()
    expect(play(MKV, timestamps)).toEqual([0, 0.04, 0.08, 0.12, 0.16])
  })
})

// An MP4 with B-frames but no ctts, at 25 fps, as WebCodecs sees it: chunks go
// in decode order I P B P B P B P B, stamped with their decode times; frames
// come out in display order, each with the timestamp of the chunk that carried it.
const NO_CTTS = {
  chunks: [0, 0.04, 0.08, 0.12, 0.16, 0.2, 0.24, 0.28, 0.32],
  frames: [0, 0.08, 0.04, 0.16, 0.12, 0.24, 0.2, 0.32, 0.28],
}

// The same stream with ctts: chunks carry real presentation times.
const WITH_CTTS = {
  chunks: [0, 0.08, 0.04, 0.16, 0.12, 0.24, 0.2, 0.32, 0.28],
  frames: [0, 0.04, 0.08, 0.12, 0.16, 0.2, 0.24, 0.28, 0.32],
}

function decode(
  { chunks, frames }: { chunks: number[]; frames: number[] },
  timestamps = createDecoderTimestamps(),
): number[] {
  for (const chunk of chunks) timestamps.input(chunk)
  return frames.map((frame) => timestamps.output(frame))
}

describe('decoder timestamps', () => {
  // Like FFmpeg, it notices once a frame's timestamp has gone backwards: the
  // first B-frame still plays a frame late, the rest in display order.
  test('frames of an MP4 without ctts play in display order', () => {
    expect(decode(NO_CTTS)).toEqual([0, 0.08, 0.08, 0.12, 0.16, 0.2, 0.24, 0.28, 0.32])
  })

  test('frames with real presentation times keep them', () => {
    expect(decode(WITH_CTTS)).toEqual(WITH_CTTS.frames)
  })

  test('after a reset, chunks the decoder dropped are not handed out', () => {
    const timestamps = createDecoderTimestamps()
    decode({ chunks: [9, 9.04, 9.08], frames: [9.04, 9] }, timestamps)
    timestamps.reset()
    expect(decode(NO_CTTS, timestamps)).toEqual([0, 0.08, 0.08, 0.12, 0.16, 0.2, 0.24, 0.28, 0.32])
  })
})
