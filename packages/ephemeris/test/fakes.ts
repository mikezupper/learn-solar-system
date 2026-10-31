import { Effect, Layer, Ref } from "effect"
import { Horizons, KernelSource, TileStore } from "../src/repo/index.js"
import { tdbFromUtcMillis } from "../src/service/time-scale.js"
import { EmptyCatalog, type KernelPin, type TileCatalog, type TileEntry } from "../src/types/catalog.js"
import type { Vector3Km } from "../src/types/bodies.js"
import { HorizonsError } from "../src/types/errors.js"
import { buildSpk } from "./spk-builder.js"

/** Stand-ins for the outside world, shared by workflow tests. Each is a real implementation of its port. */
export const positionOf = (id: number): Vector3Km => [id * 1000, id * 10, id]

const BODIES = [10, 199, 299, 399, 301, 4, 5, 6, 7, 8, 9]

/** A kernel in which every body sits still at `positionOf(id)` from 2020 through 2030. */
export const stillKernel = (): Uint8Array => {
  const init = tdbFromUtcMillis(Date.UTC(2020, 0, 1))
  const span = tdbFromUtcMillis(Date.UTC(2030, 0, 1)) - init
  return buildSpk(
    BODIES.map((target) => {
      const [x, y, z] = positionOf(target)
      return {
        target,
        center: 0,
        dataType: 2 as const,
        initSeconds: init,
        intervalSeconds: span,
        records: [[x, 0, y, 0, z, 0]],
      }
    }),
  )
}

export const PIN: KernelPin = {
  name: "still.bsp",
  url: "https://example.test/still.bsp",
  bytes: 0,
  sha256: "pinned-hash",
}

export const kernelOf = (bytes: Uint8Array) =>
  Layer.succeed(
    KernelSource,
    KernelSource.of({
      open: () =>
        Effect.succeed({
          read: (offset, length) => Effect.succeed(bytes.subarray(offset, offset + length)),
        }),
    }),
  )

/** A Horizons that agrees with `stillKernel`, except for the error added to every answer. */
export const horizonsAgreeing = (errorKm = 0) =>
  Layer.succeed(
    Horizons,
    Horizons.of({
      vectors: ({ command, center, instants }) =>
        Effect.succeed(
          instants.map((at) => {
            const target = positionOf(Number(command))
            const origin = positionOf(Number(center.split("@")[1]))
            return {
              at,
              positionKm: [target[0] - origin[0] + errorKm, target[1] - origin[1], target[2] - origin[2]],
            }
          }),
        ),
    }),
  )

export const horizonsDown = Layer.succeed(
  Horizons,
  Horizons.of({
    vectors: ({ label }) => Effect.fail(new HorizonsError({ request: label, reason: "503" })),
  }),
)

/** A tile store in memory that records the order of its writes. */
export const memoryStore = Effect.suspend(() => memoryStoreStartingWith(EmptyCatalog))

/** The same store, with one tile already published. */
export const memoryStoreHolding = (entry: TileEntry) =>
  memoryStoreStartingWith({ formatVersion: 1, tiles: [entry] })

const memoryStoreStartingWith = (initial: TileCatalog) => Effect.gen(function* () {
  const writes = yield* Ref.make<ReadonlyArray<string>>([])
  const catalog = yield* Ref.make<TileCatalog>(initial)
  const layer = Layer.succeed(
    TileStore,
    TileStore.of({
      readCatalog: Ref.get(catalog),
      putBlob: (name) => Ref.update(writes, (all) => [...all, `blob:${name}`]),
      putCatalog: (next) =>
        Ref.set(catalog, next).pipe(Effect.andThen(Ref.update(writes, (all) => [...all, "catalog"]))),
    }),
  )
  return { layer, writes, catalog }
})
