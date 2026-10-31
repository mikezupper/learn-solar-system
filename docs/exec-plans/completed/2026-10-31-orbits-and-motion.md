# Orbit lines and motion

## Goal

The first version was hard to read: small dots in a black field, with no structure. Make it readable, draw the
path each planet follows, and show real movement. The project owner asked for these after trying it.

## Progress

- [x] Orbit math, checked against NASA's published values and the real kernel
- [x] Time running at chosen speeds, across tile boundaries
- [x] Data for 2000 through 2050
- [x] Readable stage: lines, larger dots and labels, an inner view, controls beside the stage
- [x] `ALLOWED_HOSTS` from `.env`, same-origin telemetry, an honest https error

## Decision log

**2026-10-31. Osculating ellipses, computed in the browser.** See [the design note](../../design-docs/orbit-lines.md).

**2026-10-31. The page does not start moving by itself.** At real speed nothing visibly moves, so motion must
be sped up, and that needs a learner's choice for "right now" to stay true on arrival. A note explains it.

**2026-10-31. Speeds of a day, week, month and year per second.** A month per second shows Earth going around
in 12 seconds. At a year per second, Jupiter takes 12 seconds and Saturn 30.

**2026-10-31. Default data range of 2000 through 2050.** Enough for Jupiter and Saturn to complete orbits. A
rerun now skips years already published from the same kernel, so that it does not repeat 459 requests to a
shared public service.

**2026-10-31. A hidden tab makes time wait.** A single tick counts at most one real second, so that a laptop
waking up does not leap past tiles it never loaded.

**2026-10-31. Labels try both sides of a dot.** A rule that only hid colliding labels left Mercury unnamed
beside Venus. Labels now prefer the side that crowds no neighbor.

**2026-10-31. Hostnames in `.env`.** The owner reached the dev server by name and asked that real hostnames
stay out of the code. `.env` is ignored by git, and `.env.example` documents it. This also exposed two faults
that only appear away from localhost: telemetry was addressed to `localhost`, and plain http reported its
inability to hash as a damaged tile.
