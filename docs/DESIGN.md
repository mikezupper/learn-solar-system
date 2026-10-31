# Design

- **Status:** accepted · **Verified:** 2026-10-31

The page should read like a well-set science textbook with one live figure in it.

- **Space is black; the page is not.** The stage is the only dark element in the light theme, which
  makes the figure read as a window. The page follows the reader's color scheme through `light-dark()`.
- **The system font, at a generous measure.** Text stops at 68 characters so that a projected page stays
  readable. Numbers use tabular figures, so columns of distances line up.
- **True positions, marked by dots.** A dot marks where a planet is. Its size is fixed and says nothing
  about the planet. Uranus and Neptune are both pale, following Irwin et al. (2024), and not the deep blue
  of processed Voyager images.
- **Labels yield.** When labels would overlap, the Sun, Earth and the giants keep theirs. Zooming in
  separates the inner planets, and their labels return.
- **No twinkling and no shooting stars.** Earth's atmosphere causes both, so neither belongs in a view
  from space.

Color lives in tokens in the `tokens` layer of `apps/web/src/styles.css`, written in oklch.
