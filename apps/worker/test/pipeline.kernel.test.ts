import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { NodeHttpClient, NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { Digest, DigestWebCrypto, KernelSource } from "@solar/ephemeris/repo"
import { compileTile, readSpkSegments, tdbFromUtcMillis } from "@solar/ephemeris/service"
import { KernelLock, TileCatalog } from "@solar/ephemeris/types"
import { kernelSourceFile } from "../src/repo/kernel-file.js"

const root = new URL("../../../", import.meta.url)
const lock = Schema.decodeUnknownSync(KernelLock)(
  JSON.parse(readFileSync(new URL("data/kernels.lock.json", root), "utf8")),
)
const catalog = Schema.decodeUnknownSync(TileCatalog)(
  JSON.parse(readFileSync(new URL("fixtures/tiles/catalog.json", root), "utf8")),
)

const live = Layer.mergeAll(
  kernelSourceFile({ cacheDir: join(homedir(), ".cache", "solar-system", "kernels") }),
  DigestWebCrypto,
).pipe(Layer.provide(NodeServices.layer), Layer.provide(NodeHttpClient.layerFetch))

describe("the real DE440s kernel", () => {
  it.live("still compiles to the exact bytes of the committed fixture", () =>
    Effect.gen(function* () {
      const kernels = yield* KernelSource
      const digest = yield* Digest
      const [pin] = lock.kernels
      const [entry] = catalog.tiles
      if (pin === undefined || entry === undefined) return assert.fail("Missing lock or fixture")
      const reader = yield* kernels.open(pin)
      const compiled = yield* compileTile({
        reader,
        segments: yield* readSpkSegments(reader),
        startSeconds: tdbFromUtcMillis(Date.UTC(2026, 0, 1)),
        endSeconds: tdbFromUtcMillis(Date.UTC(2027, 0, 1)),
      })
      assert.strictEqual(yield* digest.sha256(compiled.bytes), entry.sha256)
    }).pipe(Effect.scoped, Effect.provide(live)),
  )
})
