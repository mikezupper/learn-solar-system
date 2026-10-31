import { readFileSync } from "node:fs"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema } from "effect"
import { Moment } from "@solar/classroom/types"
import { Digest, DigestWebCrypto, TileSource } from "@solar/ephemeris/repo"
import { CatalogUnavailableError, DigestError, TileCatalog } from "@solar/ephemeris/types"
import { readWebConfig } from "../src/config/index.js"
import { loadSky } from "../src/service/load-sky.js"

const fixture = (path: string) => new URL(`../../../fixtures/${path}`, import.meta.url)
const catalogJson: unknown = JSON.parse(readFileSync(fixture("tiles/catalog.json"), "utf8"))
const catalog = Schema.decodeUnknownSync(TileCatalog)(catalogJson)
const blob = new Uint8Array(readFileSync(fixture(`tiles/${catalog.tiles[0]?.blob ?? ""}`)))

const source = (bytes: Uint8Array, json: unknown = catalogJson) =>
  Layer.succeed(
    TileSource,
    TileSource.of({ catalogJson: Effect.succeed(json), blob: () => Effect.succeed(bytes) }),
  )
const JUNE = Moment(Date.UTC(2026, 5, 1))
const load = (moment: Moment, layer: Layer.Layer<TileSource | Digest>) =>
  loadSky(moment).pipe(Effect.provide(layer))

describe("loadSky", () => {
  it.effect("answers with a sky when the tile checks out", () =>
    Effect.gen(function* () {
      const answer = yield* load(JUNE, Layer.merge(source(blob), DigestWebCrypto))
      assert.strictEqual(answer._tag, "Loaded")
    }),
  )

  it.effect("names the years it has when the moment falls outside them", () =>
    Effect.gen(function* () {
      const answer = yield* load(
        Moment(Date.UTC(1990, 0, 1)),
        Layer.merge(source(blob), DigestWebCrypto),
      )
      assert.deepStrictEqual(
        answer._tag === "OutsideCatalog" ? [answer.firstYear, answer.lastYear] : [],
        [2026, 2027],
      )
    }),
  )

  it.effect("reports an empty catalog as unavailable, since it names no years", () =>
    Effect.gen(function* () {
      const answer = yield* load(
        JUNE,
        Layer.merge(source(blob, { formatVersion: 1, tiles: [] }), DigestWebCrypto),
      )
      assert.deepStrictEqual(answer._tag === "Failed" ? answer.problem : "", "CatalogUnavailable")
    }),
  )

  it.effect("tells the page which year it loaded, so that it can ask for the next", () =>
    Effect.gen(function* () {
      const answer = yield* load(JUNE, Layer.merge(source(blob), DigestWebCrypto))
      assert.strictEqual(answer._tag === "Loaded" ? answer.year : 0, 2026)
    }),
  )

  it.effect("calls a flipped byte damage, and gives no sky", () =>
    Effect.gen(function* () {
      const damaged = blob.slice()
      damaged[1000] = (damaged[1000] ?? 0) ^ 0xff
      const answer = yield* load(JUNE, Layer.merge(source(damaged), DigestWebCrypto))
      assert.deepStrictEqual(answer._tag === "Failed" ? answer.problem : "", "TileDamaged")
    }),
  )

  it.effect("calls a truncated blob damage", () =>
    Effect.gen(function* () {
      const answer = yield* load(JUNE, Layer.merge(source(blob.slice(0, 100)), DigestWebCrypto))
      assert.deepStrictEqual(answer._tag === "Failed" ? answer.problem : "", "TileDamaged")
    }),
  )

  it.effect("refuses to show bytes it could not check", () =>
    Effect.gen(function* () {
      const noDigest = Layer.succeed(
        Digest,
        Digest.of({ sha256: () => Effect.fail(new DigestError({ reason: "not a secure page" })) }),
      )
      const answer = yield* load(JUNE, Layer.merge(source(blob), noDigest))
      assert.deepStrictEqual(answer._tag === "Failed" ? answer.problem : "", "TileUncheckable")
    }),
  )

  it.effect("reports a catalog it cannot fetch", () =>
    Effect.gen(function* () {
      const down = Layer.succeed(
        TileSource,
        TileSource.of({
          catalogJson: Effect.fail(new CatalogUnavailableError({ reason: "offline" })),
          blob: () => Effect.succeed(blob),
        }),
      )
      const answer = yield* load(JUNE, Layer.merge(down, DigestWebCrypto))
      assert.deepStrictEqual(answer._tag === "Failed" ? answer.problem : "", "CatalogUnavailable")
    }),
  )
})

describe("readWebConfig", () => {
  const ORIGIN = "https://class.example.test"

  it("defaults to tiles beside the page, with telemetry off", () => {
    const config = readWebConfig({}, ORIGIN)
    assert.strictEqual(config.tileBaseUrl, "/tiles")
    assert.isTrue(Option.isNone(config.otlpBaseUrl))
  })

  it("reads what Vite injects", () => {
    const config = readWebConfig(
      { VITE_TILE_BASE_URL: "https://cdn.test/t", VITE_OTLP_BASE_URL: "https://otel.test/otlp", VITE_WORKTREE: "w" },
      ORIGIN,
    )
    assert.strictEqual(config.tileBaseUrl, "https://cdn.test/t")
    assert.deepStrictEqual(Option.getOrThrow(config.otlpBaseUrl), "https://otel.test/otlp")
    assert.strictEqual(config.worktree, "w")
  })

  // The dev server may be reached by any name, so telemetry goes back to wherever the page came from.
  it("resolves a telemetry path against the page's own address", () => {
    const config = readWebConfig({ VITE_OTLP_BASE_URL: "/otlp" }, ORIGIN)
    assert.strictEqual(Option.getOrThrow(config.otlpBaseUrl), "https://class.example.test/otlp")
  })

  it("falls back to the defaults if the values are the wrong type", () => {
    assert.strictEqual(readWebConfig({ VITE_TILE_BASE_URL: 7 }, ORIGIN).tileBaseUrl, "/tiles")
  })
})
