import { defineHook, html, intentsOf, nothing, type TemplateResult } from "@gyral/core"
import { Option } from "effect"
import { PLANETS, SPEEDS, type PlanetName, type Reading, type SpeedName } from "@solar/classroom/types"
import { dayFromMoment, lastDay, lightText, percentOf, yearTicks } from "./classroom-format.js"
import { armedSpeed } from "./classroom-model.js"
import type { Ready, State } from "./classroom-state.js"
import type { SolarClassroom } from "./classroom.js"
import { COPY } from "./copy.js"

const i = intentsOf<typeof SolarClassroom>()

const SPEED_ORDER: ReadonlyArray<SpeedName> = ["day", "week", "month", "year"]
/** The longest light time in 2000 through 2050: Neptune, measured across all the published years. */
const LONGEST_LIGHT_MINUTES = 265

/** Sets how far along the timeline the thumb and the present are, for the track to draw. */
const timelinePositions = defineHook<[progress: number, now: number]>({
  client: (element, [progress, now]) => {
    if (!(element instanceof HTMLElement)) return
    element.style.setProperty("--p", `${String(progress)}%`)
    element.style.setProperty("--now", `${String(now)}%`)
  },
})

/** Each icon draws its orbits at their true proportions. */
const ICON_ALL = html`<svg viewBox="0 0 48 48" aria-hidden="true">
  <circle data-planet="Neptune" cx="24" cy="24" r="22"></circle>
  <circle data-planet="Uranus" cx="24" cy="24" r="14"></circle>
  <circle data-planet="Saturn" cx="24" cy="24" r="7"></circle>
  <circle data-planet="Jupiter" cx="24" cy="24" r="3.8"></circle>
  <circle data-planet="Sun" cx="24" cy="24" r="1.2"></circle>
</svg>`

const ICON_INNER = html`<svg viewBox="0 0 48 48" aria-hidden="true">
  <circle data-planet="Mars" cx="24" cy="24" r="22"></circle>
  <circle data-planet="Earth" cx="24" cy="24" r="14.4"></circle>
  <circle data-planet="Venus" cx="24" cy="24" r="10.4"></circle>
  <circle data-planet="Mercury" cx="24" cy="24" r="5.6"></circle>
  <circle data-planet="Sun" cx="24" cy="24" r="1.6"></circle>
</svg>`

const ICON_RIDE = html`<svg viewBox="0 0 48 48" aria-hidden="true">
  <circle data-planet="Earth" cx="24" cy="24" r="20"></circle>
  <circle data-planet="Sun" cx="24" cy="24" r="2"></circle>
  <circle data-rider-dot cx="38" cy="10" r="4"></circle>
</svg>`

const ICON_PLAY = html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.5v15l12-7.5z"></path></svg>`
const ICON_STOP = html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"></path></svg>`

const viewTile = (
  value: string,
  checked: boolean,
  icon: TemplateResult,
  name: string,
  note: string,
): TemplateResult =>
  html`<label>
    <input type="radio" name="framing" value=${value} ?checked=${checked} data-intent=${i.FramingChosen} />
    ${icon}
    <b>${name}</b>
    <small>${note}</small>
  </label>`

export const viewTiles = (s: State): TemplateResult =>
  html`<fieldset data-view>
    <legend>${COPY.viewLegend}</legend>
    ${viewTile("all", s.framing === "all", ICON_ALL, COPY.viewAll, COPY.viewAllNote)}
    ${viewTile("inner", s.framing === "inner", ICON_INNER, COPY.viewInner, COPY.viewInnerNote)}
    ${viewTile("ride", s.framing === "ride", ICON_RIDE, COPY.viewRide, COPY.viewRideNote(s.rider))}
    <p data-view-options>
      ${s.framing === "ride"
        ? html`<label data-rider>
            ${COPY.riderLabel}
            <select name="rider" data-intent=${i.RiderChosen}>
              ${PLANETS.map(
                ({ name }) => html`<option value=${name} ?selected=${name === s.rider}>${name}</option>`,
              )}
            </select>
          </label>`
        : nothing}
      <label data-sizes>
        <input type="checkbox" name="sizes" ?checked=${s.showSizes} data-intent=${i.SizesToggled} />
        <b>${COPY.sizesLabel}</b>
        <small>${COPY.sizesNote}</small>
      </label>
    </p>
  </fieldset>`

