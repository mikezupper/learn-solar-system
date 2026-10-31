import { Schema } from "effect"
import { NaifIdSchema } from "./bodies.js"
import { TdbSecondsSchema } from "./time.js"

/** One body's slice of Chebyshev records inside a tile's flat coefficient array. */
export const TileSegment = Schema.Struct({
  target: NaifIdSchema,
  center: NaifIdSchema,
  initSeconds: TdbSecondsSchema,
  intervalSeconds: Schema.Number,
  coefficientsPerAxis: Schema.Int,
  recordCount: Schema.Int,
  byteOffset: Schema.Int,
})
export type TileSegment = typeof TileSegment.Type

/** Where a tile's numbers came from. Together these reproduce its bytes exactly. */
export const TileProvenance = Schema.Struct({
  kernel: Schema.String,
  kernelSha256: Schema.String,
})
export type TileProvenance = typeof TileProvenance.Type

/** The evidence that let a tile through the publish gate. */
export const TileVerification = Schema.Struct({
  source: Schema.String,
  instantsChecked: Schema.Int,
  bodiesChecked: Schema.Int,
  maxErrorKm: Schema.Number,
  limitKm: Schema.Number,
})
export type TileVerification = typeof TileVerification.Type

/**
 * A published tile. The blob's name contains its hash, so a blob never changes after publication and
 * can be cached forever; only the catalog that lists it changes.
 */
export const TileEntry = Schema.Struct({
  id: Schema.String,
  system: Schema.Literal("planets"),
  startSeconds: TdbSecondsSchema,
  endSeconds: TdbSecondsSchema,
  blob: Schema.String,
  byteLength: Schema.Int,
  sha256: Schema.String,
  segments: Schema.Array(TileSegment),
  provenance: TileProvenance,
  verification: TileVerification,
})
export type TileEntry = typeof TileEntry.Type

/**
 * The list of everything published. `formatVersion` changes only when an older reader would
 * misread a tile; decoding then fails, so a stale page reports the mismatch instead of drawing
 * wrong planets.
 */
export const TileCatalog = Schema.Struct({
  formatVersion: Schema.Literal(1),
  tiles: Schema.Array(TileEntry),
})
export type TileCatalog = typeof TileCatalog.Type

export const EmptyCatalog: TileCatalog = { formatVersion: 1, tiles: [] }

/** A pinned input: the worker downloads this exact file, or stops. */
export const KernelPin = Schema.Struct({
  name: Schema.String,
  url: Schema.String,
  bytes: Schema.Int,
  sha256: Schema.String,
})
export type KernelPin = typeof KernelPin.Type

export const KernelLock = Schema.Struct({
  kernels: Schema.Array(KernelPin),
})
export type KernelLock = typeof KernelLock.Type
