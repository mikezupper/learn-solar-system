import type { NaifId, Vector3Km } from "./bodies.js"
import type { TileSegment } from "./catalog.js"
import type { TdbSeconds } from "./time.js"

/** A tile ready to evaluate: its table of contents and its coefficients as one flat array. */
export interface Tile {
  readonly segments: ReadonlyMap<NaifId, TileSegment>
  readonly coefficients: Float64Array
}

/** A body's position relative to some center, as a function of time. */
export type Track = (at: TdbSeconds) => Vector3Km
