import { assert, describe, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { compileTile } from "../src/service/compile-tile.js"
import { readSpkSegments, type RangeReader } from "../src/service/spk.js"
import { makeTile, trackFor } from "../src/service/tile.js"
import { Naif, NaifId } from "../src/types/bodies.js"
import { KernelCoverageError } from "../src/types/errors.js"
import { TdbSeconds } from "../src/types/time.js"
import { buildSpk, type TestSegment } from "./spk-builder.js"

const readerOver = (bytes: Uint8Array): RangeReader => ({
  read: (offset, length) => Effect.succeed(bytes.subarray(offset, offset + length)),
})

const DAY = 86_400
const ROOT = Naif.SolarSystemBarycenter

/**
 * Motion with an evident answer: over each 10-day record, x runs linearly from 1000 * record to
 * 1000 * (record + 1), y sits at -5 and z at the record's index.
 */
const walker: TestSegment = {
  target: 2,
  center: 0,
  dataType: 2,
  initSeconds: 0,
  intervalSeconds: 10 * DAY,
  records: [0, 1, 2, 3, 4].map((record) => [1000 * record + 500, 500, -5, 0, record, 0]),
}

const compile = (segments: ReadonlyArray<TestSegment>, startDay: number, endDay: number) =>
  Effect.gen(function* () {
    const reader = readerOver(buildSpk(segments))
    const found = yield* readSpkSegments(reader)
    return yield* compileTile({
      reader,
      segments: found,
      startSeconds: TdbSeconds(startDay * DAY),
      endSeconds: TdbSeconds(endDay * DAY),
    })
  })

describe("compileTile", () => {
  it.effect("keeps only the records that overlap the requested dates", () =>
    Effect.gen(function* () {
      const compiled = yield* compile([walker], 12, 28)
      const [segment] = compiled.segments
      assert.strictEqual(segment?.recordCount, 2)
      assert.strictEqual(segment?.initSeconds, 10 * DAY)
    }),
  )

  it.effect("stores coefficients only: three axes per record, no MID or RADIUS", () =>
    Effect.gen(function* () {
      const compiled = yield* compile([walker], 12, 28)
      assert.strictEqual(compiled.bytes.byteLength, 2 * 3 * 2 * 8)
    }),
  )

  it.effect("drops the velocity half of a type 3 record", () =>
    Effect.gen(function* () {
      const typeThree: TestSegment = {
        ...walker,
        dataType: 3,
        records: walker.records.map((record) => [...record, 9, 9, 9, 9, 9, 9]),
      }
      const compiled = yield* compile([typeThree], 0, 50)
      assert.strictEqual(compiled.bytes.byteLength, 5 * 3 * 2 * 8)
      const tile = makeTile(compiled.segments, compiled.bytes)
      const track = Option.getOrThrow(trackFor(tile, NaifId(2), ROOT))
      assert.strictEqual(track(TdbSeconds(5 * DAY))[1], -5)
    }),
  )

  it.effect("is deterministic: the same kernel and dates give the same bytes", () =>
    Effect.gen(function* () {
      const first = yield* compile([walker], 0, 50)
      const second = yield* compile([walker], 0, 50)
      assert.deepStrictEqual(first.bytes, second.bytes)
    }),
  )

  it.effect("refuses dates the kernel does not cover", () =>
    Effect.gen(function* () {
      const error = yield* compile([walker], 40, 60).pipe(Effect.flip)
      assert.instanceOf(error, KernelCoverageError)
      assert.include(error.message, "0 -> 2")
    }),
  )
})

describe("trackFor", () => {
  const compiledTile = compile([walker], 0, 50).pipe(
    Effect.map((compiled) => makeTile(compiled.segments, compiled.bytes)),
  )

  it.effect("evaluates the middle and both ends of a record", () =>
    Effect.gen(function* () {
      const tile = yield* compiledTile
      const track = Option.getOrThrow(trackFor(tile, NaifId(2), ROOT))
      assert.deepStrictEqual(track(TdbSeconds(5 * DAY)), [500, -5, 0])
      assert.deepStrictEqual(track(TdbSeconds(15 * DAY)), [1500, -5, 1])
    }),
  )

  it.effect("is continuous across a record boundary in this data", () =>
    Effect.gen(function* () {
      const tile = yield* compiledTile
      const track = Option.getOrThrow(trackFor(tile, NaifId(2), ROOT))
      assert.closeTo(track(TdbSeconds(10 * DAY - 1))[0], 1000, 0.01)
      assert.closeTo(track(TdbSeconds(10 * DAY))[0], 1000, 0.01)
    }),
  )

  it.effect("chains through intermediate bodies to the requested center", () =>
    Effect.gen(function* () {
      const moon: TestSegment = {
        target: 301,
        center: 3,
        dataType: 2,
        initSeconds: 0,
        intervalSeconds: 50 * DAY,
        records: [[10, 0, 20, 0, 30, 0]],
      }
      const earthBarycenter: TestSegment = {
        ...moon,
        target: 3,
        center: 0,
        records: [[100, 0, 200, 0, 300, 0]],
      }
      const sun: TestSegment = {
        ...moon,
        target: 10,
        center: 0,
        records: [[1, 0, 2, 0, 3, 0]],
      }
      const compiled = yield* compile([moon, earthBarycenter, sun], 0, 50)
      const tile = makeTile(compiled.segments, compiled.bytes)
      const track = Option.getOrThrow(trackFor(tile, Naif.Moon, Naif.Sun))
      assert.deepStrictEqual(track(TdbSeconds(DAY)), [109, 218, 327])
    }),
  )

  it.effect("has no track for a body the tile does not hold", () =>
    Effect.gen(function* () {
      const tile = yield* compiledTile
      assert.isTrue(Option.isNone(trackFor(tile, NaifId(499), ROOT)))
    }),
  )
})
