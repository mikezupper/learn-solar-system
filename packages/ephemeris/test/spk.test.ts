import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { readSpkSegments, type RangeReader } from "../src/service/spk.js"
import { KernelFormatError, KernelReadError } from "../src/types/errors.js"
import { buildSpk, type TestSegment } from "./spk-builder.js"

const readerOver = (bytes: Uint8Array): RangeReader => ({
  read: (offset, length) => Effect.succeed(bytes.subarray(offset, offset + length)),
})

const venus: TestSegment = {
  target: 2,
  center: 0,
  dataType: 2,
  initSeconds: 0,
  intervalSeconds: 100,
  // Three coefficients per axis: x then y then z.
  records: [[1, 2, 3, 4, 5, 6, 7, 8, 9], [10, 20, 30, 40, 50, 60, 70, 80, 90]],
}

describe("readSpkSegments", () => {
  it.effect("reads a segment's identity and footer", () =>
    Effect.gen(function* () {
      const [segment] = yield* readSpkSegments(readerOver(buildSpk([venus])))
      assert.strictEqual(segment?.target, 2)
      assert.strictEqual(segment?.center, 0)
      assert.strictEqual(segment?.dataType, 2)
      assert.strictEqual(segment?.initSeconds, 0)
      assert.strictEqual(segment?.intervalSeconds, 100)
      assert.strictEqual(segment?.recordCount, 2)
      assert.strictEqual(segment?.coefficientsPerAxis, 3)
    }),
  )

  it.effect("follows the chain of summary records", () =>
    Effect.gen(function* () {
      const many = [1, 2, 3, 4, 5].map((target) => ({ ...venus, target }))
      const bytes = buildSpk(many, { summariesPerRecord: 2 })
      const segments = yield* readSpkSegments(readerOver(bytes))
      assert.deepStrictEqual(
        segments.map((segment) => segment.target),
        [1, 2, 3, 4, 5],
      )
    }),
  )

  it.effect("finds each segment's records in the file", () =>
    Effect.gen(function* () {
      const reader = readerOver(buildSpk([venus]))
      const [segment] = yield* readSpkSegments(reader)
      const bytes = yield* reader.read(segment?.dataByteOffset ?? 0, 8 * 11 * 2)
      const words = new Float64Array(bytes.slice().buffer)
      // A record is [MID, RADIUS, coefficients...]: MID = 50, RADIUS = 50, then the first value.
      assert.deepStrictEqual([words[0], words[1], words[2]], [50, 50, 1])
      assert.deepStrictEqual([words[11], words[12], words[13]], [150, 50, 10])
    }),
  )

  it.effect("counts six components per coefficient in a type 3 segment", () =>
    Effect.gen(function* () {
      const withVelocity: TestSegment = {
        ...venus,
        dataType: 3,
        records: [Array.from({ length: 12 }, (_, index) => index)],
      }
      const [segment] = yield* readSpkSegments(readerOver(buildSpk([withVelocity])))
      assert.strictEqual(segment?.coefficientsPerAxis, 2)
    }),
  )

  it.effect("refuses a file that is not an SPK", () =>
    Effect.gen(function* () {
      const error = yield* readSpkSegments(
        readerOver(buildSpk([venus], { idWord: "DAF/PCK " })),
      ).pipe(Effect.flip)
      assert.instanceOf(error, KernelFormatError)
      assert.include(error.message, "DAF/PCK")
    }),
  )

  it.effect("refuses big-endian files rather than misreading every number", () =>
    Effect.gen(function* () {
      const error = yield* readSpkSegments(
        readerOver(buildSpk([venus], { format: "BIG-IEEE" })),
      ).pipe(Effect.flip)
      assert.instanceOf(error, KernelFormatError)
      assert.include(error.message, "BIG-IEEE")
    }),
  )

  it.effect("refuses a segment type it cannot evaluate", () =>
    Effect.gen(function* () {
      const bytes = buildSpk([venus])
      new DataView(bytes.buffer).setInt32(1024 + 24 + 28, 21, true)
      const error = yield* readSpkSegments(readerOver(bytes)).pipe(Effect.flip)
      assert.instanceOf(error, KernelFormatError)
      assert.include(error.message, "type 21")
    }),
  )

  it.effect("passes a read failure through unchanged", () =>
    Effect.gen(function* () {
      const failure = new KernelReadError({ path: "de440s.bsp", reason: "disk full" })
      const error = yield* readSpkSegments({ read: () => Effect.fail(failure) }).pipe(Effect.flip)
      assert.strictEqual(error, failure)
    }),
  )
})
