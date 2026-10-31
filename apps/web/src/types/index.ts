import { Data, Schema } from "effect"
import type { Sky } from "@solar/classroom/types"
import type { TdbSeconds } from "@solar/ephemeris/types"

/** Facts only the browser knows. The reducers receive them as data so that they stay pure. */
export interface PageFacts {
  readonly linkedMoment: string | undefined
  readonly nowMillis: number
  readonly locale: string
  readonly timeZone: string
}

export type SkyProblem = "CatalogUnavailable" | "TileDamaged"

/** Every way asking for the sky can end. A failure is an answer here, so the loop keeps running. */
export type SkyLoad = Data.TaggedEnum<{
  Loaded: { readonly sky: Sky; readonly endSeconds: TdbSeconds }
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
])
export type StageReport = typeof StageReport.Type

/** The one input the stage takes. */
export interface StageView {
  readonly sky: Sky
  readonly at: TdbSeconds
}
