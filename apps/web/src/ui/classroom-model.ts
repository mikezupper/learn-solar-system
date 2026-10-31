import { command, type Command } from "@gyral/core"
import { Data, Option, Result } from "effect"
import { advanceMoment, chooseMoment, readingsAt, startTravelling } from "@solar/classroom/service"
import {
  ChosenMoment,
  Moment,
  type Reading,
  type Sky,
  type SpeedName,
} from "@solar/classroom/types"
import { tdbFromUtcMillis } from "@solar/ephemeris/service"
import type { TdbSeconds } from "@solar/ephemeris/types"
import { clockReader, frameRecorder, pageFacts, skyLoader } from "../runtime/tokens.js"
import { SkyLoad, type Framing, type PageFacts, type SkyProblem, type StageReport } from "../types/index.js"

/** What is known about the next year's tile, while time runs toward it. */
export type Upcoming = Data.TaggedEnum<{
  NotAsked: {}
  Asked: {}
  Arrived: { readonly sky: Sky; readonly endSeconds: TdbSeconds; readonly year: number }
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
    readonly endSeconds: TdbSeconds
    readonly year: number
    readonly at: TdbSeconds
    readonly readings: ReadonlyArray<Reading>
    readonly upcoming: Upcoming
  }
  OutsideCatalog: { readonly firstYear: number; readonly lastYear: number }
  Failed: { readonly problem: SkyProblem }
}>
export const Phase = Data.taggedEnum<Phase>()
type Ready = Extract<Phase, { readonly _tag: "Ready" }>

/** Why time stopped by itself, if it did. */
export type Notice =
  | { readonly _tag: "NoNotice" }
  | { readonly _tag: "EndOfData"; readonly lastYear: number }
  | { readonly _tag: "NextYearUnavailable" }

export interface State {
  readonly phase: Phase
  readonly locale: string
  readonly timeZone: string
  readonly stageAvailable: boolean
  readonly framing: Framing
  readonly notice: Notice
}

export type Msg =
  | { readonly _tag: "PageRead"; readonly facts: PageFacts }
  | { readonly _tag: "SkyAnswered"; readonly load: SkyLoad }
  | { readonly _tag: "UpcomingAnswered"; readonly load: SkyLoad }
  | { readonly _tag: "Tick"; readonly now: number }
  | { readonly _tag: "SpeedChosen"; readonly speed: SpeedName }
  | { readonly _tag: "Pause" }
  | { readonly _tag: "BackToNow" }
  | { readonly _tag: "ClockRead"; readonly now: number }
  | { readonly _tag: "FramingChosen"; readonly framing: Framing }
  | { readonly _tag: "StageReported"; readonly report: StageReport }

type Next = State | [State, ReadonlyArray<Command<Msg>>]

export const initialState: State = {
  phase: Phase.Starting(),
  locale: "en",
  timeZone: "UTC",
  stageAvailable: true,
  framing: "all",
  notice: { _tag: "NoNotice" },
}

export const askThePage: Command<Msg> = command(pageFacts, undefined, {
  onSuccess: (facts): Msg => ({ _tag: "PageRead", facts }),
})

const askForTheSky = (moment: number): Command<Msg> =>
  command(
    skyLoader,
    { moment },
    {
      key: "sky",
      concurrency: "switch",
      onSuccess: (load): Msg => ({ _tag: "SkyAnswered", load }),
      onFailure: (): Msg => ({
        _tag: "SkyAnswered",
        load: SkyLoad.Failed({ problem: "CatalogUnavailable" }),
      }),
    },
  )

/** One minute into next year: safely inside its tile, whichever side of a boundary TDB falls on. */
const askForTheYearAfter = (year: number): Command<Msg> =>
  command(
    skyLoader,
    { moment: Date.UTC(year + 1, 0, 1, 0, 1) },
    {
      key: "next-sky",
      concurrency: "switch",
      onSuccess: (load): Msg => ({ _tag: "UpcomingAnswered", load }),
      onFailure: (): Msg => ({
        _tag: "UpcomingAnswered",
        load: SkyLoad.Failed({ problem: "CatalogUnavailable" }),
      }),
    },
  )

const showing = (
  chosen: ChosenMoment,
  place: Pick<Ready, "sky" | "endSeconds" | "year" | "upcoming">,
): Ready => {
  const at = tdbFromUtcMillis(chosen.moment)
  return Phase.Ready({ ...place, chosen, at, readings: readingsAt(place.sky, at) })
}

/** While time runs, the next year's tile is fetched ahead of need, so that crossing does not stall. */
const fetchingAhead = (state: State, phase: Ready): Next =>
  phase.chosen._tag === "Travelling" && phase.upcoming._tag === "NotAsked"
    ? [{ ...state, phase: { ...phase, upcoming: Upcoming.Asked() } }, [askForTheYearAfter(phase.year)]]
    : { ...state, phase }

