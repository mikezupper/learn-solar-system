import { Brand, Data, type Option } from "effect"
import { Naif, type NaifId, type Track, type Vector3Km } from "@solar/ephemeris/types"

/** An instant as JavaScript counts it: milliseconds since 1970, in UTC. */
export type Moment = number & Brand.Brand<"Moment">
export const Moment = Brand.nominal<Moment>()

/** Whether the page tracks the clock, or holds the moment a shared link names. */
export type ChosenMoment = Data.TaggedEnum<{
  FollowingNow: { readonly moment: Moment }
  PinnedByLink: { readonly moment: Moment }
}>
export const ChosenMoment = Data.taggedEnum<ChosenMoment>()

/** The exact definition of the astronomical unit, set by the IAU in 2012. */
export const KM_PER_AU = 149_597_870.7
const LIGHT_KM_PER_SECOND = 299_792.458
export const LIGHT_MINUTES_PER_KM = 1 / (LIGHT_KM_PER_SECOND * 60)

export const PLANETS = [
  { name: "Mercury", target: Naif.Mercury },
  { name: "Venus", target: Naif.Venus },
  { name: "Earth", target: Naif.Earth },
  { name: "Mars", target: Naif.MarsBarycenter },
  { name: "Jupiter", target: Naif.JupiterBarycenter },
  { name: "Saturn", target: Naif.SaturnBarycenter },
  { name: "Uranus", target: Naif.UranusBarycenter },
  { name: "Neptune", target: Naif.NeptuneBarycenter },
] as const satisfies ReadonlyArray<{ readonly name: string; readonly target: NaifId }>

export type PlanetName = (typeof PLANETS)[number]["name"]
export type BodyName = PlanetName | "Sun"

/** What the table shows for one planet at one moment. */
export interface Reading {
  readonly planet: PlanetName
  readonly sunDistanceAu: number
  /** None for Earth, which has no distance from itself. */
  readonly earthDistanceAu: Option.Option<number>
  readonly lightMinutesFromEarth: Option.Option<number>
}

export interface SkyPosition {
  readonly name: BodyName
  readonly eclipticKm: Vector3Km
}

/** A tile with every track the classroom needs already resolved, so reading it cannot fail. */
export interface Sky {
  readonly sun: Track
  readonly earth: Track
  readonly planets: ReadonlyArray<{ readonly name: PlanetName; readonly track: Track }>
}
