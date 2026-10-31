import { define, html, nothing, type TemplateResult } from "@gyral/core"
import { every } from "@gyral/time"
import { Option, Schema } from "effect"
import { SPEEDS, type ChosenMoment, type Reading, type SpeedName } from "@solar/classroom/types"
import { Framing, StageReport, type SkyProblem } from "../types/index.js"
import {
  askTheClock,
  askThePage,
  initialState,
  Phase,
  whenClockRead,
  whenPageRead,
  whenPaused,
  whenSkyAnswered,
  whenSpeedChosen,
  whenStageReported,
  whenTicked,
  whenUpcomingAnswered,
  type Msg,
  type Notice,
  type State,
} from "./classroom-model.js"
import { COPY } from "./copy.js"

export type { Msg, State } from "./classroom-model.js"

const decodeReport = Schema.decodeUnknownOption(StageReport)
const decodeSpeed = Schema.decodeUnknownOption(
  Schema.Literals(["day", "week", "month", "year"]),
)
const decodeFraming = Schema.decodeUnknownOption(Framing)

const SPEED_CHOICES: ReadonlyArray<readonly [SpeedName, string]> = [
  ["day", COPY.speedDay],
  ["week", COPY.speedWeek],
  ["month", COPY.speedMonth],
  ["year", COPY.speedYear],
]

/** How fast the stage should run between the page's ticks, in simulated seconds per real second. */
const stageRate = (chosen: ChosenMoment): number =>
  chosen._tag === "Travelling" ? SPEEDS[chosen.speed] : 0

const formatMoment = (state: State, moment: number): string =>
  new Intl.DateTimeFormat(state.locale, {
    dateStyle: "long",
    // "long" names the time zone, which a shared link needs: the class may not be in the sender's.
    timeStyle: "long",
    timeZone: state.timeZone,
  }).format(moment)

const numbers = (
  locale: string,
  fractionDigits: number,
): ((value: Option.Option<number>) => TemplateResult | string) => {
  const format = new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
  return Option.match({
    onNone: () => html`<abbr title=${COPY.notApplicable}>${COPY.notApplicableShort}</abbr>`,
    onSome: (value) => format.format(value),
  })
}

const readingsTable = (locale: string, readings: ReadonlyArray<Reading>): TemplateResult => {
  const distance = numbers(locale, 3)
  const minutes = numbers(locale, 1)
  return html`<table>
    <caption>
      ${COPY.tableCaption}
    </caption>
    <thead>
      <tr>
        <th scope="col">${COPY.columnPlanet}</th>
        <th scope="col">
          ${COPY.columnFromSun} (<abbr title=${COPY.auTitle}>${COPY.auShort}</abbr>)
        </th>
        <th scope="col">
          ${COPY.columnFromEarth} (<abbr title=${COPY.auTitle}>${COPY.auShort}</abbr>)
        </th>
        <th scope="col">
          ${COPY.columnLight} (<abbr title=${COPY.minutesTitle}>${COPY.minutesShort}</abbr>)
        </th>
      </tr>
    </thead>
    <tbody>
      ${readings.map(
        (reading) =>
          html`<tr>
            <th scope="row">${reading.planet}</th>
            <td>${distance(Option.some(reading.sunDistanceAu))}</td>
            <td>${distance(reading.earthDistanceAu)}</td>
            <td>${minutes(reading.lightMinutesFromEarth)}</td>
          </tr>`,
      )}
    </tbody>
  </table>`
}

const lead: Readonly<Record<ChosenMoment["_tag"], string>> = {
  FollowingNow: COPY.following,
  PinnedByLink: COPY.pinned,
  Paused: COPY.paused,
  Travelling: COPY.travelling,
}

const PROBLEM_TEXT: Readonly<Record<SkyProblem, string>> = {
  CatalogUnavailable: COPY.catalogUnavailable,
  TileDamaged: COPY.tileDamaged,
  TileUncheckable: COPY.tileUncheckable,
}

const noticeText = (notice: Notice): string | undefined =>
  notice._tag === "EndOfData"
    ? COPY.endOfData(notice.lastYear)
    : notice._tag === "NextYearUnavailable"
      ? COPY.nextYearUnavailable
      : undefined

