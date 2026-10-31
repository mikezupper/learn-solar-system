# Using the page with a class

- **Status:** accepted · **Verified:** 2026-10-31

This guide is for teachers. You need no astronomy background. The page's own explanation, below the picture, covers
how to use it and the science behind it, and this guide adds ways to run it with a class.

**Two things to know first.** No teacher has tried this yet, so these lesson ideas are untested suggestions, and we
would like to hear [what happens when you try them](https://github.com/mikezupper/learn-solar-system/issues/new?template=classroom_feedback.yml).
There is also no public copy of the site yet, so someone needs to [host one](deployment.md), or run it on a laptop
with `pnpm dev:quick` as [the contributing guide](../../CONTRIBUTING.md) describes. That quick version holds only 2026
and 2027.

## Before class

- Open the page on the computer you will project from, and check that the picture appears. If the 3D view cannot
  start, the table still has every number.
- Choose a moment and make a link, so that everyone sees the same thing: stop time with the round button, and share the
  link that appears under the date. A link holds its moment forever, so you can prepare it a year ahead.
- Project with the room dimmed if you can. The page is dark, and nobody has tried it yet in a bright room.

## Ten-minute activities

### How empty is space?

*The idea: the solar system is mostly nothing.*

1. Show all eight planets, and ask where the inner planets are. They are crammed into a few dozen pixels.
2. Switch to the inner planets. Neither view has changed a distance: only the camera moved.
3. Ask why the planets are dots. The answer is under "What this page leaves out": with all eight in view, even the
   Sun would be smaller than one pixel at true scale. Then turn on **Show planet sizes**, read out the label, and ask
   what would happen if it were not there.
4. Take it outside, using the scale under "Things to try". With a 10-centimeter ball for the Sun, Earth is a
   1-millimeter bead 11 meters away, and Neptune is about 325 meters away.

### Why do the planets go at different speeds?

*The idea: Kepler's laws are visible.*

1. Under "Things to try", press **Watch Mercury hurry**. Have students call out when Mercury speeds up and slows down.
   They should find it fastest near the Sun.
2. Choose 1 month per second, and have students time one lap of Earth and of Mars with a stopwatch. They should
   get about 12 and 23 seconds.
3. Have them check Kepler's third law in the page's table of orbit sizes: the *a cubed* and *T squared* columns nearly match.
   Ask them to predict Jupiter's lap from its distance, then check it at 1 year per second.

### Why did people think everything circled Earth?

*The idea: motion depends on where you stand.*

1. Choose **Ride along** with Earth, and 1 month per second.
2. Ask what the Sun seems to do. It circles you once a year, though no position on the page has changed.
3. Switch back to all eight planets, and ask which picture is true. Both are, from different places.

### How old is the light you see?

*The idea: looking out means looking back in time.*

1. Read the table's last column together, and work out how long ago we see each planet.
2. Choose Mars in the table to draw the path of its light. Run time at 1 week per second, and watch the time change,
   from about 3 minutes to about 22.
3. Ask what that means for steering a rover on Mars. A command and its reply take twice the number in the table.

## Age and level

We have assumed students of about middle-school age and older, but no teacher has confirmed this. The math under
"The math, for the curious" stays closed unless a reader opens it, so it should not get in a younger class's way.

## What not to read into the page

- The page shows where planets are in space, not where to find them in your sky.
- A dot's size means nothing, and the sizes view is enlarged, as its label says.
- The stars are decoration, in random positions.
- The Moon is not shown, so a linked eclipse date shows the planets' positions on that day, not the eclipse.

The full list is under "What this page leaves out".

## Accessibility

The controls work from the keyboard, including the arrow keys and plus and minus on the picture, and the table holds
every number for screen readers. With reduced motion set, nothing replays and the camera does not fly. A separate page,
[Where these numbers come from](../../apps/web/about-the-data.html), is a plain document with no styling or scripts.
