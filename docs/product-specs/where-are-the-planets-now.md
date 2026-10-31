# Where are the planets right now?

- **Status:** accepted · **Verified:** 2026-10-31

## Scope and assumptions

A teacher opens a page, and the class sees the Sun and planets at their true positions, with the distances
and light travel times behind the picture.

One team, so no lane owners. The position math is an algorithm: this model covers its edges only. Reading
the sky changes nothing, so it is a view and not an event. Assumed, not yet tested with teachers: no
accounts, and a link is how a class shares a moment.

## Timeline

One run, with real data:

1. On 2026-10-31 the worker compiles 2026 from `de440s.bsp` and checks 9 bodies at 12 instants. The worst
   error is 2.5 m, so the tile is verified.
2. The worker publishes `planets-2026`: 104,400 bytes, hash `6c54357f...`.
3. A teacher opens `/?at=2026-08-12T17:46:00Z`, the day of a solar eclipse. Mars reads 1.495 AU from the
   Sun, 1.947 AU from Earth, and 16.2 minutes of light travel.
4. A student opens `/` with no date, and the page follows the clock.

Parked for later: a teacher saves a named moment, a lesson with guided steps, a student explains what
they see.

## Blueprint

```
[Screen]  = trigger (white)    ⟦Command⟧ = command (blue)
⟪Event⟫   = event (orange)     ((View))  = view (green)    ⚙ = automation / translator
✗ Reason  = rejected command   ⚠ = gap or open question     ? = unconfirmed element

time ──▶
slice         S01                     S02                 S03               S04
UI Teacher    │                       │                   │                 [Classroom page]
UI Student    │                       │                   │                 [Classroom page]
⚙ Worker      ⚙ TileChecker           ⚙ TilePublisher     │                 │
EXT JPL       Horizons vectors        │                   │                 │
                     ▼                      ▼                  ▲                 ▲
Cmd / View    ⟦VerifyTile⟧            ⟦PublishTile⟧       ((TileCatalog))   ((PlanetReadings))
                     ▼                      ▼                  ▲                 ▲
EV Tiles      ⟪TileVerified⟫          ⟪TilePublished⟫     ⟪TilePublished⟫   ⟪TilePublished⟫
              ✗ TileRejected
```

## Slice backlog

| # | Slice | Pattern | Consumes | Produces | Code |
|---|---|---|---|---|---|
| S01 | Verify a tile | Translation | Horizons vectors | ⟪TileVerified⟫, ⟪TileRejected⟫ | `verify-tile.ts`, `decisions.ts` |
| S02 | Publish a tile | Automation | ⟪TileVerified⟫ | ⟪TilePublished⟫ | `build-tile.ts`, `decisions.ts` |
| S03 | Find the tile for a moment | View | ⟪TilePublished⟫ | ((TileCatalog)) | `load-tile.ts` |
| S04 | Show the sky | View | ((TileCatalog)), the tile | ((PlanetReadings)) | `sky.ts`, `classroom.ts` |

Events are state-stored: a catalog entry holds the fact of publication and its evidence. Nothing here calls
for event sourcing.

## Specifications

```
SPEC  VerifyTile · success: every sample lies within the limit
When  ⟦VerifyTile⟧  samples: Mars off by 0.002 km, Venus off by 0.5 km  limit=1 km
Then  ⟪TileVerified⟫  maxErrorKm=0.5  bodiesChecked=2

SPEC  VerifyTile · boundary: an error exactly at the limit still passes
When  ⟦VerifyTile⟧  samples: Mars off by 1 km  limit=1 km
Then  ⟪TileVerified⟫

SPEC  VerifyTile · failure: one sample beyond the limit rejects the tile
When  ⟦VerifyTile⟧  samples: Mars 0.1 km, Neptune 1.5 km, Venus 1.2 km  limit=1 km
Then  ⟪TileRejected⟫  worstBody=Neptune  errorKm=1.5

SPEC  VerifyTile · failure: a tile checked against nothing proves nothing
When  ⟦VerifyTile⟧  samples: none
Then  ⟪TileRejected⟫

SPEC  PublishTile · success: a verified tile joins the catalog
Given no tiles
When  ⟦PublishTile⟧  planets-2026 sha=aaa
Then  ⟪TilePublished⟫  planets-2026 sha=aaa

SPEC  PublishTile · idempotence: publishing the same bytes twice records nothing
Given ⟪TilePublished⟫  planets-2026 sha=aaa
When  ⟦PublishTile⟧    planets-2026 sha=aaa
Then  no events

SPEC  PublishTile · a rebuild from a newer kernel replaces the entry
Given ⟪TilePublished⟫  planets-2026 sha=aaa
When  ⟦PublishTile⟧    planets-2026 sha=ccc
Then  ⟪TilePublished⟫  planets-2026 sha=ccc   (one tile per year remains)

VIEW  TileCatalog · picks the tile whose dates hold the instant
Given ⟪TilePublished⟫ a covers 0 to 100,  ⟪TilePublished⟫ b covers 100 to 200
Then  at 150 → b;  at 100 → b, the later tile;  at 200 → none

VIEW  PlanetReadings · the table matches Horizons at the printed precision
Given ⟪TilePublished⟫  planets-2026
Then  at 2026-04-06: every planet's distance from the Sun, and Mars's distance from Earth and light time,
      equal the values computed from recorded Horizons vectors
```

These run in `packages/ephemeris/test/verify-publish.test.ts`, `load-tile.test.ts`,
`packages/classroom/test/readings.test.ts` and `apps/web/e2e/where-are-the-planets.spec.ts`.

## Acceptance

- A shared link shows one fixed moment, says so, names its time zone, and offers a way back to the present.
- With no link, the page follows the clock and updates every second.
- A date it cannot read is quoted back with an example. A date outside the catalog names the years it has.
- A damaged tile is refused, and no number reaches the screen.
- If WebGL will not start, the table stays.
- The page passes axe in both color schemes, and the first Tab press reaches a working skip link.
- Zooming in separates the inner planets. On a phone, labels stay inside the view.

## Completeness trace

| On screen | View | Comes from | Origin |
|---|---|---|---|
| Distance from the Sun | ((PlanetReadings)) | Tile coefficients in ⟪TilePublished⟫ | JPL kernel |
| Distance from Earth | ((PlanetReadings)) | Same | JPL kernel |
| Light travel time | ((PlanetReadings)) | Distance from Earth, and the speed of light | Definition |
| The moment shown | Page state | `?at=` in the link, or the clock | Teacher, or the browser |
| Years available | ((TileCatalog)) | `year` in ⟪TilePublished⟫ | Worker |
| Dots on the stage | ((PlanetReadings)) | Same tile, in ecliptic axes | JPL kernel |

## Open questions

- ⚠ What age range and which curriculum goals should the copy serve? Needs a teacher.
- ⚠ Do teachers need to name and save a moment, or is a link enough?
- ⚠ Is turning and zooming enough for a keyboard user on the stage?
- ? Translation: the copy is ready for it, but no language is planned.
