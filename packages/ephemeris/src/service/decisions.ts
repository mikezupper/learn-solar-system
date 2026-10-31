import { Array, Data, Option, Order, pipe } from "effect"
import type { Vector3Km } from "../types/bodies.js"
import type { TileCatalog, TileEntry, TileVerification } from "../types/catalog.js"
import type { TdbSeconds } from "../types/time.js"

/** One comparison of a tile against an independent source, at one instant. */
export interface VerificationSample {
  readonly body: string
  readonly at: TdbSeconds
  readonly expectedKm: Vector3Km
  readonly actualKm: Vector3Km
}

export type VerificationOutcome = Data.TaggedEnum<{
  TileVerified: { readonly tileId: string; readonly verification: TileVerification }
  TileRejected: {
    readonly tileId: string
    readonly worstBody: string
    readonly errorKm: number
    readonly limitKm: number
  }
}>
export const VerificationOutcome = Data.taggedEnum<VerificationOutcome>()

export const VERIFICATION_SOURCE = "JPL Horizons API"

const errorKm = ({ expectedKm, actualKm }: VerificationSample): number =>
  Math.hypot(
    actualKm[0] - expectedKm[0],
    actualKm[1] - expectedKm[1],
    actualKm[2] - expectedKm[2],
  )

/** A tile passes only if it was checked at all and no sample exceeds the limit. */
export const decideVerification = (input: {
  readonly tileId: string
  readonly samples: ReadonlyArray<VerificationSample>
  readonly limitKm: number
}): VerificationOutcome => {
  const { tileId, samples, limitKm } = input
  return pipe(
    samples,
    Array.map((sample) => ({ body: sample.body, at: sample.at, errorKm: errorKm(sample) })),
    Array.sortWith((sample) => sample.errorKm, Order.flip(Order.Number)),
    Array.head,
    Option.match({
      onNone: () =>
        VerificationOutcome.TileRejected({
          tileId,
          worstBody: "no samples",
          errorKm: Number.POSITIVE_INFINITY,
          limitKm,
        }),
      onSome: (worst) =>
        worst.errorKm > limitKm
          ? VerificationOutcome.TileRejected({
              tileId,
              worstBody: worst.body,
              errorKm: worst.errorKm,
              limitKm,
            })
          : VerificationOutcome.TileVerified({
              tileId,
              verification: {
                source: VERIFICATION_SOURCE,
                instantsChecked: new Set(samples.map((sample) => sample.at)).size,
                bodiesChecked: new Set(samples.map((sample) => sample.body)).size,
                maxErrorKm: worst.errorKm,
                limitKm,
              },
            }),
    }),
  )
}

export interface TilePublished {
  readonly _tag: "TilePublished"
  readonly tileId: string
  readonly sha256: string
}

/**
 * Adds a tile to the catalog, or replaces the same year's tile after a rebuild. Answers none when
 * the catalog already lists these exact bytes, so a rerun of the worker records nothing.
 */
export const decidePublication = (
  catalog: TileCatalog,
  entry: TileEntry,
): Option.Option<{ readonly event: TilePublished; readonly catalog: TileCatalog }> => {
  const unchanged = catalog.tiles.some(
    (tile) => tile.id === entry.id && tile.sha256 === entry.sha256,
  )
  if (unchanged) return Option.none()
  const others = catalog.tiles.filter((tile) => tile.id !== entry.id)
  return Option.some({
    event: { _tag: "TilePublished", tileId: entry.id, sha256: entry.sha256 },
    catalog: {
      ...catalog,
      tiles: Array.sortWith([...others, entry], (tile) => tile.startSeconds, Order.Number),
    },
  })
}
