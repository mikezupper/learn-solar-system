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
- **Labels stay out of the way.** A label takes the side of its dot that crowds no other planet. When a
  body has no room on either side, the Sun, Earth and the giants keep their names first.
- **Two ways to frame one true scale.** With all eight planets in view, the inner four share a few dozen
  pixels. A framing control moves the camera in; neither view distorts a distance.
- **The controls stay beside the picture.** On a wide screen they sit in a column next to the stage, so that
  both stay in sight while time runs. On a narrow screen they follow the stage.
- **Lines are lighter than dots.** Each line uses its planet's color at reduced opacity, so that the dots
  stand out and a line can be traced back to its planet.
- **No twinkling and no shooting stars.** Earth's atmosphere causes both, so neither belongs in a view
  from space.

Color lives in tokens in the `tokens` layer of `apps/web/src/styles.css`, written in oklch.
