import { command, define, html, nothing } from "@gyral/core"
import { every } from "@gyral/time"
import { Option, Schema } from "effect"
import { SPEEDS, type ChosenMoment } from "@solar/classroom/types"
import { tryRequests } from "../runtime/try-requests.js"
import { Framing, StageReport, type SkyProblem, type StageView } from "../types/index.js"
import {
  askTheClock,
  askThePage,
  whenClockRead,
  whenPageRead,
  whenPlanetPicked,
  whenPlayPressed,
  whenScrubbed,
  whenScrubReleased,
  whenScrubValue,
  whenSkyAnswered,
  whenSpeedChosen,
  whenStageReported,
  whenTicked,
  whenTryRequested,
  whenUpcomingAnswered,
} from "./classroom-model.js"
import { initialState, Phase, type Msg, type Ready, type State } from "./classroom-state.js"
import { captionFor, dock, numbers } from "./classroom-view.js"
import { COPY } from "./copy.js"

export type { Msg, State } from "./classroom-state.js"

const decodeReport = Schema.decodeUnknownOption(StageReport)
const decodeSpeed = Schema.decodeUnknownOption(Schema.Literals(["day", "week", "month", "year"]))
const decodeFraming = Schema.decodeUnknownOption(Framing)
const decodePlanet = Schema.decodeUnknownOption(
  Schema.Literals(["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"]),
)

/** How fast the stage should run between the page's ticks, in simulated seconds per real second. */
const stageRate = (chosen: ChosenMoment): number =>
  chosen._tag === "Travelling" ? SPEEDS[chosen.speed] : chosen._tag === "CatchingUp" ? chosen.rate : 0

const stageViewOf = (s: State, phase: Ready): StageView => ({
  sky: phase.sky,
  at: phase.at,
  moment: phase.chosen.moment,
  startSeconds: phase.startSeconds,
  endSeconds: phase.endSeconds,
  rate: stageRate(phase.chosen),
  framing: s.framing,
  rider: s.rider,
  showSizes: s.showSizes,
  highlight: s.highlight,
  lightFrom: s.lightFrom,
  arriving: phase.chosen._tag === "CatchingUp" && !s.reducedMotion,
})

const PROBLEM_TEXT: Readonly<Record<SkyProblem, string>> = {
  CatalogUnavailable: COPY.catalogUnavailable,
  TileDamaged: COPY.tileDamaged,
  TileUncheckable: COPY.tileUncheckable,
}

