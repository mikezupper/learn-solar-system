import { command, type Command } from "@gyral/core"
import { Option, Result } from "effect"
import {
  advanceMoment,
  chooseMoment,
  readingsAt,
  startCatchingUp,
  startTravelling,
} from "@solar/classroom/service"
import {
  ChosenMoment,
  EARTH_MEAN_SPEED_KM_PER_S,
  Moment,
  type PlanetName,
  type SpeedName,
} from "@solar/classroom/types"
import { tdbFromUtcMillis } from "@solar/ephemeris/service"
import { clockReader, frameRecorder, pageFacts, skyLoader } from "../runtime/tokens.js"
import { SkyLoad, type PageFacts, type StageReport, type TryRequest } from "../types/index.js"
import { momentFromDay } from "./classroom-format.js"
import {
  Phase,
  Upcoming,
  type Msg,
  type Notice,
  type Place,
  type Ready,
  type Scrub,
  type State,
} from "./classroom-state.js"

type Next = State | [State, ReadonlyArray<Command<Msg>>]

const COLD_OPEN_MILLIS = 3200
const CATCH_UP_MILLIS = 1200
const CLOSE_ENOUGH_TO_SNAP_MILLIS = 86_400_000

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

const showing = (chosen: ChosenMoment, place: Place): Ready => {
  const at = tdbFromUtcMillis(chosen.moment)
  return Phase.Ready({ ...place, chosen, at, readings: readingsAt(place.sky, at), seeking: Option.none() })
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
  const located = {
    ...state,
    locale: facts.locale,
    timeZone: facts.timeZone,
    reducedMotion: facts.reducedMotion,
    openedAt: facts.nowMillis,
  }
  return Result.match(chooseMoment(Option.fromNullishOr(facts.linkedMoment), Moment(facts.nowMillis)), {
    onFailure: (invalid): Next => ({ ...located, phase: Phase.BadLink({ text: invalid.text }) }),
    onSuccess: (linked): Next => {
      const startOfYear = Moment(Date.UTC(new Date(facts.nowMillis).getUTCFullYear(), 0, 1))
      const chosen =
        linked._tag === "FollowingNow" && !facts.reducedMotion
          ? startCatchingUp(startOfYear, facts.nowMillis, COLD_OPEN_MILLIS)
          : linked
      return [{ ...located, phase: Phase.Waiting({ chosen }) }, [askForTheSky(chosen.moment)]]
    },
  })
}

const placeFrom = (loaded: Extract<SkyLoad, { readonly _tag: "Loaded" }>): Place => ({
  sky: loaded.sky,
  startSeconds: loaded.startSeconds,
  endSeconds: loaded.endSeconds,
  year: loaded.year,
  firstYear: loaded.firstYear,
  lastYear: loaded.lastYear,
  upcoming: Upcoming.NotAsked(),
})

const running = (state: State, phase: Ready, speed: SpeedName): Next => {
  const chosen =
    phase.chosen._tag === "Travelling"
      ? { ...phase.chosen, speed }
      : startTravelling(phase.chosen.moment, speed)
  // A failed fetch may have been brief, so choosing to run again tries once more.
  const upcoming = phase.upcoming._tag === "Unavailable" ? Upcoming.NotAsked() : phase.upcoming
  return fetchingAhead({ ...state, notice: { _tag: "NoNotice" } }, { ...phase, chosen, upcoming })
}

/** Finishes a drag: time carries on if it was running before, and stays stopped if it was not. */
const landing = (state: State, phase: Ready, resume: Option.Option<SpeedName>): Next => {
  const settled = { ...state, scrub: { _tag: "NotDragging" } as const }
  return Option.match(resume, {
    onNone: (): Next => ({ ...settled, phase }),
    onSome: (speed): Next => running(settled, phase, speed),
  })
}

/** An answer to a drag along the timeline. Ignored once the learner has dragged back to a loaded year. */
const whenSeekAnswered = (state: State, phase: Ready, load: SkyLoad): Next => {
  if (Option.isNone(phase.seeking)) return state
  const moment = phase.seeking.value
  return SkyLoad.$match(load, {
    Loaded: (loaded): Next => {
      const arrived = showing(ChosenMoment.Paused({ moment }), placeFrom(loaded))
      return state.scrub._tag === "Landing"
        ? landing(state, arrived, state.scrub.resume)
        : { ...state, phase: arrived }
    },
    OutsideCatalog: (): Next => ({ ...state, phase: { ...phase, seeking: Option.none() } }),
    Failed: (): Next => ({
      ...state,
      scrub: { _tag: "NotDragging" },
      notice: { _tag: "NextYearUnavailable" },
      phase: { ...phase, seeking: Option.none() },
    }),
  })
}

export const whenSkyAnswered = (state: State, load: SkyLoad): Next => {
  if (state.phase._tag === "Ready") return whenSeekAnswered(state, state.phase, load)
  if (state.phase._tag !== "Waiting") return state
  const { chosen } = state.phase
  return SkyLoad.$match(load, {
    Loaded: (loaded): Next => fetchingAhead(state, showing(chosen, placeFrom(loaded))),
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
    Loaded: ({ sky, startSeconds, endSeconds, year }) => Upcoming.Arrived({ sky, startSeconds, endSeconds, year }),
    OutsideCatalog: ({ lastYear }) => Upcoming.NoMore({ lastYear }),
    Failed: () => Upcoming.Unavailable(),
  })
  return { ...state, phase: { ...state.phase, upcoming } }
}

