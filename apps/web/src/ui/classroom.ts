import { command, define, html, nothing, type Command, type TemplateResult } from "@gyral/core"
import { every } from "@gyral/time"
import { Data, Option, Result, Schema } from "effect"
import { chooseMoment, readingsAt, type Reading, type Sky } from "@solar/classroom/service"
import { ChosenMoment, Moment } from "@solar/classroom/types"
import { tdbFromUtcMillis } from "@solar/ephemeris/service"
import type { TdbSeconds } from "@solar/ephemeris/types"
import { frameRecorder, pageFacts, skyLoader } from "../runtime/tokens.js"
import { SkyLoad, StageReport, type PageFacts, type SkyProblem } from "../types/index.js"
import { COPY } from "./copy.js"

/** Where the page is in its life. Each variant holds only what can be true at that point. */
export type Phase = Data.TaggedEnum<{
  Starting: {}
  BadLink: { readonly text: string }
  Waiting: { readonly chosen: ChosenMoment }
  Ready: {
    readonly chosen: ChosenMoment
    readonly sky: Sky
    readonly endSeconds: TdbSeconds
    readonly at: TdbSeconds
    readonly readings: ReadonlyArray<Reading>
  }
  OutsideCatalog: { readonly firstYear: number; readonly lastYear: number }
  Failed: { readonly problem: SkyProblem }
}>
export const Phase = Data.taggedEnum<Phase>()

export interface State {
  readonly phase: Phase
  readonly locale: string
  readonly timeZone: string
  readonly stageAvailable: boolean
}

export type Msg =
  | { readonly _tag: "PageRead"; readonly facts: PageFacts }
  | { readonly _tag: "SkyAnswered"; readonly load: SkyLoad }
  | { readonly _tag: "Tick"; readonly now: number }
  | { readonly _tag: "StageReported"; readonly report: StageReport }

const askThePage: Command<Msg> = command(pageFacts, undefined, {
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

const showing = (chosen: ChosenMoment, sky: Sky, endSeconds: TdbSeconds): Phase => {
  const at = tdbFromUtcMillis(chosen.moment)
  return Phase.Ready({ chosen, sky, endSeconds, at, readings: readingsAt(sky, at) })
}

const decodeReport = Schema.decodeUnknownOption(StageReport)

const formatMoment = (state: State, moment: number): string =>
  new Intl.DateTimeFormat(state.locale, {
    dateStyle: "long",
    timeStyle: "medium",
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

export const SolarClassroom = define<State, Msg>()("solar-classroom", {
  // The page's main content: light DOM, so crawlers and the document's stylesheet reach it.
  shadow: false,
  init: () => [
    { phase: Phase.Starting(), locale: "en", timeZone: "UTC", stageAvailable: true },
    [askThePage],
  ],
  subscriptions: (s) =>
    s.phase._tag === "Ready" && s.phase.chosen._tag === "FollowingNow"
      ? [every(1000, (now): Msg => ({ _tag: "Tick", now }))]
      : [],
  intent: {
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
    PageRead: (s, { facts }) => {
      const located = { ...s, locale: facts.locale, timeZone: facts.timeZone }
      const chosen = chooseMoment(
        Option.fromNullishOr(facts.linkedMoment),
        Moment(facts.nowMillis),
      )
      return Result.match(chosen, {
        onFailure: (invalid): State => ({ ...located, phase: Phase.BadLink({ text: invalid.text }) }),
        onSuccess: (moment): [State, ReadonlyArray<Command<Msg>>] => [
          { ...located, phase: Phase.Waiting({ chosen: moment }) },
          [askForTheSky(moment.moment)],
        ],
      })
    },
    SkyAnswered: (s, { load }) => {
      if (s.phase._tag !== "Waiting") return s
      const { chosen } = s.phase
      return SkyLoad.$match(load, {
        Loaded: ({ sky, endSeconds }): State => ({ ...s, phase: showing(chosen, sky, endSeconds) }),
        OutsideCatalog: ({ firstYear, lastYear }): State => ({
          ...s,
          phase: Phase.OutsideCatalog({ firstYear, lastYear }),
        }),
        Failed: ({ problem }): State => ({ ...s, phase: Phase.Failed({ problem }) }),
      })
    },
    Tick: (s, { now }) => {
      if (s.phase._tag !== "Ready" || s.phase.chosen._tag !== "FollowingNow") return s
      const chosen = ChosenMoment.FollowingNow({ moment: Moment(now) })
      return tdbFromUtcMillis(now) >= s.phase.endSeconds
        ? [{ ...s, phase: Phase.Waiting({ chosen }) }, [askForTheSky(now)]]
        : { ...s, phase: showing(chosen, s.phase.sky, s.phase.endSeconds) }
    },
    StageReported: (s, { report }) =>
      report._tag === "StageUnavailable"
        ? { ...s, stageAvailable: false }
        : [s, [command(frameRecorder, report)]],
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
      Failed: ({ problem: kind }) =>
        problem(kind === "TileDamaged" ? COPY.tileDamaged : COPY.catalogUnavailable, false),
      Ready: ({ chosen, sky, at, readings }) => html`
        <section aria-labelledby="sky-heading">
          <h2 id="sky-heading">${COPY.skyHeading}</h2>
          <p>
            ${chosen._tag === "FollowingNow" ? COPY.following : COPY.pinned}
            <time datetime=${new Date(chosen.moment).toISOString()}
              >${formatMoment(s, chosen.moment)}</time
            >
          </p>
          ${chosen._tag === "PinnedByLink"
            ? html`<p>${COPY.pinnedNote} <a href="/">${COPY.backToNow}</a></p>`
            : nothing}
          ${s.stageAvailable
            ? html`<figure>
                <sky-stage
                  .view=${{ sky, at }}
                  data-intent-on="gyral-output"
                  data-intent=${i.StageReported}
                ></sky-stage>
                <figcaption>${COPY.figureCaption}</figcaption>
              </figure>`
            : html`<p role="status">${COPY.stageUnavailable}</p>`}
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
      `,
    })
  },
})
