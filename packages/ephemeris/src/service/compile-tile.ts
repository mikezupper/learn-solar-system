import { Array, Effect, Option, pipe } from "effect"
import { NaifId } from "../types/bodies.js"
import type { TileSegment } from "../types/catalog.js"
import { KernelCoverageError, type KernelFormatError, type KernelReadError } from "../types/errors.js"
import { TdbSeconds } from "../types/time.js"
import type { RangeReader, SpkSegment } from "./spk.js"

export interface CompiledTile {
  readonly startSeconds: TdbSeconds
  readonly endSeconds: TdbSeconds
  readonly segments: ReadonlyArray<TileSegment>
  readonly bytes: Uint8Array
}

const DOUBLE_BYTES = 8
const AXES = 3
const MID_AND_RADIUS = 2

/** The first segment for each body that covers the dates, in file order. */
const coveringSegments = (
  segments: ReadonlyArray<SpkSegment>,
  startSeconds: number,
  endSeconds: number,
): Effect.Effect<ReadonlyArray<SpkSegment>, KernelCoverageError> => {
  const covers = (segment: SpkSegment) =>
    segment.initSeconds <= startSeconds &&
    segment.initSeconds + segment.recordCount * segment.intervalSeconds >= endSeconds
  const pairs = Array.dedupeWith(segments, (a, b) => a.target === b.target && a.center === b.center)
  return Effect.forEach(pairs, (pair) =>
    pipe(
      segments,
      Array.findFirst(
        (segment) =>
          segment.target === pair.target && segment.center === pair.center && covers(segment),
      ),
      Option.match({
        onSome: Effect.succeed,
        onNone: () =>
          Effect.fail(
            new KernelCoverageError({
              message: `Segment ${String(pair.center)} -> ${String(pair.target)} does not cover ${String(startSeconds)} to ${String(endSeconds)} seconds past J2000.`,
            }),
          ),
      }),
    ),
  )
}

/** Copies the position coefficients out of raw records, leaving MID, RADIUS and any velocity. */
const positionCoefficients = (
  records: Uint8Array,
  recordCount: number,
  segment: SpkSegment,
): Uint8Array => {
  const source = new DataView(records.buffer, records.byteOffset, records.byteLength)
  const wordsPerRecord = segment.coefficientsPerAxis * AXES
  return Uint8Array.from(
    new Uint8Array(
      Float64Array.from({ length: recordCount * wordsPerRecord }, (_, index) => {
        const record = Math.floor(index / wordsPerRecord)
        const word = record * segment.recordWords + MID_AND_RADIUS + (index % wordsPerRecord)
        return source.getFloat64(word * DOUBLE_BYTES, true)
      }).buffer,
    ),
  )
}

/**
 * Cuts the records covering the dates out of a kernel. The result depends only on its inputs, so a
 * tile can always be rebuilt and compared byte for byte.
 */
export const compileTile = Effect.fn("Tile.compile")(function* (options: {
  readonly reader: RangeReader
  readonly segments: ReadonlyArray<SpkSegment>
  readonly startSeconds: TdbSeconds
  readonly endSeconds: TdbSeconds
}): Effect.fn.Return<CompiledTile, KernelReadError | KernelFormatError | KernelCoverageError> {
  const { reader, startSeconds, endSeconds } = options
  const chosen = yield* coveringSegments(options.segments, startSeconds, endSeconds)
  const slices = yield* Effect.forEach(chosen, (segment) =>
    Effect.gen(function* () {
      const first = Math.floor((startSeconds - segment.initSeconds) / segment.intervalSeconds)
      const pastLast = Math.min(
        segment.recordCount,
        Math.ceil((endSeconds - segment.initSeconds) / segment.intervalSeconds),
      )
      const recordCount = pastLast - first
      const recordBytes = segment.recordWords * DOUBLE_BYTES
      const raw = yield* reader.read(
        segment.dataByteOffset + first * recordBytes,
        recordCount * recordBytes,
      )
      return {
        segment,
        first,
        recordCount,
        coefficients: positionCoefficients(raw, recordCount, segment),
      }
    }),
  )
  const byteLength = slices.reduce((sum, slice) => sum + slice.coefficients.byteLength, 0)
  const bytes = new Uint8Array(byteLength)
  const segments = Array.mapAccum(slices, 0, (byteOffset, slice) => {
    bytes.set(slice.coefficients, byteOffset)
    const entry: TileSegment = {
      target: NaifId(slice.segment.target),
      center: NaifId(slice.segment.center),
      initSeconds: TdbSeconds(
        slice.segment.initSeconds + slice.first * slice.segment.intervalSeconds,
      ),
      intervalSeconds: slice.segment.intervalSeconds,
      coefficientsPerAxis: slice.segment.coefficientsPerAxis,
      recordCount: slice.recordCount,
      byteOffset,
    }
    return [byteOffset + slice.coefficients.byteLength, entry] as const
  })[1]
  return { startSeconds, endSeconds, segments, bytes }
})
