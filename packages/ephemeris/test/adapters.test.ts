import { readFileSync } from "node:fs"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Ref } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { TestClock } from "effect/testing"
import { Horizons, HorizonsHttp, TileSource, tileSourceHttp } from "../src/repo/index.js"
import { CatalogUnavailableError, HorizonsError, TileCorruptError } from "../src/types/errors.js"
import { TdbSeconds } from "../src/types/time.js"

const respondWith = (...answers: ReadonlyArray<Response>) =>
  Effect.gen(function* () {
    const urls = yield* Ref.make<ReadonlyArray<string>>([])
    const client = HttpClient.make((request, url) =>
      Ref.modify(urls, (all) => [all.length, [...all, url.toString()]] as const).pipe(
        Effect.map((index) =>
          HttpClientResponse.fromWeb(request, (answers[index] ?? answers[answers.length - 1])!.clone()),
        ),
      ),
    )
    return { urls, layer: Layer.succeed(HttpClient.HttpClient, client) }
  })

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

const recorded = readFileSync(
  new URL("../../../fixtures/horizons/vectors-response.txt", import.meta.url),
  "utf8",
)
const REQUEST = {
  label: "Mercury",
  command: "199",
  center: "500@10",
  instants: [TdbSeconds(0)],
}

describe("HorizonsHttp", () => {
  it.effect("asks for geometric ICRF vectors, in km, for the given body and center", () =>
    Effect.gen(function* () {
      const { urls, layer } = yield* respondWith(json({ result: recorded }))
      const horizons = yield* Horizons.pipe(Effect.provide(HorizonsHttp.pipe(Layer.provide(layer))))
      const rows = yield* horizons.vectors(REQUEST)
      assert.strictEqual(rows.length, 12)
      const [url = ""] = yield* Ref.get(urls)
      const params = new URL(url).searchParams
      assert.strictEqual(params.get("COMMAND"), "'199'")
      assert.strictEqual(params.get("CENTER"), "'500@10'")
      assert.strictEqual(params.get("REF_PLANE"), "'FRAME'")
      assert.strictEqual(params.get("OUT_UNITS"), "'KM-S'")
      assert.strictEqual(params.get("TLIST"), "'2451545.000000'")
    }),
  )

  it.effect("retries a brief failure, because the service is public and shared", () =>
    Effect.gen(function* () {
      const { urls, layer } = yield* respondWith(json({}, 503), json({ result: recorded }))
      const horizons = yield* Horizons.pipe(Effect.provide(HorizonsHttp.pipe(Layer.provide(layer))))
      const fiber = yield* Effect.forkChild(horizons.vectors(REQUEST))
      yield* TestClock.adjust("10 seconds")
      const rows = yield* Fiber.join(fiber)
      assert.strictEqual(rows.length, 12)
      assert.strictEqual((yield* Ref.get(urls)).length, 2)
    }),
  )

  it.effect("reports a failure that outlasts its retries", () =>
    Effect.gen(function* () {
      const { urls, layer } = yield* respondWith(json({}, 503))
      const horizons = yield* Horizons.pipe(Effect.provide(HorizonsHttp.pipe(Layer.provide(layer))))
      const fiber = yield* Effect.forkChild(horizons.vectors(REQUEST).pipe(Effect.flip))
      yield* TestClock.adjust("1 minute")
      assert.instanceOf(yield* Fiber.join(fiber), HorizonsError)
      assert.strictEqual((yield* Ref.get(urls)).length, 4)
    }),
  )

  it.effect("reports an answer in an unexpected shape", () =>
    Effect.gen(function* () {
      const { layer } = yield* respondWith(json({ surprise: true }))
      const horizons = yield* Horizons.pipe(Effect.provide(HorizonsHttp.pipe(Layer.provide(layer))))
      const fiber = yield* Effect.forkChild(horizons.vectors(REQUEST).pipe(Effect.flip))
      yield* TestClock.adjust("1 minute")
      assert.instanceOf(yield* Fiber.join(fiber), HorizonsError)
    }),
  )
})

describe("tileSourceHttp", () => {
  const source = (layer: Layer.Layer<HttpClient.HttpClient>) =>
    TileSource.pipe(Effect.provide(tileSourceHttp("https://cdn.test/tiles").pipe(Layer.provide(layer))))
  const entry = { id: "t", blob: "t-abc.bin" } as Parameters<TileSource["Service"]["blob"]>[0]

  it.effect("fetches the catalog from the configured base URL", () =>
    Effect.gen(function* () {
      const { urls, layer } = yield* respondWith(json({ formatVersion: 1 }))
      const tiles = yield* source(layer)
      assert.deepStrictEqual(yield* tiles.catalogJson, { formatVersion: 1 })
      assert.deepStrictEqual(yield* Ref.get(urls), ["https://cdn.test/tiles/catalog.json"])
    }),
  )

  it.effect("reports a failed catalog request", () =>
    Effect.gen(function* () {
      const { layer } = yield* respondWith(json({}, 503))
      const tiles = yield* source(layer)
      assert.instanceOf(yield* tiles.catalogJson.pipe(Effect.flip), CatalogUnavailableError)
    }),
  )

  it.effect("fetches a blob by the name in its catalog entry", () =>
    Effect.gen(function* () {
      const { urls, layer } = yield* respondWith(new Response(new Uint8Array([1, 2, 3])))
      const tiles = yield* source(layer)
      assert.deepStrictEqual([...(yield* tiles.blob(entry))], [1, 2, 3])
      assert.deepStrictEqual(yield* Ref.get(urls), ["https://cdn.test/tiles/t-abc.bin"])
    }),
  )

  // A trace header makes a browser ask a CDN's permission first, and an ordinary CDN says no.
  it.effect("sends plain requests, so that a tile host on another origin need not allow trace headers", () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<ReadonlyArray<string>>([])
      const client = HttpClient.make((request) =>
        Ref.update(seen, (names) => [...names, ...Object.keys(request.headers)]).pipe(
          Effect.map(() => HttpClientResponse.fromWeb(request, new Response("{}"))),
        ),
      )
      const tiles = yield* source(Layer.succeed(HttpClient.HttpClient, client))
      yield* tiles.catalogJson
      yield* tiles.blob(entry)
      const names = yield* Ref.get(seen)
      assert.notInclude(names, "traceparent")
      assert.notInclude(names, "b3")
    }),
  )

  it.effect("treats a missing blob as a tile it cannot trust", () =>
    Effect.gen(function* () {
      const { layer } = yield* respondWith(new Response("", { status: 404 }))
      const tiles = yield* source(layer)
      assert.instanceOf(yield* tiles.blob(entry).pipe(Effect.flip), TileCorruptError)
    }),
  )
})
