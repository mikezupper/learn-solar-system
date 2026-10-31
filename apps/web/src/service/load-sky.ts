import { Array, Effect, Metric, Option, pipe } from "effect"
import type { Moment } from "@solar/classroom/types"
import { makeSky } from "@solar/classroom/service"
import { loadCatalog, loadTile, selectTile, tdbFromUtcMillis } from "@solar/ephemeris/service"
import type { TileCatalog } from "@solar/ephemeris/types"
import { Instruments } from "@solar/providers"
import { SkyLoad, type FramesMeasured } from "../types/index.js"

const outsideCatalog = (catalog: TileCatalog): SkyLoad => {
  const years = catalog.tiles.map((tile) => tile.year)
  return pipe(
    Array.match(years, {
      onEmpty: () => SkyLoad.Failed({ problem: "CatalogUnavailable" }),
      onNonEmpty: (some) =>
        SkyLoad.OutsideCatalog({ firstYear: Math.min(...some), lastYear: Math.max(...some) }),
    }),
  )
}

/** Fetches the tile for a moment. Every failure becomes an answer the page knows how to explain. */
export const loadSky = Effect.fn("Sky.load")(
  function* (moment: Moment) {
    const catalog = yield* loadCatalog
    const entry = selectTile(catalog, tdbFromUtcMillis(moment))
    if (Option.isNone(entry)) return outsideCatalog(catalog)
    const tile = yield* loadTile(entry.value)
    return Option.match(makeSky(tile), {
      onNone: () => SkyLoad.Failed({ problem: "TileDamaged" }),
      onSome: (sky) =>
        SkyLoad.Loaded({ sky, endSeconds: entry.value.endSeconds, year: entry.value.year }),
    })
  },
  Effect.catchTags({
    CatalogUnavailableError: (error) =>
      Effect.logError("catalog unavailable", { reason: error.reason }).pipe(
        Effect.as(SkyLoad.Failed({ problem: "CatalogUnavailable" })),
      ),
    TileCorruptError: (error) =>
      Effect.logError("tile rejected", { tileId: error.tileId, reason: error.reason }).pipe(
        Effect.as(SkyLoad.Failed({ problem: "TileDamaged" })),
      ),
    DigestError: (error) =>
      Effect.logError("could not check a tile", { reason: error.reason }).pipe(
        Effect.as(SkyLoad.Failed({ problem: "TileUncheckable" })),
      ),
  }),
)

/** Records a window of frame timings. The stage measures them; this reports them. */
export const recordFrames = (stats: FramesMeasured) =>
  Metric.update(Instruments.frameDuration, stats.worstMs)

