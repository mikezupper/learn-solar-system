import { Brand, Data } from "effect"

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
