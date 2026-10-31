# Explain the page

- **Status:** accepted · **Verified:** 2026-10-31

## Scope and assumptions

A teacher or student can learn, on the main page, what it does, how to use it, how it works and what science is
behind it. The project owner asked for this after trying the page, which until then explained itself only on a
separate document.

Nothing here changes stored state: this slice is text. Assumed, not yet tested with teachers: that this much text
belongs on the main page, below the picture, and that the math should stay closed until asked for.

## Slice

| # | Slice | Pattern | Shows | Code |
|---|---|---|---|---|
| S08 | Explain the page | Static document | What it does, how to use it, how it works, the science, what it leaves out, sources | `apps/web/index.html` |

The text is static HTML, not part of the Gyral component, because it must read with JavaScript off and when the data
fails to load. So it cannot use `copy.ts`, and no type checks its numbers. `explanation.test.ts` does that instead.

## Acceptance

- Each of the four subjects has a heading, and a list of contents at the top reaches every section.
- The live picture still comes first.
- The explanation reads with JavaScript off, and stays when the planet data cannot load.
- The page passes axe in both color schemes, and does not scroll sideways on a phone.
- The math stays closed until a reader opens it.

These run in `apps/web/e2e/understand-the-page.spec.ts`.

## Where each number on the page comes from

A number here must come from outside this code, or be measured from JPL's data.

| Claim | Source | Held by |
|---|---|---|
| Size, stretch, tilt and top speeds of each orbit | NASA planetary fact sheets, per planet | Compared with the tile in `explanation.test.ts` |
| Kepler's third law, in the table | The fact sheets' distances and periods | `explanation.test.ts`, against the law itself |
| Lap times at each speed | Orbital periods and `SPEEDS` | `explanation.test.ts` |
| TDB about 69 s ahead of UTC in 2026 | `tdbFromUtcMillis` | `explanation.test.ts` |
| The astronomical unit, the speed of light | IAU 2012 Resolution B2; the SI definition | `KM_PER_AU`, checked by `explanation.test.ts` |
| 343 asteroids, 30 Kuiper belt objects and a ring; the spacecraft and laser data; about 0.7 m for MESSENGER | Park et al. 2021 | Read from the paper |
| Greatest eclipse at 17:47:06, gamma 0.8977 | NASA's eclipse catalog | `golden.test.ts` |
| 4.7 m worst difference over 5,508 comparisons | The published catalog: 51 years, 12 instants, 9 bodies | Measured from `catalog.json`; [RELIABILITY](../RELIABILITY.md) |
| Drift of 0.0004 AU a year, 0.14 AU per orbit | Measured | `orbit.test.ts`, `orbit-fidelity.kernel.test.ts` |
| One pixel is about 0.12 AU, or 18 million km, with all planets in view | [Orbit lines](../design-docs/orbit-lines.md) | Reasoned from the framing, not tested |
| Earth at 0.983 to 1.017 AU; sunlight 8.2 to 8.5 min; Neptune about 4 hours; Mars 3 to 22 min | Measured daily across 2000 to 2050 on 2026-10-31 | One-off measurement, not tested |
| Barycenter 93,000 to 1.38 million km from the Sun; Earth about 4,700 km from its barycenter | Same measurement | One-off measurement, not tested |
| Scale model with a 10 cm Sun; nearest star at about 2,900 km | Arithmetic from NASA's diameters and distances; Proxima Centauri at 4.25 light years | Worked by hand |

## Open questions

- ⚠ Is this the right amount of text for a class, or does it belong behind links? A teacher's view would settle it.
- ⚠ Do the "Things to try" work with real students? See [the teaching guide](../guides/teaching.md).
