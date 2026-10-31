/** The pure arithmetic and wording behind the dock and the table, so that it tests without a DOM. */

const MILLIS_PER_DAY = 86_400_000
const MINUTES_PER_HOUR = 60

/** Minutes up to an hour, and then hours and minutes, since "259.9 min" means little to a learner. */
export const lightText = (minutes: number): string => {
  if (minutes < MINUTES_PER_HOUR) return `${minutes.toFixed(1)} min`
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  return `${String(hours)} h ${String(Math.floor(minutes - hours * MINUTES_PER_HOUR)).padStart(2, "0")} min`
}

const firstMoment = (firstYear: number): number => Date.UTC(firstYear, 0, 1)

/** A timeline position counts whole days from the first day of the first year. */
export const dayFromMoment = (moment: number, firstYear: number): number =>
  Math.floor((moment - firstMoment(firstYear)) / MILLIS_PER_DAY)

export const momentFromDay = (day: number, firstYear: number): number =>
  firstMoment(firstYear) + day * MILLIS_PER_DAY

export const lastDay = (firstYear: number, lastYear: number): number =>
  dayFromMoment(Date.UTC(lastYear, 11, 31), firstYear)

/** How far along the timeline a moment sits, from 0 to 100. */
export const percentOf = (moment: number, firstYear: number, lastYear: number): number => {
  const start = firstMoment(firstYear)
  const span = Date.UTC(lastYear + 1, 0, 1) - start
  return Math.min(100, Math.max(0, ((moment - start) / span) * 100))
}

const MOST_TICKS = 6

/** The years to mark on the timeline: round steps, always including both ends. */
export const yearTicks = (firstYear: number, lastYear: number): ReadonlyArray<number> => {
  const span = lastYear - firstYear
  const step = span < MOST_TICKS ? 1 : Math.ceil(span / (MOST_TICKS - 1) / 5) * 5
  return Array.from({ length: Math.floor(span / step) + 1 }, (_, index) => firstYear + index * step)
}

export interface ClockParts {
  readonly date: string
  readonly time: string
}

/** The date in capitals for the big dots, and the time with its zone: a shared link may cross one. */
export const clockParts = (moment: number, locale: string, timeZone: string): ClockParts => {
  const parts = new Intl.DateTimeFormat(locale, { month: "short", day: "2-digit", year: "numeric", timeZone })
    .formatToParts(moment)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? ""
  return {
    date: `${part("month").toLocaleUpperCase(locale)} ${part("day")} ${part("year")}`,
    time: new Intl.DateTimeFormat(locale, { timeStyle: "long", timeZone }).format(moment),
  }
}
