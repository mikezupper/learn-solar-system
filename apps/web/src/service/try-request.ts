import { Option, Schema } from "effect"
import type { PlanetName, SpeedName } from "@solar/classroom/types"
import { Framing, type TryRequest } from "../types/index.js"

const Speed = Schema.Literals(["day", "week", "month", "year", "stop"])
const Planet = Schema.Literals(["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"])

const decodeFraming = Schema.decodeUnknownOption(Framing)
const decodeSpeed = Schema.decodeUnknownOption(Speed)
const decodePlanet = Schema.decodeUnknownOption(Planet)

/**
 * Reads a button in the explanation. These live in static HTML that no type checks, so a button whose
 * attributes make no sense does nothing, and a highlight is the only optional part.
 */
export const readTryRequest = (dataset: {
  readonly tryView?: string | undefined
  readonly trySpeed?: string | undefined
  readonly tryPlanet?: string | undefined
}): Option.Option<TryRequest> =>
  Option.map(
    Option.all({ framing: decodeFraming(dataset.tryView), speed: decodeSpeed(dataset.trySpeed) }),
    ({ framing, speed }): TryRequest => ({
      framing,
      speed: speed satisfies SpeedName | "stop",
      highlight: decodePlanet(dataset.tryPlanet) satisfies Option.Option<PlanetName>,
    }),
  )
