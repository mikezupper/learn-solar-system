import { Data, Option } from "effect"
import type { ChosenMoment, Moment, PlanetName, Reading, Sky, SpeedName } from "@solar/classroom/types"
import type { TdbSeconds } from "@solar/ephemeris/types"
import type {
  Framing,
  PageFacts,
  SkyLoad,
  SkyProblem,
  StageReport,
  TryRequest,
} from "../types/index.js"

/** What is known about the next year's tile, while time runs toward it. */
export type Upcoming = Data.TaggedEnum<{
  NotAsked: {}
  Asked: {}
  Arrived: {
    readonly sky: Sky
    readonly startSeconds: TdbSeconds
    readonly endSeconds: TdbSeconds
    readonly year: number
  }
  NoMore: { readonly lastYear: number }
  Unavailable: {}
}>
export const Upcoming = Data.taggedEnum<Upcoming>()

/** Where the page is in its life. Each variant holds only what can be true at that point. */
export type Phase = Data.TaggedEnum<{
  Starting: {}
  BadLink: { readonly text: string }
  Waiting: { readonly chosen: ChosenMoment }
  Ready: {
    readonly chosen: ChosenMoment
    readonly sky: Sky
    readonly startSeconds: TdbSeconds
    readonly endSeconds: TdbSeconds
    readonly year: number
    readonly firstYear: number
    readonly lastYear: number
    readonly at: TdbSeconds
    readonly readings: ReadonlyArray<Reading>
    readonly upcoming: Upcoming
    /** A date on the timeline whose year is still on its way. The picture keeps its own date until it lands. */
    readonly seeking: Option.Option<Moment>
  }
  OutsideCatalog: { readonly firstYear: number; readonly lastYear: number }
  Failed: { readonly problem: SkyProblem }
}>
export const Phase = Data.taggedEnum<Phase>()
export type Ready = Extract<Phase, { readonly _tag: "Ready" }>
export type Place = Pick<Ready, "sky" | "startSeconds" | "endSeconds" | "year" | "firstYear" | "lastYear" | "upcoming">

/** Why time stopped by itself, if it did. */
export type Notice =
  | { readonly _tag: "NoNotice" }
  | { readonly _tag: "EndOfData"; readonly lastYear: number }
  | { readonly _tag: "NextYearUnavailable" }

/** A drag along the timeline holds time still, and lets it carry on afterward if it was running. */
export type Scrub =
  | { readonly _tag: "NotDragging" }
  | { readonly _tag: "Dragging"; readonly resume: Option.Option<SpeedName> }
  | { readonly _tag: "Landing"; readonly resume: Option.Option<SpeedName> }

export interface State {
  readonly phase: Phase
  readonly locale: string
  readonly timeZone: string
  readonly reducedMotion: boolean
  readonly stageAvailable: boolean
  readonly framing: Framing
  readonly rider: PlanetName
  readonly showSizes: boolean
  readonly highlight: Option.Option<PlanetName>
  readonly lightFrom: Option.Option<PlanetName>
  readonly heroPlanet: PlanetName
  /** The speed a learner picked, which Play uses from then on. */
  readonly chosenSpeed: Option.Option<SpeedName>
  readonly scrub: Scrub
  readonly flownKm: number
  readonly openedAt: number
  readonly notice: Notice
}

export type Msg =
  | { readonly _tag: "PageRead"; readonly facts: PageFacts }
  | { readonly _tag: "SkyAnswered"; readonly load: SkyLoad }
  | { readonly _tag: "UpcomingAnswered"; readonly load: SkyLoad }
  | { readonly _tag: "Tick"; readonly now: number }
  | { readonly _tag: "SpeedChosen"; readonly speed: SpeedName }
  | { readonly _tag: "PlayPressed" }
  | { readonly _tag: "BackToNow" }
  | { readonly _tag: "ClockRead"; readonly now: number }
  | { readonly _tag: "Scrubbed"; readonly moment: number }
  | { readonly _tag: "ScrubValue"; readonly day: number }
  | { readonly _tag: "ScrubReleased" }
  | { readonly _tag: "FramingChosen"; readonly framing: Framing }
  | { readonly _tag: "RiderChosen"; readonly planet: PlanetName }
  | { readonly _tag: "SizesToggled"; readonly on: boolean }
  | { readonly _tag: "PlanetPicked"; readonly planet: PlanetName }
  | { readonly _tag: "TryRequested"; readonly request: TryRequest }
  | { readonly _tag: "StageReported"; readonly report: StageReport }

export const initialState: State = {
  phase: Phase.Starting(),
  locale: "en",
  timeZone: "UTC",
  reducedMotion: false,
  stageAvailable: true,
  framing: "all",
  rider: "Earth",
  showSizes: false,
  highlight: Option.none(),
  lightFrom: Option.none(),
  heroPlanet: "Neptune",
  chosenSpeed: Option.none(),
  scrub: { _tag: "NotDragging" },
  flownKm: 0,
  openedAt: 0,
  notice: { _tag: "NoNotice" },
}
