import { Context, type Effect } from "effect"
import type { TileCatalog } from "../types/catalog.js"
import type { CatalogUnavailableError, TileStoreError } from "../types/errors.js"

/**
 * Where the worker publishes. `putCatalog` must replace the catalog atomically: a reader sees the
 * old list or the new list, never part of one.
 */
export class TileStore extends Context.Service<
  TileStore,
  {
    readonly readCatalog: Effect.Effect<TileCatalog, TileStoreError | CatalogUnavailableError>
    readonly putBlob: (name: string, bytes: Uint8Array) => Effect.Effect<void, TileStoreError>
    readonly putCatalog: (catalog: TileCatalog) => Effect.Effect<void, TileStoreError>
  }
>()("ephemeris/repo/TileStore") {}
