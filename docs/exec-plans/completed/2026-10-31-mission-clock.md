# Mission Clock

## Goal

The project owner found the page bland and asked for something flashier, more "space" in its look, and enticing to
young people, with a UX redesign of the two control groups. They approved the "Mission Clock" mock and added two
features: a camera that rides along with a planet, and a clearly labeled view with enlarged planets. Done means the
real page has all of this on JPL's real data, `pnpm verify` passes, and no number or position is any less true.

## Progress

- [x] Domain: catching up to the present, framing math, planet diameters
- [x] Model: play, seek across years, armed speed, ride along, sizes, the light beam, the odometer
- [x] Page: sky, dock, tiles, numbers panel, explanation, self-hosted fonts
- [x] Stage: stars, giant year, trails, ring, beam, scale bar, flights, ride along, enlarged planets, no scroll trap
- [x] Tests rewritten for the new controls; design documents and guides updated

## Decision log

**2026-10-31. The picture stays on JPL's data, in Three.js.** The mock faked its orbits in 2D. Effects that need thick or
fading lines (trails, the ring, the light beam, the scale bar) draw on a 2D canvas above the WebGL one, because WebGL
lines are one pixel wide. Everything they draw comes from the same tile.

**2026-10-31. Trails are a record, not a calculation.** A trail is the positions the stage actually drew in the last
1.5 seconds. Evaluating a tile at an earlier time would run off its first record at New Year and return nonsense.

**2026-10-31. Dragging the timeline never guesses.** Within the loaded year it moves at once. Across years, the clock
shows the requested date, the status says the data is on its way, and the picture and table dim until the tile lands.

**2026-10-31. "Right now" animates only within one year.** Rewinding across years in a second would need dozens of
tiles, or a date that disagrees with the picture. From another year, the page loads the present's tile and goes there.

**2026-10-31. Wheel scrolls the page; Ctrl and wheel zooms.** A full-screen stage would otherwise trap anyone trying to
scroll past it. A trackpad pinch arrives as Ctrl and wheel, and a touch pinch still reaches the controls. Touch sets
`pan-y`, so that a vertical swipe scrolls.

**2026-10-31. Stars are decoration, and the page says so.** Their positions are random, from a fixed seed. They do not
twinkle, since space has no air to make them. A real catalog is possible later.

**2026-10-31. The sizes view is off by default and labels itself.** Planets share one enlargement, so they stay true to
one another, and the Sun gets a smaller one, or it would swallow the inner planets. A label on the picture states both
factors as they change.

**2026-10-31. The explanation's buttons reach the component through a subscription.** They are static HTML outside it, so
that the text reads with no script. A document-level click listener decodes their attributes at the boundary, and they stay
hidden when no script could answer them.

**2026-10-31. Keyboard control of the camera, while the stage was open.** It was on the debt tracker, and a redesign aimed at
more people was the time to pay it.

**2026-10-31. The stage measures what covers it.** The dock and the numbers panel change the free part of the view, so the
stage reads their sizes, shifts the camera's center there, and refits. Those sizes also reach the page's layout as CSS
variables, because the tiles and the caption must sit clear of them.

**2026-10-31. The page goes dark-only.** The owner approved a design that is. A projector in a lit room may wash it out,
which no one has tested yet.
