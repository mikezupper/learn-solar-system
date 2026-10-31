/**
 * Every sentence a teacher or student reads, in one place, ready for translation. Written for a
 * reader with no astronomy background. docs/FRONTEND.md holds the writing brief.
 */
export const COPY = {
  skyHeading: "The Sun and planets, to scale",
  following: "Showing this moment, updated every second:",
  pinned: "Showing the moment in this link:",
  paused: "Stopped at this moment:",
  travelling: "Time is running fast. The date on screen is:",
  pinnedNote: "This link holds one fixed moment, so everyone who opens it sees the same sky.",
  linkToMoment: "Link to this moment, to share with a class",
  backToNow: "Go to the present moment",
  controlsLabel: "Controls for the view",
  speedLegend: "How fast time runs",
  speedNow: "Right now",
  speedStopped: "Stopped",
  speedDay: "1 day per second",
  speedWeek: "1 week per second",
  speedMonth: "1 month per second",
  speedYear: "1 year per second",
  realSpeedNote:
    "At real speed the planets look still, even though Earth travels about 30 kilometers every second. Speed up time to watch them move.",
  travellingNote:
    "Each frame shows where JPL's data puts every planet on that date. The motion is real, only faster.",
  viewLegend: "What to show",
  viewAll: "All eight planets",
  viewInner: "Inner planets, Mercury to Mars",
  endOfData: (lastYear: number) =>
    `Time stopped here because this site has planet data through ${String(lastYear)}.`,
  nextYearUnavailable:
    "Time stopped here because the next year's planet data could not be loaded. Choose a speed to try again.",
  figureCaption:
    "Distances are to scale, which makes the planets far too small to see at this size. Each dot marks where a planet is, not how big it is, and each line shows the path it is following around the Sun. Drag to turn the view; scroll or pinch to zoom.",
  stageLabel:
    "A three-dimensional view of the Sun and the eight planets at their true distances, with the path each planet follows. The table below gives the same positions as numbers.",
  stageUnavailable:
    "This browser could not start the 3D view. The table below still has every number.",
  numbersHeading: "The numbers behind the picture",
  tableCaption: "Distances at the moment shown above",
  columnPlanet: "Planet",
  columnFromSun: "Distance from the Sun",
  columnFromEarth: "Distance from Earth",
  columnLight: "Light travel time from Earth",
  notApplicable: "not applicable",
  notApplicableShort: "n/a",
  auTitle: "astronomical units",
  auShort: "AU",
  minutesTitle: "minutes",
  minutesShort: "min",
  definitionsHeading: "What these numbers mean",
  auTerm: "Astronomical unit (AU)",
  auDefinition:
    "The average distance between Earth and the Sun, about 150 million kilometers. Neptune is about 30 AU from the Sun.",
  lightTerm: "Light travel time",
  lightDefinition:
    "How long a planet's light takes to reach Earth. When you look at Neptune, you see it as it was about four hours ago.",
  loading: "Loading the planets' positions.",
  aboutTheData: "Where these numbers come from",
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