/** How far Earth flew, in kilometers. Only real motion counts, not a replay or a jump. */
const flownDuring = (before: ChosenMoment, after: ChosenMoment): number =>
  before._tag === "CatchingUp" || after._tag === "CatchingUp"
    ? 0
    : (Math.abs(after.moment - before.moment) / 1000) * EARTH_MEAN_SPEED_KM_PER_S

export const whenTicked = (state: State, now: number): Next => {
  const { phase } = state
  if (phase._tag !== "Ready") return state
  const moved = advanceMoment(phase.chosen, now)
  if (moved === phase.chosen) return state
  const flown = { ...state, flownKm: state.flownKm + flownDuring(phase.chosen, moved) }
  if (tdbFromUtcMillis(moved.moment) < phase.endSeconds) return fetchingAhead(flown, showing(moved, phase))
  return Upcoming.$match(phase.upcoming, {
    Arrived: (next): Next =>
      fetchingAhead(flown, showing(moved, { ...phase, ...next, upcoming: Upcoming.NotAsked() })),
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
  if (state.phase._tag !== "Ready") return state
  return running({ ...state, chosenSpeed: Option.some(speed) }, state.phase, speed)
}

/** What Play will use: the learner's choice, or else a speed that shows motion at this zoom. */
export const armedSpeed = (state: State): SpeedName =>
  Option.getOrElse(state.chosenSpeed, () =>
    state.framing === "all" ? "year" : state.framing === "inner" ? "week" : "month",
  )

export const whenPlayPressed = (state: State): Next => {
  if (state.phase._tag !== "Ready") return state
  return state.phase.chosen._tag === "Travelling" || state.phase.chosen._tag === "CatchingUp"
    ? stopped(state, state.phase, { _tag: "NoNotice" })
    : running(state, state.phase, armedSpeed(state))
}

export const askTheClock: Command<Msg> = command(clockReader, undefined, {
  onSuccess: (now): Msg => ({ _tag: "ClockRead", now }),
})

export const whenClockRead = (state: State, now: number): Next => {
  const { phase } = state
  if (phase._tag !== "Ready") return state
  const cleared = { ...state, notice: { _tag: "NoNotice" } as const, scrub: { _tag: "NotDragging" } as const }
  if (new Date(now).getUTCFullYear() !== phase.year) {
    return [
      { ...cleared, phase: Phase.Waiting({ chosen: ChosenMoment.FollowingNow({ moment: Moment(now) }) }) },
      [askForTheSky(now)],
    ]
  }
  const snap = state.reducedMotion || Math.abs(now - phase.chosen.moment) < CLOSE_ENOUGH_TO_SNAP_MILLIS
  const chosen = snap
    ? ChosenMoment.FollowingNow({ moment: Moment(now) })
    : startCatchingUp(phase.chosen.moment, now, CATCH_UP_MILLIS)
  return { ...cleared, phase: showing(chosen, phase) }
}

export const whenScrubbed = (state: State, millis: number): Next => {
  const { phase } = state
  if (phase._tag !== "Ready") return state
  const moment = Moment(millis)
  const at = tdbFromUtcMillis(moment)
  const scrub: Scrub =
    state.scrub._tag === "Dragging"
      ? state.scrub
      : {
          _tag: "Dragging",
          resume: phase.chosen._tag === "Travelling" ? Option.some(phase.chosen.speed) : Option.none(),
        }
  const dragging = { ...state, scrub, notice: { _tag: "NoNotice" } as const }
  if (at >= phase.startSeconds && at < phase.endSeconds) {
    return { ...dragging, phase: showing(ChosenMoment.Paused({ moment }), phase) }
  }
  return [
    {
      ...dragging,
      phase: {
        ...phase,
        chosen: ChosenMoment.Paused({ moment: phase.chosen.moment }),
        seeking: Option.some(moment),
      },
    },
    [askForTheSky(moment)],
  ]
}

export const whenScrubValue = (state: State, day: number): Next =>
  state.phase._tag === "Ready" ? whenScrubbed(state, momentFromDay(day, state.phase.firstYear)) : state

export const whenScrubReleased = (state: State): Next => {
  const { phase, scrub } = state
  if (phase._tag !== "Ready" || scrub._tag !== "Dragging") return state
  return Option.isSome(phase.seeking)
    ? { ...state, scrub: { _tag: "Landing", resume: scrub.resume } }
    : landing(state, phase, scrub.resume)
}

export const whenPlanetPicked = (state: State, planet: PlanetName): State => ({
  ...state,
  heroPlanet: planet,
  lightFrom: Option.getOrUndefined(state.lightFrom) === planet ? Option.none() : Option.some(planet),
})

export const whenTryRequested = (state: State, request: TryRequest): Next => {
  const arranged: State = { ...state, framing: request.framing, highlight: request.highlight }
  if (state.phase._tag !== "Ready") return arranged
  return request.speed === "stop"
    ? stopped(arranged, state.phase, { _tag: "NoNotice" })
    : running({ ...arranged, chosenSpeed: Option.some(request.speed) }, state.phase, request.speed)
}

export const whenStageReported = (state: State, report: StageReport): Next =>
  report._tag === "StageUnavailable"
    ? { ...state, stageAvailable: false }
    : report._tag === "RingChosen"
      ? { ...state, framing: "inner" }
      : [state, [command(frameRecorder, report)]]
