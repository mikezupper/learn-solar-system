import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Ref } from "effect"
import { DigestWebCrypto } from "../src/repo/index.js"
import { buildYearTile, PUBLISH_LIMIT_KM } from "../src/service/build-tile.js"
import { tdbFromUtcMillis } from "../src/service/time-scale.js"
import { spreadInstants, verifyTile } from "../src/service/verify-tile.js"
import { makeTile } from "../src/service/tile.js"
import { KernelCoverageError, HorizonsError, TileRejectedError } from "../src/types/errors.js"
import { TdbSeconds } from "../src/types/time.js"
import { horizonsAgreeing, horizonsDown, kernelOf, memoryStore, PIN, stillKernel } from "./fakes.js"

const world = (horizons: Layer.Layer<never> | ReturnType<typeof horizonsAgreeing>) =>
  Effect.gen(function* () {
    const store = yield* memoryStore
    const layer = Layer.mergeAll(kernelOf(stillKernel()), horizons, DigestWebCrypto, store.layer)
    return { store, layer }
  })

describe("buildYearTile", () => {
  it.effect("publishes a tile that agrees with Horizons", () =>
    Effect.gen(function* () {
      const { store, layer } = yield* world(horizonsAgreeing())
      const entry = yield* buildYearTile(PIN, 2026).pipe(Effect.provide(layer))
      assert.strictEqual(entry.id, "planets-2026")
      assert.strictEqual(entry.year, 2026)
      assert.strictEqual(entry.verification.bodiesChecked, 9)
      assert.strictEqual(entry.verification.instantsChecked, 12)
      assert.deepStrictEqual(entry.provenance, { kernel: "still.bsp", kernelSha256: "pinned-hash" })
      const catalog = yield* Ref.get(store.catalog)
      assert.deepStrictEqual(catalog.tiles.map((tile) => tile.id), ["planets-2026"])
    }),
  )

  it.effect("names the blob after its hash, so a published blob can be cached forever", () =>
    Effect.gen(function* () {
      const { layer } = yield* world(horizonsAgreeing())
      const entry = yield* buildYearTile(PIN, 2026).pipe(Effect.provide(layer))
      assert.strictEqual(entry.blob, `planets-2026-${entry.sha256.slice(0, 16)}.bin`)
    }),
  )

  it.effect("writes the blob before the catalog, so no reader sees a listing with no file", () =>
    Effect.gen(function* () {
      const { store, layer } = yield* world(horizonsAgreeing())
      const entry = yield* buildYearTile(PIN, 2026).pipe(Effect.provide(layer))
      assert.deepStrictEqual(yield* Ref.get(store.writes), [`blob:${entry.blob}`, "catalog"])
    }),
  )

  it.effect("records nothing on a rerun with the same bytes", () =>
    Effect.gen(function* () {
      const { store, layer } = yield* world(horizonsAgreeing())
      yield* buildYearTile(PIN, 2026).pipe(Effect.provide(layer))
      yield* Ref.set(store.writes, [])
      yield* buildYearTile(PIN, 2026).pipe(Effect.provide(layer))
      assert.deepStrictEqual(yield* Ref.get(store.writes), [])
    }),
  )

  it.effect("rejects a tile past the limit, and leaves the store untouched", () =>
    Effect.gen(function* () {
      const { store, layer } = yield* world(horizonsAgreeing(PUBLISH_LIMIT_KM + 0.5))
      const error = yield* buildYearTile(PIN, 2026).pipe(Effect.provide(layer), Effect.flip)
      assert.instanceOf(error, TileRejectedError)
      assert.closeTo((error).errorKm, PUBLISH_LIMIT_KM + 0.5, 1e-6)
      assert.deepStrictEqual(yield* Ref.get(store.writes), [])
    }),
  )

  it.effect("publishes nothing when Horizons cannot be reached: unverified is not verified", () =>
    Effect.gen(function* () {
      const { store, layer } = yield* world(horizonsDown)
      const error = yield* buildYearTile(PIN, 2026).pipe(Effect.provide(layer), Effect.flip)
      assert.instanceOf(error, HorizonsError)
      assert.deepStrictEqual(yield* Ref.get(store.writes), [])
    }),
  )

  it.effect("refuses a year the kernel does not cover", () =>
    Effect.gen(function* () {
      const { layer } = yield* world(horizonsAgreeing())
      const error = yield* buildYearTile(PIN, 2040).pipe(Effect.provide(layer), Effect.flip)
      assert.instanceOf(error, KernelCoverageError)
    }),
  )
})

describe("verifyTile", () => {
  it.effect("refuses a tile that lacks a body it must be checked on", () =>
    Effect.gen(function* () {
      const error = yield* verifyTile({
        tileId: "empty",
        tile: makeTile([], new Uint8Array(0)),
        instants: [TdbSeconds(0)],
        limitKm: 1,
      }).pipe(Effect.provide(horizonsAgreeing()), Effect.flip)
      assert.instanceOf(error, KernelCoverageError)
      assert.include((error).message, "Mercury")
    }),
  )
})

describe("spreadInstants", () => {
  const start = tdbFromUtcMillis(Date.UTC(2026, 0, 1))
  const end = tdbFromUtcMillis(Date.UTC(2027, 0, 1))

  it("stays inside the span", () => {
    const instants = spreadInstants(start, end, 12)
    assert.strictEqual(instants.length, 12)
    assert.isTrue(instants.every((at) => at > start && at < end))
  })

  it("keeps away from whole days, where Chebyshev records begin and end", () => {
    const fractionOfDay = (at: number) => (at / 86_400) % 1
    assert.isTrue(spreadInstants(start, end, 12).every((at) => fractionOfDay(at) !== 0))
  })
})