export const SolarClassroom = define<State, Msg>()("solar-classroom", {
  // The page's main content: light DOM, so crawlers and the document's stylesheet reach it.
  shadow: false,
  init: () => [initialState, [askThePage]],
  subscriptions: (s) => {
    const fromExplanation = command(tryRequests, undefined, {
      onSuccess: (request): Msg => ({ _tag: "TryRequested", request }),
    })
    if (s.phase._tag !== "Ready") return [fromExplanation]
    const { chosen } = s.phase
    if (chosen._tag === "FollowingNow") return [fromExplanation, every(1000, (now): Msg => ({ _tag: "Tick", now }))]
    if (chosen._tag === "Travelling" || chosen._tag === "CatchingUp") {
      return [fromExplanation, every(250, (now): Msg => ({ _tag: "Tick", now }))]
    }
    return [fromExplanation]
  },
  intent: {
    SpeedChosen: ({ value }) =>
      Option.getOrUndefined(Option.map(decodeSpeed(value), (speed) => ({ _tag: "SpeedChosen" as const, speed }))),
    PlayPressed: () => ({ _tag: "PlayPressed" }),
    BackToNow: () => ({ _tag: "BackToNow" }),
    ScrubValue: ({ value }) => {
      const day = Number(value)
      return Number.isInteger(day) ? { _tag: "ScrubValue", day } : undefined
    },
    ScrubReleased: () => ({ _tag: "ScrubReleased" }),
    FramingChosen: ({ value }) =>
      Option.getOrUndefined(
        Option.map(decodeFraming(value), (framing) => ({ _tag: "FramingChosen" as const, framing })),
      ),
    RiderChosen: ({ value }) =>
      Option.getOrUndefined(Option.map(decodePlanet(value), (planet) => ({ _tag: "RiderChosen" as const, planet }))),
    SizesToggled: ({ checked }) => ({ _tag: "SizesToggled", on: checked === true }),
    PlanetPicked: ({ value }) =>
      Option.getOrUndefined(Option.map(decodePlanet(value), (planet) => ({ _tag: "PlanetPicked" as const, planet }))),
    StageReported: ({ event }) =>
      event instanceof CustomEvent
        ? Option.getOrUndefined(
            Option.map(decodeReport(event.detail), (report) => ({ _tag: "StageReported" as const, report })),
          )
        : undefined,
  },
  update: {
    PageRead: (s, { facts }) => whenPageRead(s, facts),
    SkyAnswered: (s, { load }) => whenSkyAnswered(s, load),
    UpcomingAnswered: (s, { load }) => whenUpcomingAnswered(s, load),
    Tick: (s, { now }) => whenTicked(s, now),
    SpeedChosen: (s, { speed }) => whenSpeedChosen(s, speed),
    PlayPressed: (s) => whenPlayPressed(s),
    BackToNow: (s) => [s, [askTheClock]],
    ClockRead: (s, { now }) => whenClockRead(s, now),
    Scrubbed: (s, { moment }) => whenScrubbed(s, moment),
    ScrubValue: (s, { day }) => whenScrubValue(s, day),
    ScrubReleased: (s) => whenScrubReleased(s),
    FramingChosen: (s, { framing }) => ({ ...s, framing, highlight: Option.none() }),
    RiderChosen: (s, { planet }) => ({ ...s, rider: planet, framing: "ride" }),
    SizesToggled: (s, { on }) => ({ ...s, showSizes: on }),
    PlanetPicked: (s, { planet }) => whenPlanetPicked(s, planet),
    TryRequested: (s, { request }) => whenTryRequested(s, request),
    StageReported: (s, { report }) => whenStageReported(s, report),
  },
  view: (s, i) => {
    const problem = (message: string, recover: boolean) =>
      html`<section data-problem>
        <p role="alert">${message}</p>
        ${recover ? html`<p><a href="/">${COPY.backToNow}</a></p>` : nothing}
      </section>`
    const sky = (view: StageView | undefined, busy: boolean, caption: string, odometer: string | undefined) =>
      s.stageAvailable
        ? html`<figure ?data-stale=${busy}>
            <sky-stage
              .view=${view}
              data-intent-on="gyral-output"
              data-intent=${i.StageReported}
            ></sky-stage>
            <figcaption>
              ${odometer === undefined ? nothing : html`<strong>${odometer}</strong>`}
              <small>${caption}</small>
            </figcaption>
          </figure>`
        : html`<p role="status" data-no-stage>${COPY.stageUnavailable}</p>`
    return Phase.$match(s.phase, {
      Starting: () => html`${sky(undefined, false, COPY.figureCaption, undefined)}<p role="status" data-loading>${COPY.loading}</p>`,
      Waiting: () => html`${sky(undefined, false, COPY.figureCaption, undefined)}<p role="status" data-loading>${COPY.loading}</p>`,
      BadLink: ({ text }) => problem(COPY.badLink(text), true),
      OutsideCatalog: ({ firstYear, lastYear }) => problem(COPY.outsideCatalog(firstYear, lastYear), true),
      Failed: ({ problem: kind }) => problem(PROBLEM_TEXT[kind], false),
      Ready: (phase) => html`
        ${sky(
          stageViewOf(s, phase),
          Option.isSome(phase.seeking),
          captionFor(s),
          COPY.odometer(new Intl.NumberFormat(s.locale, { maximumFractionDigits: 0 }).format(s.flownKm)),
        )}
        ${dock(s, phase)} ${numbers(s, phase)}
      `,
    })
  },
})
