import { Data, Option, Result } from "effect"
import { ChosenMoment, Moment } from "../types/index.js"

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
