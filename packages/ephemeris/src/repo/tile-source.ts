import { Context, Effect, Layer } from "effect"
import { HttpClient } from "effect/http"
import type { TileEntry } from "../types/catalog.js"
import { CatalogUnavailableError, TileCorruptError } from "../types/errors.js"

/** Where a reader gets published tiles from. The catalog arrives undecoded: decoding is the boundary. */
export class TileSource extends Context.Service<
  TileSource,
  {
    readonly catalogJson: Effect.Effect<unknown, CatalogUnavailableError>
    readonly blob: (entry: TileEntry) => Effect.Effect<Uint8Array, TileCorruptError>
  }
>()("ephemeris/repo/TileSource") {}

/**
 * Reads the catalog and blobs over HTTP from a directory such as a CDN path. Requests carry no trace
 * headers: they would trigger a CORS preflight that an ordinary static host refuses, so a page whose
 * tiles live on another origin could never load them. The client span is still recorded here.
 */
export const tileSourceHttp = (baseUrl: string) =>
  Layer.effect(
    TileSource,
    Effect.gen(function* () {
      const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
      return TileSource.of({
        catalogJson: client.get(`${baseUrl}/catalog.json`).pipe(
          Effect.flatMap((response) => response.json),
          Effect.mapError((cause) => new CatalogUnavailableError({ reason: String(cause) })),
          Effect.provideService(HttpClient.TracerPropagationEnabled, false),
          Effect.withSpan("TileSource.catalogJson"),
        ),
        blob: Effect.fn("TileSource.blob")((entry: TileEntry) =>
          client.get(`${baseUrl}/${entry.blob}`).pipe(
            Effect.flatMap((response) => response.arrayBuffer),
            Effect.map((buffer) => new Uint8Array(buffer)),
            Effect.mapError(
              (cause) => new TileCorruptError({ tileId: entry.id, reason: String(cause) }),
            ),
            Effect.provideService(HttpClient.TracerPropagationEnabled, false),
          ),
        ),
      })
    }),
  )
