# Design

- **Status:** accepted · **Verified:** 2026-10-31

The page is the sky, and it should make a young person say "whoa" before it teaches them anything. The design is
called Mission Clock: a full-screen sky, a giant year behind the planets, a clock in lit dots, and one accent color that
runs from cool to hot as time speeds up. The owner approved this over an earlier, quieter design that read like a
textbook, because that one looked bland to the people it was for.

Flash may never cost the truth. Every effect below is either decoration that says so, or a way of showing something real.

- **Real positions, marked by dots.** A dot marks where a planet is, and its size says nothing about the planet. Uranus and
  Neptune are both pale, following Irwin et al. (2024), and not the deep blue of processed Voyager images.
- **Decoration says it is decoration.** The stars are random, and the page says so. They do not twinkle, and there are no
  shooting stars, because Earth's atmosphere causes both and this view is from space. No warp streaks: running time does
  not move the camera. No painted nebulae.
- **Trails are a record.** A streak behind a planet is where it was drawn in the last moments, so a longer trail only ever
  means more time.
- **Enlarged sizes are labeled, and never the default.** See [the spec](product-specs/mission-clock.md). Planets share one
  enlargement, which keeps them true to one another, and a badge states both factors as they change.
- **Time is a media player.** Young people already know play and pause, a LIVE button, and a timeline to drag. Keeping
  those three apart replaced a single list that mixed them up.
- **What to show is a flight.** The camera flies between views, and the scale bar stretches as it goes, which turns a change
  of scale into something you can feel.
- **The planets never leave.** On a phone or tablet the sky stays pinned above the numbers as you scroll. On a laptop the numbers
  slide over one side of it, and on a large desktop they simply stay open beside it.
- **Each larger screen adds a layer.** A phone has the sky and a slim bar, with everything else one tap away. A tablet adds the
  speeds and views, a laptop the full headline and caption, and a large desktop the numbers. Nothing is ever taken away from
  a small screen, only moved behind a tap. See [the spec](product-specs/fits-every-screen.md).
- **Labels stay out of the way.** A label takes the side of its dot that crowds no other planet. With all eight in view, a
  ring speaks for the inner four, and clicking it flies in.
- **Two typefaces carry the display, and the body stays plain.** Unbounded for headings and labels, Doto for the clock and
  the big numbers. Both are self-hosted, so that a school network calls no other site. Body text stays in the system font,
  stops at 68 characters so that a projected page stays readable, and numbers use tabular figures.
- **Dark only.** A sky has no light theme. This is untested on a projector in a lit room, and it is
  [in the debt tracker](exec-plans/tech-debt-tracker.md).
- **Motion is a choice the reader can refuse.** With reduced motion set, nothing replays, the camera moves without flying,
  and trails and animated dashes stay off.

Color lives in tokens in the `tokens` layer of `apps/web/src/styles/base.css`, written in oklch.
