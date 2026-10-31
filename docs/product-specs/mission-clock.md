# Mission Clock

- **Status:** accepted · **Verified:** 2026-10-31

## Scope and assumptions

The owner found the page bland, and asked for something flashier and more "space" that would entice young people, with a
redesign of the two control groups. They approved a mock, and added two features: a camera that rides along with a planet,
and a clearly labeled view with enlarged planets.

Nothing here changes stored state. Every slice is a view over tiles already published, and the moment, speed, framing,
rider and sizes are page state, so this adds no events. Assumed, not yet tested with any young person or teacher: that
this look does entice them, and that it still works on a classroom projector.

## Slices

| # | Slice | Pattern | Shows | Code |
|---|---|---|---|---|
| S09 | Open with a show | View | This year so far, then today | `moment.ts`, `classroom-model.ts` |
| S10 | Time as a media player | View | Play and stop, Right now, a speed ramp | `classroom-model.ts`, `classroom-view.ts`, `moment-clock.ts` |
| S11 | Drag along a timeline | View | Any date in the catalog, across years | `classroom-model.ts`, `load-sky.ts` |
| S12 | Fly between views | View | The same positions from another camera | `stage-rig.ts` |
| S13 | Ride along with a planet | View | The same positions, with that planet held still | `stage-rig.ts`, `framing.ts` |
| S14 | Compare planet sizes | View | Enlarged bodies, labeled | `framing.ts`, `stage-scene.ts`, `stage-painter.ts` |
| S15 | Follow a planet's light | View | The straight path to Earth, and its travel time | `stage-painter.ts`, `classroom-view.ts` |
| S16 | Try it from the explanation | View | The view a sentence describes | `try-request.ts`, `try-requests.ts` |

## Specifications

```
VIEW  Cold open · replays this year, then follows the clock
Given a page opened with no link, on a machine that allows motion
Then  the date runs from January 1 to now in about three seconds, and the camera pulls back from the inner planets

VIEW  Cold open · never moves a link, and stays still for anyone who asked for less motion

VIEW  Timeline · never guesses
Given ⟪TilePublished⟫ planets-2026, on screen
When  the learner drags to a date in 2027
Then  the clock shows that date, the status says its data is on the way, and the picture and table dim and keep their numbers
And   once the tile lands, the picture and table show 2027

VIEW  Ride along · only the viewpoint moves
Given the view rides with Mars
Then  Mars stays in place on screen while time runs, the Sun moves, and every number in the table is unchanged

VIEW  Sizes · labeled, and off by default
When  the learner turns sizes on
Then  a badge states the planets' factor and the Sun's, and says that distances are still true
And   the factors change with the zoom, so that the badge stays true
```

These run in `apps/web/test/mission-controls.test.ts`, `packages/classroom/test/moment.test.ts`,
`packages/classroom/test/framing.test.ts` and `apps/web/e2e/mission-controls.spec.ts`.

## Acceptance

- The page passes axe with time running, riding along, and sizes showing.
- A plain wheel and a vertical swipe scroll the page, so that a full-screen stage traps no one.
- The picture can be turned and zoomed from the keyboard.
- The page does not scroll sideways at 320, 390, 820 or 1024 pixels wide, and the controls stay reachable.
- The page calls no other site, including for its fonts.
- JavaScript stays under the 240 KiB budget.

## Facts this adds to the page

| Claim | Source | Held by |
|---|---|---|
| Planet diameters | NASA's planetary fact sheet | `framing.test.ts` |
| The Sun's diameter, 1,391,400 km | Twice the volumetric mean radius on NASA's Sun fact sheet | The `SUN_DIAMETER_KM` constant |
| Earth's mean speed, 29.78 km/s, for the odometer | NASA's Earth fact sheet | `mission-controls.test.ts` |
| Saturn's pole, RA 40.589°, Dec 83.537° | NASA's Saturn fact sheet | Read from the sheet |
| Saturn's rings, 74,658 to 136,780 km | NASA's Saturnian rings fact sheet | Read from the sheet |
| About 107 Suns fit between the Sun and Earth | The two figures above | `explanation.test.ts` |

## Open questions

- ⚠ Does this look entice the young people it is for? Nobody in that audience has seen it.
- ⚠ Is a dark page readable on a projector in a lit classroom?
- ⚠ Should the page ship a real star catalog instead of decorative stars?