export const SolarClassroom = define<State, Msg>()("solar-classroom", {
  // The page's main content: light DOM, so crawlers and the document's stylesheet reach it.
  shadow: false,
  init: () => [initialState, [askThePage]],
  subscriptions: (s) => {
    if (s.phase._tag !== "Ready") return []
    if (s.phase.chosen._tag === "FollowingNow") return [every(1000, (now): Msg => ({ _tag: "Tick", now }))]
    if (s.phase.chosen._tag === "Travelling") return [every(250, (now): Msg => ({ _tag: "Tick", now }))]
    return []
  },
  intent: {
    SpeedChosen: ({ value }) =>
      Option.getOrUndefined(
        Option.map(decodeSpeed(value), (speed) => ({ _tag: "SpeedChosen" as const, speed })),
      ),
    Pause: () => ({ _tag: "Pause" }),
    BackToNow: () => ({ _tag: "BackToNow" }),
    FramingChosen: ({ value }) =>
      Option.getOrUndefined(
        Option.map(decodeFraming(value), (framing) => ({ _tag: "FramingChosen" as const, framing })),
      ),
    StageReported: ({ event }) =>
      event instanceof CustomEvent
        ? Option.getOrUndefined(
            Option.map(decodeReport(event.detail), (report) => ({
              _tag: "StageReported" as const,
              report,
            })),
          )
        : undefined,
  },
  update: {
    PageRead: (s, { facts }) => whenPageRead(s, facts),
    SkyAnswered: (s, { load }) => whenSkyAnswered(s, load),
    UpcomingAnswered: (s, { load }) => whenUpcomingAnswered(s, load),
    Tick: (s, { now }) => whenTicked(s, now),
    SpeedChosen: (s, { speed }) => whenSpeedChosen(s, speed),
    Pause: (s) => whenPaused(s),
    BackToNow: (s) => [s, [askTheClock]],
    ClockRead: (s, { now }) => whenClockRead(s, now),
    FramingChosen: (s, { framing }) => ({ ...s, framing }),
    StageReported: (s, { report }) => whenStageReported(s, report),
  },
  view: (s, i) => {
    const problem = (message: string, recover: boolean) =>
      html`<p role="alert">${message}</p>
        ${recover ? html`<p><a href="/">${COPY.backToNow}</a></p>` : nothing}`
    return Phase.$match(s.phase, {
      Starting: () => html`<p role="status">${COPY.loading}</p>`,
      Waiting: () => html`<p role="status">${COPY.loading}</p>`,
      BadLink: ({ text }) => problem(COPY.badLink(text), true),
      OutsideCatalog: ({ firstYear, lastYear }) =>
        problem(COPY.outsideCatalog(firstYear, lastYear), true),
      Failed: ({ problem: kind }) => problem(PROBLEM_TEXT[kind], false),
      Ready: ({ chosen, sky, at, endSeconds, readings }) => {
        const isoMoment = new Date(chosen.moment).toISOString()
        const notice = noticeText(s.notice)
        return html`
          <section aria-labelledby="sky-heading">
            <h2 id="sky-heading">${COPY.skyHeading}</h2>
            <p>
              ${lead[chosen._tag]}
              <time datetime=${isoMoment}>${formatMoment(s, chosen.moment)}</time>
            </p>
            ${chosen._tag === "PinnedByLink"
              ? html`<p>${COPY.pinnedNote} <a href="/">${COPY.backToNow}</a></p>`
              : nothing}
            ${chosen._tag === "Paused"
              ? html`<p><a href=${`/?at=${isoMoment}`}>${COPY.linkToMoment}</a></p>`
              : nothing}
            ${notice === undefined ? nothing : html`<p role="status">${notice}</p>`}
            ${s.stageAvailable
              ? html`<figure>
                  <sky-stage
                    .view=${{ sky, at, endSeconds, rate: stageRate(chosen), framing: s.framing }}
                    data-intent-on="gyral-output"
                    data-intent=${i.StageReported}
                  ></sky-stage>
                  <figcaption>${COPY.figureCaption}</figcaption>
                </figure>`
              : html`<p role="status">${COPY.stageUnavailable}</p>`}
            <section aria-label=${COPY.controlsLabel}>
              <fieldset>
                <legend>${COPY.speedLegend}</legend>
                <label>
                  <input
                    type="radio"
                    name="speed"
                    value="now"
                    ?checked=${chosen._tag === "FollowingNow"}
                    data-intent=${i.BackToNow}
                  />
                  ${COPY.speedNow}
                </label>
                <label>
                  <input
                    type="radio"
                    name="speed"
                    value="stop"
                    ?checked=${chosen._tag === "Paused" || chosen._tag === "PinnedByLink"}
                    data-intent=${i.Pause}
                  />
                  ${COPY.speedStopped}
                </label>
                ${SPEED_CHOICES.map(
                  ([speed, label]) =>
                    html`<label>
                      <input
                        type="radio"
                        name="speed"
                        value=${speed}
                        ?checked=${chosen._tag === "Travelling" && chosen.speed === speed}
                        data-intent=${i.SpeedChosen}
                      />
                      ${label}
                    </label>`,
                )}
              </fieldset>
              <p>${chosen._tag === "Travelling" ? COPY.travellingNote : COPY.realSpeedNote}</p>
              <fieldset>
                <legend>${COPY.viewLegend}</legend>
                <label>
                  <input
                    type="radio"
                    name="framing"
                    value="all"
                    ?checked=${s.framing === "all"}
                    data-intent=${i.FramingChosen}
                  />
                  ${COPY.viewAll}
                </label>
                <label>
                  <input
                    type="radio"
                    name="framing"
                    value="inner"
                    ?checked=${s.framing === "inner"}
                    data-intent=${i.FramingChosen}
                  />
                  ${COPY.viewInner}
                </label>
              </fieldset>
            </section>
          </section>
          <section aria-labelledby="numbers-heading">
            <h2 id="numbers-heading">${COPY.numbersHeading}</h2>
            ${readingsTable(s.locale, readings)}
            <h3>${COPY.definitionsHeading}</h3>
            <dl>
              <dt><dfn>${COPY.auTerm}</dfn></dt>
              <dd>${COPY.auDefinition}</dd>
              <dt><dfn>${COPY.lightTerm}</dfn></dt>
              <dd>${COPY.lightDefinition}</dd>
            </dl>
          </section>
        `
      },
    })
  },
})
