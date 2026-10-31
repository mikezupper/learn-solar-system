import type { PlanetName, SpeedName } from "@solar/classroom/types"
import { lightText } from "./classroom-format.js"

const SPEED_NAMES: Readonly<Record<SpeedName, string>> = {
  day: "1 day per second",
  week: "1 week per second",
  month: "1 month per second",
  year: "1 year per second",
}

const SPEED_STEPS: Readonly<Record<SpeedName, string>> = {
  day: "1 day",
  week: "1 week",
  month: "1 month",
  year: "1 year",
}

const LAP_NOTES: Readonly<Record<SpeedName, string>> = {
  day: "Mercury goes around in about 88 seconds.",
  week: "Mercury goes around in about 13 seconds, Earth in about 52.",
  month: "Earth goes around in about 12 seconds, Mars in about 23.",
  year: "Jupiter goes around in about 12 seconds, Saturn in about 29.",
}

/**
 * Every sentence a component renders, in one place, ready for translation. Written for a reader with
 * no astronomy background. docs/FRONTEND.md holds the writing brief. The long explanation below the
 * live view is static HTML in index.html, so that it reads with no script.
 */
export const COPY = {
  speedName: SPEED_NAMES,
  pinnedNote: "This link holds one fixed moment, so everyone who opens it sees the same sky.",
  linkToMoment: "Link to this moment, to share with a class",
  backToNow: "Go to the present moment",
  controlsLabel: "Controls for the view",
  speedLegend: "How fast time runs",
  speedNow: "Right now",
  perSecond: "per second",
  speedSteps: SPEED_STEPS,
  runTime: (speed: SpeedName) => `Run time at ${SPEED_NAMES[speed]}`,
  stopTime: "Stop time",
  timesRealSpeed: (times: string) => `${times} times real speed`,
  realSpeed: "Real speed",
  stopped: "Stopped",
  catchingUp: "Catching up to right now",
  followingNote: (armed: SpeedName) =>
    `Real speed, updated every second: the planets look still. Play runs ${SPEED_NAMES[armed]}.`,
  stoppedNote: (armed: SpeedName) => `Stopped. Play runs ${SPEED_NAMES[armed]}.`,
  lapNote: LAP_NOTES,
  travellingNote: "The motion is real, only faster.",
  fetchingYear: (year: number) => `Fetching the planets for ${String(year)}. The picture waits, so that it never guesses.`,
  timelineLabel: (first: number, last: number) => `Jump to any date, ${String(first)} through ${String(last)}`,
  now: "now",
  viewLegend: "What to show",
  viewAll: "All eight planets",
  viewAllNote: "Out to Neptune, 30 AU",
  viewInner: "Inner planets",
  viewInnerNote: "Zoom ×18, out to Mars",
  viewRide: "Ride along",
  viewRideNote: (planet: PlanetName) => `With ${planet}. Only your viewpoint moves`,
  riderLabel: "Planet to ride with",
  sizesLabel: "Show planet sizes",
  sizesNote: "Enlarged, not to scale",
  sizesBadge: (planets: string, sun: string) =>
    `Not to scale: planets drawn ${planets} times too big, the Sun ${sun} times. Distances are still true.`,
  figureCaption:
    "True distances. A dot marks where a planet is, not how big it is. Drag to turn the view. Pinch, or hold Ctrl and scroll, to zoom.",
  rideCaption: (planet: PlanetName) =>
    `Riding along with ${planet}. Only your viewpoint moves, so the Sun seems to circle you. Distances stay true.`,
  sizesCaption: "True distances, but planets and the Sun are enlarged so that you can compare their sizes.",
  odometer: (kilometers: string) => `Earth has flown ${kilometers} km around the Sun since you got here.`,
  stageLabel:
    "A three-dimensional view of the Sun and the eight planets at their true distances, with the path each planet follows. The table below gives the same positions as numbers. Arrow keys turn the view, and plus and minus zoom.",
  stageUnavailable:
    "This browser could not start the 3D view. The table below still has every number.",
  ringWords: "4 planets in here",
  ringAction: "Click or tap to fly in",
  scaleBar: (au: number) => `${String(au)} AU, ${au >= 10 ? `about ${String(au * 0.15)} billion km` : `about ${String(Math.round(au * 150))} million km`}`,
  ofLight: (minutes: number) => `${lightText(minutes)} of light`,
  numbersHeading: "The numbers behind the picture",
  heroNote: (planet: PlanetName, minutes: number) =>
    `Light from ${planet} takes this long to reach Earth, so you see ${planet} as it was about ${
      minutes < 100 ? `${String(Math.round(minutes))} minutes` : `${String(Math.round(minutes / 60))} hours`
    } ago.`,
  tableCaption: "Distances at the moment on the clock. Choose a planet to draw the path its light takes to Earth.",
  columnPlanet: "Planet",
  columnFromSun: "From the Sun",
  columnFromEarth: "From Earth",
  columnLight: "Light to Earth",
  lightMeter: (planet: PlanetName) => `How long ${planet}'s light takes, compared with Neptune at its farthest`,
  notApplicable: "not applicable",
  notApplicableShort: "n/a",
  auTitle: "astronomical units",
  auShort: "AU",
  definitionsHeading: "What these numbers mean",
  auTerm: "Astronomical unit (AU)",
  auDefinition:
    "The average distance between Earth and the Sun, about 150 million kilometers. Neptune is about 30 AU from the Sun.",
  lightTerm: "Light travel time",
  lightDefinition:
    "How long a planet's light takes to reach Earth. When you look at Neptune, you see it as it was about four hours ago.",
  loading: "Loading the planets' positions.",
  endOfData: (lastYear: number) =>
    `Time stopped here because this site has planet data through ${String(lastYear)}.`,
  nextYearUnavailable:
    "That year's planet data could not be loaded, so the picture stayed where it was. Choose a speed to try again.",
  catalogUnavailable:
    "The planet data could not be loaded. Check your connection, then reload the page.",
  tileDamaged:
    "The planet data arrived damaged, so this page will not show it. Reload the page to try again.",
  tileUncheckable:
    "This page checks its planet data before showing it, and browsers allow that only on secure pages. Open it with an https address.",
  outsideCatalog: (firstYear: number, lastYear: number) =>
    `This site has planet data for ${String(firstYear)} through ${String(lastYear)}. The date in this link falls outside those years.`,
  badLink: (text: string) =>
    `This link's date cannot be read: "${text}". A date looks like 2026-08-12T17:46:00Z.`,
} as const
