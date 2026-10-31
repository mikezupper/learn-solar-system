# Orbit lines

- **Status:** accepted · **Verified:** 2026-10-31

Each line on the stage is an **osculating orbit**: the ellipse a planet would follow if only the Sun pulled
on it, computed in the browser from the planet's position and velocity at the moment shown.
`packages/classroom/src/service/orbit.ts` holds the math. Velocity comes from a central difference of the
tile's track, one hour on either side, and each planet's system mass comes from JPL's `gm_de440.tpc`.

## How close the lines are

Measured against DE440s, with a line computed at 2026-10-31, as the distance from the real position to the
drawn line. `orbit-fidelity.kernel.test.ts` pins the full-orbit column.

| Planet | Over one year (AU) | Over one full orbit (AU) |
|---|---|---|
| Mercury | under 0.0001 | under 0.0001 |
| Venus | under 0.0001 | under 0.0001 |
| Earth | 0.0001 | 0.0001 |
| Mars | 0.0001 | 0.0002 |
| Jupiter | 0.0001 | 0.0015 |
| Saturn | 0.0001 | 0.0125 |
| Uranus | 0.0002 | 0.1410 |
| Neptune | 0.0004 | 0.0670 |

One pixel is about 0.006 AU in the inner view and 0.12 AU with all eight planets in frame. The stage redraws
each line every 30 simulated days, so what a learner sees is the one-year column, not the full-orbit one.

**Measure distance to the line, not to its points.** With 360 points, the nearest point to anything on
Neptune's orbit can be 0.26 AU away while the line itself is much closer. The first version of the test made
that mistake, and its failures looked like bad orbits.

## Earth uses the Earth-Moon barycenter

Earth wobbles around the center of mass it shares with the Moon every month, which would make the ellipse
shiver. The line follows the barycenter, and Earth's dot stays within about 4,700 km of it.

## Rejected

| Option | Why not | Reopen when |
|---|---|---|
| Sampling the real path in the worker | A new artifact, schema and pipeline, for a difference under a pixel on screen | Close-up views need it |
| Ellipses around the solar-system barycenter | Over a full orbit they are about 20 times closer for Uranus and Neptune, but worse for Jupiter, and the line is redrawn long before that drift shows | A view shows a whole outer orbit with no redrawing |
