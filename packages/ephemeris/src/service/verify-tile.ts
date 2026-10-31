import { Array, Effect, Option } from "effect"
import { Horizons } from "../repo/index.js"
import { Naif, type NaifId } from "../types/bodies.js"
import { KernelCoverageError, type HorizonsError } from "../types/errors.js"
import { TdbSeconds } from "../types/time.js"
import { decideVerification, type VerificationOutcome, type VerificationSample } from "./decisions.js"
import { trackFor, type Tile } from "./tile.js"

/** What a tile must agree with Horizons on. Each entry names the same pair in both vocabularies. */
export const PLANET_CHECKS: ReadonlyArray<{
  readonly body: string
  readonly target: NaifId
  readonly center: NaifId
  readonly command: string
  readonly horizonsCenter: string
}> = [
  { body: "Mercury", target: Naif.Mercury, center: Naif.Sun, command: "199", horizonsCenter: "500@10" },
  { body: "Venus", target: Naif.Venus, center: Naif.Sun, command: "299", horizonsCenter: "500@10" },
  { body: "Earth", target: Naif.Earth, center: Naif.Sun, command: "399", horizonsCenter: "500@10" },
  { body: "Moon", target: Naif.Moon, center: Naif.Earth, command: "301", horizonsCenter: "500@399" },
  { body: "Mars", target: Naif.MarsBarycenter, center: Naif.Sun, command: "4", horizonsCenter: "500@10" },
  { body: "Jupiter", target: Naif.JupiterBarycenter, center: Naif.Sun, command: "5", horizonsCenter: "500@10" },
  { body: "Saturn", target: Naif.SaturnBarycenter, center: Naif.Sun, command: "6", horizonsCenter: "500@10" },
  { body: "Uranus", target: Naif.UranusBarycenter, center: Naif.Sun, command: "7", horizonsCenter: "500@10" },
  { body: "Neptune", target: Naif.NeptuneBarycenter, center: Naif.Sun, command: "8", horizonsCenter: "500@10" },
]

/**
 * Instants spread evenly across a span. The fractional offset keeps them away from Chebyshev record
 * boundaries, which fall on round numbers of days.
 */
export const spreadInstants = (
  startSeconds: TdbSeconds,
  endSeconds: TdbSeconds,
  count: number,
): ReadonlyArray<TdbSeconds> =>
  Array.makeBy(count, (index) =>
    TdbSeconds(startSeconds + ((index + 0.37) / count) * (endSeconds - startSeconds)),
  )

/**
 * Asks Horizons where each body is, asks the tile the same question, and decides. Runs one request
 * at a time because Horizons is a shared public service.
 */
export const verifyTile = Effect.fn("Tile.verify")(function* (input: {
  readonly tileId: string
  readonly tile: Tile
  readonly instants: ReadonlyArray<TdbSeconds>
  readonly limitKm: number
}): Effect.fn.Return<VerificationOutcome, HorizonsError | KernelCoverageError, Horizons> {
  const horizons = yield* Horizons
  const samples = yield* Effect.forEach(PLANET_CHECKS, (check) =>
    Effect.gen(function* () {
      const track = yield* Option.match(trackFor(input.tile, check.target, check.center), {
        onSome: Effect.succeed,
        onNone: () =>
          Effect.fail(
            new KernelCoverageError({ message: `Tile ${input.tileId} has no track for ${check.body}.` }),
          ),
      })
      const rows = yield* horizons.vectors({
        label: `${check.body} relative to ${check.horizonsCenter}`,
        command: check.command,
        center: check.horizonsCenter,
        instants: input.instants,
      })
      return rows.map(
        (row): VerificationSample => ({
          body: check.body,
          at: row.at,
          expectedKm: row.positionKm,
          actualKm: track(row.at),
        }),
      )
    }),
  )
  return decideVerification({
    tileId: input.tileId,
    samples: samples.flat(),
    limitKm: input.limitKm,
  })
})
