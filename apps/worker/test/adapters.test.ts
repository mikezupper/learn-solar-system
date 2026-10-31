import { NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, Ref, type Scope } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { KernelSource, TileStore } from "@solar/ephemeris/repo"
import {
  CatalogUnavailableError,
  EmptyCatalog,
  KernelReadError,
  type KernelPin,
} from "@solar/ephemeris/types"
import { kernelSourceFile } from "../src/repo/kernel-file.js"
import { tileStoreFile } from "../src/repo/tile-store-file.js"

const KERNEL = new TextEncoder().encode("abc")
// The FIPS 180-2 SHA-256 test vector for "abc".
const KERNEL_SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"

const pin = (sha256: string): KernelPin => ({
  name: "test.bsp",
  url: "https://example.test/test.bsp",
  bytes: KERNEL.byteLength,
  sha256,
})

/** An HTTP client that serves `body` and counts what it served. */
const servingClient = (body: Uint8Array, requests: Ref.Ref<number>) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Ref.update(requests, (count) => count + 1).pipe(
        Effect.as(HttpClientResponse.fromWeb(request, new Response(body.slice()))),
      ),
    ),
  )

const withKernelSource = <A, E>(
  body: Uint8Array,
  use: (context: {
    readonly dir: string
    readonly requests: Ref.Ref<number>
  }) => Effect.Effect<A, E, KernelSource | FileSystem.FileSystem | Path.Path | Scope.Scope>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    const requests = yield* Ref.make(0)
    const layer = kernelSourceFile({ cacheDir: dir }).pipe(
      Layer.provide(servingClient(body, requests)),
    )
    return yield* use({ dir, requests }).pipe(Effect.provide(layer))
  }).pipe(Effect.provide(NodeServices.layer))

describe("kernelSourceFile", () => {
  it.live("downloads a kernel it does not have, then reads byte ranges from it", () =>
    withKernelSource(KERNEL, () =>
      Effect.gen(function* () {
        const kernels = yield* KernelSource
        const reader = yield* kernels.open(pin(KERNEL_SHA256))
        const bytes = yield* reader.read(1, 2)
        assert.deepStrictEqual(new TextDecoder().decode(bytes), "bc")
      }),
    ).pipe(Effect.scoped),
  )

  it.live("uses the cached copy on the second open", () =>
    withKernelSource(KERNEL, ({ requests }) =>
      Effect.gen(function* () {
        const kernels = yield* KernelSource
        yield* kernels.open(pin(KERNEL_SHA256))
        yield* kernels.open(pin(KERNEL_SHA256))
        assert.strictEqual(yield* Ref.get(requests), 1)
      }),
    ).pipe(Effect.scoped),
  )

  it.live("refuses a download that does not match the pin and keeps nothing", () =>
    withKernelSource(new TextEncoder().encode("tampered"), ({ dir }) =>
      Effect.gen(function* () {
        const kernels = yield* KernelSource
        const fs = yield* FileSystem.FileSystem
        const error = yield* kernels.open(pin(KERNEL_SHA256)).pipe(Effect.flip)
        assert.instanceOf(error, KernelReadError)
        assert.include(error.reason, KERNEL_SHA256)
        assert.deepStrictEqual(yield* fs.readDirectory(dir), [])
      }),
    ).pipe(Effect.scoped),
  )

  it.live("replaces a cached copy that has gone bad", () =>
    withKernelSource(KERNEL, ({ dir, requests }) =>
      Effect.gen(function* () {
        const kernels = yield* KernelSource
        const fs = yield* FileSystem.FileSystem
        yield* fs.writeFileString(`${dir}/test.bsp`, "rotten")
        const reader = yield* kernels.open(pin(KERNEL_SHA256))
        assert.deepStrictEqual(new TextDecoder().decode(yield* reader.read(0, 3)), "abc")
        assert.strictEqual(yield* Ref.get(requests), 1)
      }),
    ).pipe(Effect.scoped),
  )

  it.live("reports a read past the end as a short result, for the SPK reader to judge", () =>
    withKernelSource(KERNEL, () =>
      Effect.gen(function* () {
        const kernels = yield* KernelSource
        const reader = yield* kernels.open(pin(KERNEL_SHA256))
        assert.strictEqual((yield* reader.read(2, 100)).byteLength, 1)
        assert.strictEqual((yield* reader.read(50, 10)).byteLength, 0)
      }),
    ).pipe(Effect.scoped),
  )
})

const withStore = <A, E>(
  use: (dir: string) => Effect.Effect<A, E, TileStore | FileSystem.FileSystem | Path.Path>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    return yield* use(dir).pipe(Effect.provide(tileStoreFile({ dir })))
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped)

describe("tileStoreFile", () => {
  it.effect("starts from an empty catalog", () =>
    withStore(() =>
      Effect.gen(function* () {
        const store = yield* TileStore
        assert.deepStrictEqual(yield* store.readCatalog, EmptyCatalog)
      }),
    ),
  )

  it.effect("reads back the catalog it wrote, leaving no temporary files", () =>
    withStore((dir) =>
      Effect.gen(function* () {
        const store = yield* TileStore
        const fs = yield* FileSystem.FileSystem
        yield* store.putCatalog(EmptyCatalog)
        assert.deepStrictEqual(yield* store.readCatalog, EmptyCatalog)
        assert.deepStrictEqual(yield* fs.readDirectory(dir), ["catalog.json"])
      }),
    ),
  )

  it.effect("writes blobs under their given name", () =>
    withStore((dir) =>
      Effect.gen(function* () {
        const store = yield* TileStore
        const fs = yield* FileSystem.FileSystem
        yield* store.putBlob("tile.bin", KERNEL)
        assert.deepStrictEqual(yield* fs.readFile(`${dir}/tile.bin`), KERNEL)
      }),
    ),
  )

  it.effect("reports a catalog it cannot understand rather than overwriting it", () =>
    withStore((dir) =>
      Effect.gen(function* () {
        const store = yield* TileStore
        const fs = yield* FileSystem.FileSystem
        yield* fs.writeFileString(`${dir}/catalog.json`, '{"formatVersion":99,"tiles":[]}')
        const error = yield* store.readCatalog.pipe(Effect.flip)
        assert.instanceOf(error, CatalogUnavailableError)
      }),
    ),
  )
})
