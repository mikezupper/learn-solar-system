import { Array, Effect, Option, pipe, Schema } from "effect"
import { Digest, TileSource } from "../repo/index.js"
import { TileCatalog, type TileEntry } from "../types/catalog.js"
import { CatalogUnavailableError, TileCorruptError } from "../types/errors.js"
import type { TdbSeconds } from "../types/time.js"
import { makeTile } from "./tile.js"

const decodeCatalog = Schema.decodeUnknownEffect(TileCatalog)

/** The tile that holds an instant. Tiles abut, so a boundary instant belongs to the later one. */
export const selectTile = (catalog: TileCatalog, at: TdbSeconds): Option.Option<TileEntry> =>
  pipe(
    catalog.tiles,
    Array.findFirst((tile) => tile.startSeconds <= at && at < tile.endSeconds),
  )

/** Fetches and decodes the catalog. A format this reader does not know is an error, not a guess. */
export const loadCatalog = Effect.gen(function* () {
  const source = yield* TileSource
  const json = yield* source.catalogJson
  return yield* decodeCatalog(json).pipe(
    Effect.mapError((cause) => new CatalogUnavailableError({ reason: String(cause) })),
  )
}).pipe(Effect.withSpan("Tile.loadCatalog"))

/** Fetches a tile and checks its bytes against the catalog before anyone reads a number from it. */
export const loadTile = Effect.fn("Tile.load")(function* (entry: TileEntry) {
  const source = yield* TileSource
  const digest = yield* Digest
  const bytes = yield* source.blob(entry)
  if (bytes.byteLength !== entry.byteLength) {
    return yield* new TileCorruptError({
      tileId: entry.id,
      reason: `Expected ${String(entry.byteLength)} bytes, received ${String(bytes.byteLength)}.`,
    })
  }
  const actual = yield* digest.sha256(bytes)
  if (actual !== entry.sha256) {
    return yield* new TileCorruptError({
      tileId: entry.id,
      reason: `Expected SHA-256 ${entry.sha256}, received ${actual}.`,
    })
  }
  return makeTile(entry.segments, bytes)
})
