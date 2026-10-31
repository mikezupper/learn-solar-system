import { Effect, FileSystem, Layer, Path, Schema } from "effect"
import { TileStore } from "@solar/ephemeris/repo"
import {
  CatalogUnavailableError,
  EmptyCatalog,
  TileCatalog,
  TileStoreError,
} from "@solar/ephemeris/types"

const CATALOG = "catalog.json"

const encodeCatalog = Schema.encodeEffect(Schema.fromJsonString(TileCatalog))
const decodeCatalog = Schema.decodeEffect(Schema.fromJsonString(TileCatalog))

/**
 * A tile store in a local directory. The same layout works on a CDN once a bucket adapter exists.
 * Writing to a temporary name and renaming keeps every file whole for concurrent readers.
 */
export const tileStoreFile = (options: { readonly dir: string }) =>
  Layer.effect(
    TileStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const inDir = (name: string) => path.join(options.dir, name)
      const fail = (name: string) => (cause: unknown) =>
        new TileStoreError({ path: inDir(name), reason: String(cause) })

      const replace = (name: string, bytes: Uint8Array) =>
        Effect.gen(function* () {
          const temporary = inDir(`.${name}.tmp`)
          yield* fs.makeDirectory(options.dir, { recursive: true })
          yield* fs.writeFile(temporary, bytes)
          yield* fs.rename(temporary, inDir(name))
        }).pipe(Effect.mapError(fail(name)))

      return TileStore.of({
        readCatalog: Effect.gen(function* () {
          const exists = yield* fs.exists(inDir(CATALOG)).pipe(Effect.mapError(fail(CATALOG)))
          if (!exists) return EmptyCatalog
          const text = yield* fs.readFileString(inDir(CATALOG)).pipe(Effect.mapError(fail(CATALOG)))
          return yield* decodeCatalog(text).pipe(
            Effect.mapError((cause) => new CatalogUnavailableError({ reason: String(cause) })),
          )
        }),
        putBlob: Effect.fn("TileStore.putBlob")((name: string, bytes: Uint8Array) =>
          replace(name, bytes),
        ),
        putCatalog: Effect.fn("TileStore.putCatalog")((catalog: TileCatalog) =>
          encodeCatalog(catalog).pipe(
            Effect.mapError(fail(CATALOG)),
            Effect.flatMap((text) => replace(CATALOG, new TextEncoder().encode(`${text}\n`))),
          ),
        ),
      })
    }),
  )
