import { Array, Option, pipe } from "effect"
import { Naif, type NaifId, type Vector3Km } from "../types/bodies.js"
import type { TileSegment } from "../types/catalog.js"
import type { TdbSeconds } from "../types/time.js"
import { evaluateChebyshev } from "./chebyshev.js"

/** A tile ready to evaluate: its table of contents and its coefficients as one flat array. */
export interface Tile {
  readonly segments: ReadonlyMap<NaifId, TileSegment>
  readonly coefficients: Float64Array
}

/** A body's position relative to some center, as a function of time. */
export type Track = (at: TdbSeconds) => Vector3Km

const DOUBLE_BYTES = 8
const AXES = 3
const ZERO: Vector3Km = [0, 0, 0]

export const makeTile = (segments: ReadonlyArray<TileSegment>, bytes: Uint8Array): Tile => ({
  segments: new Map(segments.map((segment) => [segment.target, segment])),
  // The copy guarantees the 8-byte alignment a Float64Array requires.
  coefficients: new Float64Array(bytes.slice().buffer),
})

const segmentPosition = (
  coefficients: Float64Array,
  segment: TileSegment,
  at: TdbSeconds,
): Vector3Km => {
  const elapsed = at - segment.initSeconds
  const record = Math.max(
    0,
    Math.min(segment.recordCount - 1, Math.floor(elapsed / segment.intervalSeconds)),
  )
  const s = (2 * (elapsed - record * segment.intervalSeconds)) / segment.intervalSeconds - 1
  const count = segment.coefficientsPerAxis
  const base = segment.byteOffset / DOUBLE_BYTES + record * count * AXES
  return [
    evaluateChebyshev(coefficients, base, count, s),
    evaluateChebyshev(coefficients, base + count, count, s),
    evaluateChebyshev(coefficients, base + 2 * count, count, s),
  ]
}

/** The segments that lead from a body up to the solar-system barycenter, or none if the path breaks. */
const pathToRoot = (
  segments: Tile["segments"],
  body: NaifId,
): Option.Option<ReadonlyArray<TileSegment>> => {
  if (body === Naif.SolarSystemBarycenter) return Option.some([])
  return pipe(
    Option.fromNullishOr(segments.get(body)),
    Option.flatMap((segment) =>
      pipe(
        pathToRoot(segments, segment.center),
        Option.map((rest) => Array.prepend(rest, segment)),
      ),
    ),
  )
}

/**
 * Finds how to compute `target` relative to `center`, once, so that evaluating it every frame cannot
 * fail. The result is none when the tile does not hold one of the two bodies.
 */
export const trackFor = (tile: Tile, target: NaifId, center: NaifId): Option.Option<Track> =>
  Option.map(
    Option.all([pathToRoot(tile.segments, target), pathToRoot(tile.segments, center)]),
    ([targetPath, centerPath]) => {
      const barycentric = (path: ReadonlyArray<TileSegment>, at: TdbSeconds): Vector3Km =>
        path.reduce<Vector3Km>((sum, segment) => {
          const [x, y, z] = segmentPosition(tile.coefficients, segment, at)
          return [sum[0] + x, sum[1] + y, sum[2] + z]
        }, ZERO)
      return (at) => {
        const [x, y, z] = barycentric(targetPath, at)
        const [cx, cy, cz] = barycentric(centerPath, at)
        return [x - cx, y - cy, z - cz]
      }
    },
  )
