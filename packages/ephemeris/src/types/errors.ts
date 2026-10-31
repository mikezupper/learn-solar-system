import { Schema } from "effect"

/** The kernel file could not be read, or a downloaded copy did not match its lock entry. */
export class KernelReadError extends Schema.TaggedError<KernelReadError>()("KernelReadError", {
  path: Schema.String,
  reason: Schema.String,
}) {}

/** The bytes were read, but they are not an SPK file this reader can evaluate. */
export class KernelFormatError extends Schema.TaggedError<KernelFormatError>()(
  "KernelFormatError",
  { message: Schema.String },
) {}

/** The kernel does not hold data for the bodies or the dates a tile asked for. */
export class KernelCoverageError extends Schema.TaggedError<KernelCoverageError>()(
  "KernelCoverageError",
  { message: Schema.String },
) {}

/** A tile's bytes do not match its catalog entry, so none of its numbers can be trusted. */
export class TileCorruptError extends Schema.TaggedError<TileCorruptError>()("TileCorruptError", {
  tileId: Schema.String,
  reason: Schema.String,
}) {}

/** The tile store could not be read or written. */
export class TileStoreError extends Schema.TaggedError<TileStoreError>()("TileStoreError", {
  path: Schema.String,
  reason: Schema.String,
}) {}

/** The published catalog could not be fetched, or was not a catalog this reader understands. */
export class CatalogUnavailableError extends Schema.TaggedError<CatalogUnavailableError>()(
  "CatalogUnavailableError",
  { reason: Schema.String },
) {}

/** JPL Horizons could not be reached, or answered with something other than the requested table. */
export class HorizonsError extends Schema.TaggedError<HorizonsError>()("HorizonsError", {
  request: Schema.String,
  reason: Schema.String,
}) {}

/** The platform could not compute a hash. Browsers offer SHA-256 only on https and localhost. */
export class DigestError extends Schema.TaggedError<DigestError>()("DigestError", {
  reason: Schema.String,
}) {}

/** A tile failed verification, so it was not published. Carries the evidence for the log. */
export class TileRejectedError extends Schema.TaggedError<TileRejectedError>()(
  "TileRejectedError",
  {
    tileId: Schema.String,
    worstBody: Schema.String,
    errorKm: Schema.Number,
    limitKm: Schema.Number,
  },
) {}
