import { Data, Option, Result } from "effect"
import { ChosenMoment, Moment, SPEEDS, type SpeedName } from "../types/index.js"

export class InvalidMoment extends Data.TaggedError("InvalidMoment")<{ readonly text: string }> {}

const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/

/**
 * Decides what the page shows from the link's `at` value and the clock. Only ISO 8601 passes:
 * browsers disagree about every other date format, and a class must see one sky.
 */
export const chooseMoment = (
  linked: Option.Option<string>,
  now: Moment,
): Result.Result<ChosenMoment, InvalidMoment> =>
  Option.match(linked, {
    onNone: () => Result.succeed(ChosenMoment.FollowingNow({ moment: now })),
    onSome: (text) => {
      const millis = ISO_INSTANT.test(text) ? Date.parse(text) : Number.NaN
      return Number.isNaN(millis)
        ? Result.fail(new InvalidMoment({ text }))
        : Result.succeed(ChosenMoment.PinnedByLink({ moment: Moment(millis) }))
    },
  })

/**
 * The longest real gap a single tick counts. A browser stops timers in a hidden tab or a sleeping
 * laptop, and time should wait rather than leap years ahead when the learner returns.
 */
const MAX_TICK_MILLIS = 1000

/** Starts time running from a moment. The clock starts counting at the next tick. */
export const startTravelling = (moment: Moment, speed: SpeedName): ChosenMoment =>
  ChosenMoment.Travelling({ moment, speed, lastNow: Option.none() })

/**
 * Runs from a moment to the present in a set time, forward or backward. The clock starts counting at
 * the next tick, so that the time the tile took to arrive does not eat into the run.
 */
export const startCatchingUp = (from: Moment, now: number, durationMillis: number): ChosenMoment =>
  ChosenMoment.CatchingUp({ moment: from, rate: (now - from) / durationMillis, lastNow: Option.none() })

/** Where a moment has got to, given the wall clock now. Pinned and paused moments stay put. */
export const advanceMoment = (chosen: ChosenMoment, now: number): ChosenMoment =>
  ChosenMoment.$match(chosen, {
    FollowingNow: () => ChosenMoment.FollowingNow({ moment: Moment(now) }),
    PinnedByLink: () => chosen,
    Paused: () => chosen,
    Travelling: ({ moment, speed, lastNow }) =>
      ChosenMoment.Travelling({
        moment: Option.match(lastNow, {
          onNone: () => moment,
          onSome: (last) => Moment(moment + Math.min(now - last, MAX_TICK_MILLIS) * SPEEDS[speed]),
        }),
        speed,
        lastNow: Option.some(now),
      }),
    CatchingUp: ({ moment, rate, lastNow }) => {
      const next = Option.match(lastNow, {
        onNone: () => moment,
        onSome: (last) => Moment(moment + Math.min(now - last, MAX_TICK_MILLIS) * rate),
      })
      const arrived = rate >= 0 ? next >= now : next <= now
      return arrived
        ? ChosenMoment.FollowingNow({ moment: Moment(now) })
        : ChosenMoment.CatchingUp({ moment: next, rate, lastNow: Option.some(now) })
    },
  })