const statusFor = (s: State, phase: Ready): string => {
  if (Option.isSome(phase.seeking)) return COPY.fetchingYear(new Date(phase.seeking.value).getUTCFullYear())
  if (s.notice._tag === "EndOfData") return COPY.endOfData(s.notice.lastYear)
  if (s.notice._tag === "NextYearUnavailable") return COPY.nextYearUnavailable
  switch (phase.chosen._tag) {
    case "FollowingNow":
      return COPY.followingNote(armedSpeed(s))
    case "PinnedByLink":
      return COPY.pinnedNote
    case "Paused":
      return COPY.stoppedNote(armedSpeed(s))
    case "CatchingUp":
      return COPY.catchingUp
    case "Travelling":
      return `${COPY.travellingNote} ${COPY.lapNote[phase.chosen.speed]}`
  }
}

const paceFor = (s: State, phase: Ready): string => {
  switch (phase.chosen._tag) {
    case "FollowingNow":
      return COPY.realSpeed
    case "PinnedByLink":
    case "Paused":
      return COPY.stopped
    case "CatchingUp":
      return COPY.catchingUp
    case "Travelling":
      return COPY.timesRealSpeed(new Intl.NumberFormat(s.locale).format(SPEEDS[phase.chosen.speed]))
  }
}

const timeline = (s: State, phase: Ready, shown: number): TemplateResult =>
  html`<label data-scrub ${timelinePositions(
    percentOf(shown, phase.firstYear, phase.lastYear),
    percentOf(s.openedAt, phase.firstYear, phase.lastYear),
  )}>
    <b>${COPY.timelineLabel(phase.firstYear, phase.lastYear)}</b>
    <input
      type="range"
      name="date"
      min="0"
      max=${lastDay(phase.firstYear, phase.lastYear)}
      step="1"
      value=${dayFromMoment(shown, phase.firstYear)}
      aria-valuetext=${new Intl.DateTimeFormat(s.locale, { dateStyle: "long", timeZone: "UTC" }).format(shown)}
      data-intent-input=${i.ScrubValue}
      data-intent-change=${i.ScrubReleased}
    />
    <ol aria-hidden="true">
      ${yearTicks(phase.firstYear, phase.lastYear).map((year) => html`<li>${year}</li>`)}
    </ol>
  </label>`

const speedStep = (s: State, phase: Ready, speed: SpeedName): TemplateResult => {
  const running = phase.chosen._tag === "Travelling"
  const checked = running && phase.chosen.speed === speed
  return html`<label data-step=${speed} ?data-armed=${!running && armedSpeed(s) === speed}>
    <input type="radio" name="speed" value=${speed} ?checked=${checked} data-intent=${i.SpeedChosen} />
    <b>${COPY.speedSteps[speed]}</b> <small>${COPY.perSecond}</small>
  </label>`
}

/** The accent color follows the speed, from cool to hot. CSS reads these two attributes. */
const warpOf = (phase: Ready): string =>
  phase.chosen._tag === "Travelling" ? phase.chosen.speed : "still"

const modeOf = (phase: Ready): string =>
  phase.chosen._tag === "Travelling" || phase.chosen._tag === "CatchingUp"
    ? "running"
    : phase.chosen._tag === "FollowingNow"
      ? "live"
      : "stopped"

export const dock = (s: State, phase: Ready): TemplateResult => {
  const running = modeOf(phase) === "running"
  const shown = Option.getOrElse(phase.seeking, () => phase.chosen.moment)
  const rate =
    phase.chosen._tag === "Travelling"
      ? SPEEDS[phase.chosen.speed]
      : phase.chosen._tag === "CatchingUp"
        ? phase.chosen.rate
        : 0
  return html`<section
    data-dock
    data-mode=${modeOf(phase)}
    data-warp=${warpOf(phase)}
    aria-label=${COPY.controlsLabel}
  >
    ${timeline(s, phase, shown)}
    <button
      data-play
      type="button"
      aria-label=${running ? COPY.stopTime : COPY.runTime(armedSpeed(s))}
      data-intent=${i.PlayPressed}
    >
      ${running ? ICON_STOP : ICON_PLAY}
    </button>
    <p data-clock>
      <moment-clock
        .view=${{
          moment: shown,
          rate,
          limit: Date.UTC(phase.lastYear + 1, 0, 1) - 1,
          locale: s.locale,
          timeZone: s.timeZone,
        }}
      ></moment-clock>
      <small>${paceFor(s, phase)}</small>
      ${phase.chosen._tag === "Paused" && Option.isNone(phase.seeking)
        ? html`<a href=${`/?at=${new Date(shown).toISOString()}`}>${COPY.linkToMoment}</a>`
        : nothing}
    </p>
    <fieldset data-speed>
      <legend>${COPY.speedLegend}</legend>
      ${SPEED_ORDER.map((speed) => speedStep(s, phase, speed))}
    </fieldset>
    <output>${statusFor(s, phase)}</output>
    <button
      data-now
      type="button"
      aria-pressed=${phase.chosen._tag === "FollowingNow" ? "true" : "false"}
      data-intent=${i.BackToNow}
    >
      ${COPY.speedNow}
    </button>
  </section>`
}

