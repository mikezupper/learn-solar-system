import { Data, type Option, Schema } from "effect"
import type { PlanetName, Sky, SpeedName } from "@solar/classroom/types"
import type { TdbSeconds } from "@solar/ephemeris/types"

/** Facts only the browser knows. The reducers receive them as data so that they stay pure. */
export interface PageFacts {
  readonly linkedMoment: string | undefined
  readonly nowMillis: number
  readonly locale: string
  readonly timeZone: string
  readonly reducedMotion: boolean
}

export type SkyProblem = "CatalogUnavailable" | "TileDamaged" | "TileUncheckable"

/** Every way asking for the sky can end. A failure is an answer here, so the loop keeps running. */
export type SkyLoad = Data.TaggedEnum<{
  Loaded: {
    readonly sky: Sky
    readonly startSeconds: TdbSeconds
    readonly endSeconds: TdbSeconds
    readonly year: number
    /** The span of the whole catalog, which is as far as the timeline can go. */
    readonly firstYear: number
    readonly lastYear: number
  }
  OutsideCatalog: { readonly firstYear: number; readonly lastYear: number }
  Failed: { readonly problem: SkyProblem }
}>
export const SkyLoad = Data.taggedEnum<SkyLoad>()

export const FramesMeasured = Schema.Struct({
  _tag: Schema.Literal("FramesMeasured"),
  count: Schema.Int,
  meanMs: Schema.Number,
  worstMs: Schema.Number,
})
export type FramesMeasured = typeof FramesMeasured.Type

/** What the 3D stage tells the page. It crosses a DOM event, so the page decodes it. */
export const StageReport = Schema.Union([
  FramesMeasured,
  Schema.Struct({ _tag: Schema.Literal("StageUnavailable") }),
  Schema.Struct({ _tag: Schema.Literal("RingChosen") }),
])
export type StageReport = typeof StageReport.Type

/** What the stage frames. Each choice moves only the camera, so distances stay to scale. */
export const Framing = Schema.Literals(["all", "inner", "ride"])
export type Framing = typeof Framing.Type

/** The one input the stage takes. `rate` is simulated seconds per real second, zero when stopped. */
export interface StageView {
  readonly sky: Sky
  readonly at: TdbSeconds
  readonly moment: number
  readonly startSeconds: TdbSeconds
  readonly endSeconds: TdbSeconds
  readonly rate: number
  readonly framing: Framing
  readonly rider: PlanetName
  readonly showSizes: boolean
  readonly highlight: Option.Option<PlanetName>
  readonly lightFrom: Option.Option<PlanetName>
  /** True during the cold open, when the camera pulls back from the inner planets. */
  readonly arriving: boolean
}

/** What a button in the explanation asks the page to show. */
export interface TryRequest {
  readonly framing: Framing
  readonly speed: SpeedName | "stop"
  readonly highlight: Option.Option<PlanetName>
}
