import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema } from "effect"
import { Digest, DigestWebCrypto, TileSource } from "../src/repo/index.js"
import { loadCatalog, loadTile, selectTile } from "../src/service/load-tile.js"
import { trackFor } from "../src/service/tile.js"
import { Naif, NaifId } from "../src/types/bodies.js"
import { TileCatalog, type TileEntry } from "../src/types/catalog.js"
import { CatalogUnavailableError, TileCorruptError } from "../src/types/errors.js"
import { TdbSeconds } from "../src/types/time.js"

const coefficients = new Uint8Array(new Float64Array([7, 8, 9]).buffer)

const entry = (overrides: Partial<TileEntry>): TileEntry => ({
  id: "planets-2026",
  system: "planets",
  startSeconds: TdbSeconds(100),
  endSeconds: TdbSeconds(200),
  blob: "planets-2026-abc.bin",
  byteLength: coefficients.byteLength,
  sha256: "placeholder",
  segments: [
    {
      target: NaifId(2),
      center: Naif.SolarSystemBarycenter,
      initSeconds: TdbSeconds(100),
      intervalSeconds: 100,
      coefficientsPerAxis: 1,
      recordCount: 1,
      byteOffset: 0,
    },
  ],
  provenance: { kernel: "de440s.bsp", kernelSha256: "abc" },
  verification: {
    source: "JPL Horizons",
    instantsChecked: 1,
    bodiesChecked: 1,
    maxErrorKm: 0,
    limitKm: 1,
  },
  ...overrides,
})

const sourceOf = (bytes: Uint8Array, catalog: unknown = { formatVersion: 1, tiles: [] }) =>
  Layer.succeed(
    TileSource,
    TileSource.of({
      catalogJson: Effect.succeed(catalog),
      blob: () => Effect.succeed(bytes),
    }),
  )

const fakeDigest = (hash: string) =>
  Layer.succeed(Digest, Digest.of({ sha256: () => Effect.succeed(hash) }))

describe("selectTile", () => {
  const catalog: TileCatalog = {
    formatVersion: 1,
    tiles: [
      entry({ id: "a", startSeconds: TdbSeconds(0), endSeconds: TdbSeconds(100) }),
      entry({ id: "b", startSeconds: TdbSeconds(100), endSeconds: TdbSeconds(200) }),
    ],
  }

  it("picks the tile whose dates hold the instant", () => {
    assert.strictEqual(Option.getOrThrow(selectTile(catalog, TdbSeconds(150))).id, "b")
  })

  it("gives a boundary instant to the later tile", () => {
    assert.strictEqual(Option.getOrThrow(selectTile(catalog, TdbSeconds(100))).id, "b")
  })

  it("finds nothing outside the catalog's dates", () => {
    assert.isTrue(Option.isNone(selectTile(catalog, TdbSeconds(200))))
    assert.isTrue(Option.isNone(selectTile(catalog, TdbSeconds(-1))))
  })
})

describe("loadTile", () => {
  it.effect("returns a tile that evaluates when the bytes match the entry", () =>
    Effect.gen(function* () {
      const tile = yield* loadTile(entry({ sha256: "right" }))
      const track = Option.getOrThrow(trackFor(tile, NaifId(2), Naif.SolarSystemBarycenter))
      assert.deepStrictEqual(track(TdbSeconds(150)), [7, 8, 9])
    }).pipe(Effect.provide(Layer.merge(sourceOf(coefficients), fakeDigest("right")))),
  )

  it.effect("refuses a blob of the wrong length without hashing it", () =>
    Effect.gen(function* () {
      const error = yield* loadTile(entry({ byteLength: 999 })).pipe(Effect.flip)
      assert.instanceOf(error, TileCorruptError)
      assert.include(error.reason, "999")
    }).pipe(Effect.provide(Layer.merge(sourceOf(coefficients), fakeDigest("unused")))),
  )

  it.effect("refuses a blob whose hash differs from the entry", () =>
    Effect.gen(function* () {
      const error = yield* loadTile(entry({ sha256: "expected" })).pipe(Effect.flip)
      assert.instanceOf(error, TileCorruptError)
      assert.include(error.reason, "actual")
    }).pipe(Effect.provide(Layer.merge(sourceOf(coefficients), fakeDigest("actual")))),
  )
})

describe("loadCatalog", () => {
  it.effect("decodes a catalog this reader understands", () =>
    Effect.gen(function* () {
      const catalog = yield* loadCatalog
      assert.strictEqual(catalog.tiles.length, 1)
    }).pipe(
      Effect.provide(
        sourceOf(coefficients, Schema.encodeSync(TileCatalog)({ formatVersion: 1, tiles: [entry({})] })),
      ),
    ),
  )

  it.effect("refuses a catalog written for a newer format, rather than misreading it", () =>
    Effect.gen(function* () {
      const error = yield* loadCatalog.pipe(Effect.flip)
      assert.instanceOf(error, CatalogUnavailableError)
    }).pipe(Effect.provide(sourceOf(coefficients, { formatVersion: 2, tiles: [] }))),
  )
})

describe("DigestWebCrypto", () => {
  // "abc" has the published SHA-256 test vector from FIPS 180-2.
  it.effect("matches the FIPS 180-2 test vector", () =>
    Effect.gen(function* () {
      const digest = yield* Digest
      const hash = yield* digest.sha256(new TextEncoder().encode("abc"))
      assert.strictEqual(
        hash,
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      )
    }).pipe(Effect.provide(DigestWebCrypto)),
  )
})