const LIGHT_MINUTES_OF = (readings: ReadonlyArray<Reading>, planet: PlanetName): number =>
  Option.getOrElse(
    readings.find((reading) => reading.planet === planet)?.lightMinutesFromEarth ?? Option.none(),
    () => 0,
  )

const notApplicable = html`<abbr title=${COPY.notApplicable}>${COPY.notApplicableShort}</abbr>`

const readingRow = (s: State, reading: Reading, format: Intl.NumberFormat): TemplateResult => {
  const picked = Option.getOrUndefined(s.lightFrom) === reading.planet
  return html`<tr data-planet=${reading.planet}>
    <th scope="row">
      ${reading.planet === "Earth"
        ? html`<b>${reading.planet}</b>`
        : html`<button
            type="button"
            value=${reading.planet}
            aria-pressed=${picked ? "true" : "false"}
            data-intent=${i.PlanetPicked}
          >
            ${reading.planet}
          </button>`}
    </th>
    <td>${format.format(reading.sunDistanceAu)}</td>
    <td>${Option.match(reading.earthDistanceAu, { onNone: () => notApplicable, onSome: (au) => format.format(au) })}</td>
    <td>
      ${Option.match(reading.lightMinutesFromEarth, {
        onNone: () => notApplicable,
        onSome: (minutes) =>
          html`<b>${lightText(minutes)}</b>
            <meter
              min="0"
              max=${LONGEST_LIGHT_MINUTES}
              value=${minutes}
              aria-label=${COPY.lightMeter(reading.planet)}
            ></meter>`,
      })}
    </td>
  </tr>`
}

export const numbers = (s: State, phase: Ready): TemplateResult => {
  const format = new Intl.NumberFormat(s.locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  const heroMinutes = LIGHT_MINUTES_OF(phase.readings, s.heroPlanet)
  return html`<section
    data-numbers
    id="numbers"
    aria-labelledby="numbers-heading"
    aria-busy=${Option.isSome(phase.seeking) ? "true" : "false"}
  >
    <h2 id="numbers-heading">${COPY.numbersHeading}</h2>
    <p data-hero>
      <strong>${lightText(heroMinutes)}</strong>
      <small>${COPY.heroNote(s.heroPlanet, heroMinutes)}</small>
    </p>
    <table>
      <caption>${COPY.tableCaption}</caption>
      <thead>
        <tr>
          <th scope="col">${COPY.columnPlanet}</th>
          <th scope="col">${COPY.columnFromSun} (<abbr title=${COPY.auTitle}>${COPY.auShort}</abbr>)</th>
          <th scope="col">${COPY.columnFromEarth} (<abbr title=${COPY.auTitle}>${COPY.auShort}</abbr>)</th>
          <th scope="col">${COPY.columnLight}</th>
        </tr>
      </thead>
      <tbody>
        ${phase.readings.map((reading) => readingRow(s, reading, format))}
      </tbody>
    </table>
    <h3>${COPY.definitionsHeading}</h3>
    <dl>
      <dt><dfn>${COPY.auTerm}</dfn></dt>
      <dd>${COPY.auDefinition}</dd>
      <dt><dfn>${COPY.lightTerm}</dfn></dt>
      <dd>${COPY.lightDefinition}</dd>
    </dl>
  </section>`
}

export const captionFor = (s: State): string =>
  s.framing === "ride" ? COPY.rideCaption(s.rider) : s.showSizes ? COPY.sizesCaption : COPY.figureCaption
