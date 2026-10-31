import { NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Ref } from "effect"
import { DigestWebCrypto } from "@solar/ephemeris/repo"
import { KernelReadError } from "@solar/ephemeris/types"
import {
  horizonsAgreeing,
  kernelOf,
  memoryStore,
  stillKernel,
} from "../../../packages/ephemeris/test/fakes.js"
import { buildCatalog, parseYears } from "../src/service/build-catalog.js"

const LOCK = JSON.stringify({
  kernels: [{ name: "de440s.bsp", url: "https://example.test/k", bytes: 1, sha256: "abc" }],
})

const withLock = <A, E, R>(text: string, use: (path: string) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    const path = `${dir}/lock.json`
    yield* fs.writeFileString(path, text)
    return yield* use(path)
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped)

describe("buildCatalog", () => {
  it.effect("builds each requested year into one catalog, in date order", () =>
    withLock(LOCK, (lockFile) =>
      Effect.gen(function* () {
        const store = yield* memoryStore
        const layer = Layer.mergeAll(
          kernelOf(stillKernel()),
          horizonsAgreeing(),
          DigestWebCrypto,
          store.layer,
        )
        yield* buildCatalog({ lockFile, years: [2027, 2026] }).pipe(Effect.provide(layer))
        const catalog = yield* Ref.get(store.catalog)
        assert.deepStrictEqual(catalog.tiles.map((tile) => tile.year), [2026, 2027])
      }),
    ),
  )

  it.effect("stops when the lock file does not pin the kernel it needs", () =>
    withLock('{"kernels":[]}', (lockFile) =>
      Effect.gen(function* () {
        const store = yield* memoryStore
        const layer = Layer.mergeAll(kernelOf(stillKernel()), horizonsAgreeing(), DigestWebCrypto, store.layer)
        const error = yield* buildCatalog({ lockFile, years: [2026] }).pipe(
          Effect.provide(layer),
          Effect.flip,
        )
        assert.instanceOf(error, KernelReadError)
        assert.include((error as KernelReadError).reason, "de440s.bsp")
      }),
    ),
  )

  it.effect("stops on a lock file it cannot read", () =>
    withLock("not json", (lockFile) =>
      Effect.gen(function* () {
        const store = yield* memoryStore
        const layer = Layer.mergeAll(kernelOf(stillKernel()), horizonsAgreeing(), DigestWebCrypto, store.layer)
        const error = yield* buildCatalog({ lockFile, years: [2026] }).pipe(
          Effect.provide(layer),
          Effect.flip,
        )
        assert.instanceOf(error, KernelReadError)
      }),
    ),
  )
})

describe("parseYears", () => {
  it("reads a comma-separated list, allowing spaces", () => {
    assert.deepStrictEqual(parseYears("2025, 2026,2027"), [2025, 2026, 2027])
  })

  it("leaves out anything that is not a whole year", () => {
    assert.deepStrictEqual(parseYears("2025,soon,20.5,-1"), [2025])
  })
})
