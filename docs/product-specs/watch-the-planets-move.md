# Watch the planets move

- **Status:** accepted · **Verified:** 2026-10-31

## Scope and assumptions

A student runs time forward and watches the planets travel along the paths drawn around the Sun, while a
teacher can stop on any date and share it.

Nothing here changes stored state: every slice is a view over tiles already published. The moment on screen,
the speed and the framing are page state, so this adds no events and no commands. Assumed, not yet tested
with teachers: forward-only playback and these four speeds are enough.

## Timeline

1. A student opens the page. It shows the present moment, and the note says the planets look still at real
   speed.
2. The student chooses "Inner planets", then "1 month per second". Earth goes around once every 12 seconds.
3. The date reaches 2027. The next tile has already arrived, so nothing pauses.
4. The student chooses "Stopped" on 2027-05-02. A link to that moment appears, to share with the class.
5. Later, the student runs time to the end of 2050. Time stops, and the page says why.

## Slice backlog

| # | Slice | Pattern | Consumes | Shows | Code |
|---|---|---|---|---|---|
| S05 | See each planet's path | View | The tile on screen | ((OrbitLines)) | `orbit.ts`, `stage.ts` |
| S06 | Run time at a chosen speed | View | ((TileCatalog)), each year's tile | ((PlanetReadings)) over time | `moment.ts`, `classroom-model.ts` |
| S07 | Frame the inner planets | View | The tile on screen | The same positions, closer | `stage.ts` |

## Specifications

```
VIEW  OrbitLines · a planet's path has the size and shape NASA publishes
Given ⟪TilePublished⟫  planets-2026
Then  at 2026-01-15, Mars's line has a semi-major axis near 1.524 AU and eccentricity near 0.0934

VIEW  OrbitLines · a planet stays on its line
Given ⟪TilePublished⟫  planets-2026
Then  across 2026, each planet's position stays within one pixel of the line drawn for January 15

VIEW  PlanetReadings · time runs at the chosen speed
Given the page shows 2026-03-01, running at 1 day per second
Then  two real seconds later it shows 2026-03-03

VIEW  PlanetReadings · crossing a year does not stall when the next tile has arrived
Given ⟪TilePublished⟫ planets-2026, ⟪TilePublished⟫ planets-2027
Then  a run starting 2026-12-20 reaches 2027 with the stage still showing

VIEW  PlanetReadings · time stops at the end of the data, and says why
Given ⟪TilePublished⟫ planets-2027 is the last tile
Then  a run starting 2027-12-20 stops in 2027, with "Stopped" selected and a note naming the last year
```

These run in `packages/classroom/test/orbit.test.ts`, `moment.test.ts`, `apps/web/test/time-travel.test.ts` and
`apps/web/e2e/where-are-the-planets.spec.ts`.

## Acceptance

- Every planet has a visible line, and sits on it at any moment.
- The page does not start moving by itself, and it explains why it looks still.
- Choosing a speed runs time from the moment on screen, and the table follows the picture.
- Stopping holds the moment and offers a link to it. "Right now" returns to the present without a reload.
- The controls work from the keyboard, and are named by their legends.
- The inner view names all four inner planets where there is room, and the giants leave the frame.

## Open questions

- ⚠ Should the page start moving by itself? It does not, so that "right now" stays true on arrival and motion
  stays the learner's choice. A teacher's view on this would settle it.
- ⚠ Do teachers want to run time backward, or jump to a date with a control?
- ? Are 2000 through 2050 the right years for a classroom?