const stopped = (state: State, phase: Ready, notice: Notice): State => ({
  ...state,
  notice,
  phase: { ...phase, chosen: ChosenMoment.Paused({ moment: phase.chosen.moment }) },
})

/** Stays on the same date while the next tile is on its way, so that nothing jumps when it lands. */
const holding = (phase: Ready, moved: ChosenMoment): Ready => ({
  ...phase,
  chosen: { ...moved, moment: phase.chosen.moment },
})

export const whenPageRead = (state: State, facts: PageFacts): Next => {
  const located = { ...state, locale: facts.locale, timeZone: facts.timeZone }
  return Result.match(chooseMoment(Option.fromNullishOr(facts.linkedMoment), Moment(facts.nowMillis)), {
    onFailure: (invalid): Next => ({ ...located, phase: Phase.BadLink({ text: invalid.text }) }),
    onSuccess: (chosen): Next => [
      { ...located, phase: Phase.Waiting({ chosen }) },
      [askForTheSky(chosen.moment)],
    ],
  })
}

export const whenSkyAnswered = (state: State, load: SkyLoad): Next => {
  if (state.phase._tag !== "Waiting") return state
  const { chosen } = state.phase
  return SkyLoad.$match(load, {
    Loaded: ({ sky, endSeconds, year }): Next =>
      fetchingAhead(state, showing(chosen, { sky, endSeconds, year, upcoming: Upcoming.NotAsked() })),
    OutsideCatalog: ({ firstYear, lastYear }): Next => ({
      ...state,
      phase: Phase.OutsideCatalog({ firstYear, lastYear }),
    }),
    Failed: ({ problem }): Next => ({ ...state, phase: Phase.Failed({ problem }) }),
  })
}

export const whenUpcomingAnswered = (state: State, load: SkyLoad): Next => {
  if (state.phase._tag !== "Ready") return state
  const upcoming = SkyLoad.$match(load, {
    Loaded: ({ sky, endSeconds, year }) => Upcoming.Arrived({ sky, endSeconds, year }),
    OutsideCatalog: ({ lastYear }) => Upcoming.NoMore({ lastYear }),
    Failed: () => Upcoming.Unavailable(),
  })
  return { ...state, phase: { ...state.phase, upcoming } }
}

export const whenTicked = (state: State, now: number): Next => {
  const { phase } = state
  if (phase._tag !== "Ready") return state
  const moved = advanceMoment(phase.chosen, now)
  if (moved === phase.chosen) return state
  if (tdbFromUtcMillis(moved.moment) < phase.endSeconds) return fetchingAhead(state, showing(moved, phase))
  return Upcoming.$match(phase.upcoming, {
    Arrived: ({ sky, endSeconds, year }): Next =>
      fetchingAhead(state, showing(moved, { sky, endSeconds, year, upcoming: Upcoming.NotAsked() })),
    NoMore: ({ lastYear }): Next => stopped(state, phase, { _tag: "EndOfData", lastYear }),
    Unavailable: (): Next => stopped(state, phase, { _tag: "NextYearUnavailable" }),
    Asked: (): Next => ({ ...state, phase: holding(phase, moved) }),
    NotAsked: (): Next => [
      { ...state, phase: { ...holding(phase, moved), upcoming: Upcoming.Asked() } },
      [askForTheYearAfter(phase.year)],
    ],
  })
}

export const whenSpeedChosen = (state: State, speed: SpeedName): Next => {
  const { phase } = state
  if (phase._tag !== "Ready") return state
  const chosen =
    phase.chosen._tag === "Travelling"
      ? { ...phase.chosen, speed }
      : startTravelling(phase.chosen.moment, speed)
  // A failed fetch may have been brief, so choosing to run again tries once more.
  const upcoming = phase.upcoming._tag === "Unavailable" ? Upcoming.NotAsked() : phase.upcoming
  return fetchingAhead({ ...state, notice: { _tag: "NoNotice" } }, { ...phase, chosen, upcoming })
}

export const whenPaused = (state: State): State =>
  state.phase._tag === "Ready" ? stopped(state, state.phase, { _tag: "NoNotice" }) : state

export const askTheClock: Command<Msg> = command(clockReader, undefined, {
  onSuccess: (now): Msg => ({ _tag: "ClockRead", now }),
})

export const whenClockRead = (state: State, now: number): Next => {
  const { phase } = state
  if (phase._tag !== "Ready") return state
  const chosen = ChosenMoment.FollowingNow({ moment: Moment(now) })
  const cleared = { ...state, notice: { _tag: "NoNotice" } as const }
  return new Date(now).getUTCFullYear() === phase.year
    ? { ...cleared, phase: showing(chosen, phase) }
    : [{ ...cleared, phase: Phase.Waiting({ chosen }) }, [askForTheSky(now)]]
}

export const whenStageReported = (state: State, report: StageReport): Next =>
  report._tag === "StageUnavailable"
    ? { ...state, stageAvailable: false }
    : [state, [command(frameRecorder, report)]]
