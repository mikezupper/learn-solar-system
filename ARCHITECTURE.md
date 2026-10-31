# Architecture

This document maps the code. [docs/generated/workspace.md](docs/generated/workspace.md) lists what
exists today; [docs/design-docs/index.md](docs/design-docs/index.md) explains why it has this shape.

## Bird's-eye view

Planet positions are not a live feed. JPL publishes them as a fixed model, a set of Chebyshev
polynomials, so nothing new appears by polling for them. The system therefore has two halves that
never run at the same time:

```
JPL kernel (hash-pinned in data/kernels.lock.json)
   │
   ▼
apps/worker        compiles one year, checks it against JPL Horizons, publishes it
   │
   ▼
Tile store         catalog.json plus immutable blobs named after their hash
   │
   ▼
apps/web           fetches the tile for a moment, checks its hash, evaluates it at 60 fps
```

The page ships the polynomials themselves, not sampled positions. That is what lets it answer any
moment, at any frame rate, with no server running behind it.

## Code map

**`packages/ephemeris`**: the domain of tiles and positions. It reads SPK kernels, compiles tiles,
evaluates them, and decides what may be published. It runs on Node and in browsers.
`service/chebyshev.ts` is the hot path. `service/decisions.ts` holds the publish rules as pure functions.

**`packages/classroom`**: what a learner sees. Turns a tile into distances, light travel times and orbit
lines, moves the moment through time, and holds the framing and label math for the stage.

**`packages/providers`**: the one door for cross-cutting concerns. `Instruments` names every metric,
and `telemetryLayer` is the only place telemetry leaves a process.

**`apps/worker`**: the Node entry point, with adapters for the kernel cache and the tile directory.

**`apps/web`**: the Vite app. `ui/classroom.ts` is the Gyral component, `ui/classroom-state.ts` its state, `ui/classroom-model.ts`
its pure reducers and `ui/classroom-view.ts` its templates. `ui/stage.ts` is the custom element, with `ui/stage-scene.ts` the
Three.js scene, `ui/stage-rig.ts` the camera, `ui/stage-painter.ts` each frame, and `ui/stage-overlay.ts` the 2D canvas above it.
`ui/moment-clock.ts` runs the date between ticks. `public/fonts/` holds the self-hosted typefaces and their licenses.
`ui/copy.ts` holds every sentence a component renders, and `runtime/app-runtime.ts` the single place Effects
run in the browser. `index.html` holds the page's long explanation as static markup, so that it reads with no
script and when the data fails to load. `about-the-data.html` is a plain document with no CSS or script, on purpose.

**`tools/harness`**: the custom lints, generated docs, per-worktree boot and telemetry queries. Its
rules live in `src/rules/` as pure functions.

**`observability/`**: the per-worktree telemetry stack. See
[the design note](docs/design-docs/observability.md).

**`fixtures/`**: real data, used as expected values. `tiles/` is genuine worker output, and `horizons/`
holds answers recorded from JPL.

**`skills/`**: pinned submodules with the standards this repository follows, plus two skills of its own. Four
are private, so Git skips them unless asked. No gate reads any of them.

## Layers

Every package divides into a fixed set of layers, and code imports only earlier ones:

```
types -> config -> repo -> providers -> service -> runtime -> ui
```

| Layer | Holds | May not |
|---|---|---|
| `types` | Schemas, brands, tagged unions, errors | Do anything |
| `config` | Settings read at the edge | Touch the network or disk |
| `repo` | Ports, and adapters to the outside world | Contain business rules |
| `providers` | Cross-cutting concerns | Know about any domain |
| `service` | Workflows and pure logic | Name a concrete adapter |
| `runtime` | Wiring, and the one place Effects run | Contain logic |
| `ui` | Gyral components and the WebGL stage | Fetch or compute positions itself |

Packages depend inward: `web -> classroom -> ephemeris -> providers`, and `worker -> ephemeris`. The
layer lint enforces all of this, and its table of allowed edges is in
`tools/harness/src/rules/layers.ts`.

## Invariants

These hold everywhere, so check them before changing anything nearby.

- **A rejected tile is never published.** `buildYearTile` returns before it touches the store.
- **A tile's bytes are checked before any number is read from them.** `loadTile` compares length and
  SHA-256 with the catalog. A page with bad bytes shows an error, not wrong planets.
- **A published blob never changes.** Its name contains its hash; only `catalog.json` changes.
- **The blob is written before the catalog**, so no reader finds a listing with no file behind it.
- **Time is TDB inside the domain.** UTC becomes TDB in `tdbFromUtcMillis`, and nowhere else.
- **Positions stay 64-bit until the camera is subtracted**, because 32-bit floats resolve only 512 km
  near Neptune. `cameraRelative` is the only way a position reaches the GPU.
- **Reducers and views are pure.** The page's facts, including the clock, arrive as messages.
- **Telemetry goes nowhere unless configured.** With no endpoint, `telemetryLayer` is the empty layer.
- **Real hostnames stay out of git.** The servers read `ALLOWED_HOSTS` from a `.env` that git ignores.
- **Numbers in the page's static text are under test.** No type checks that HTML, so
  `apps/web/test/explanation.test.ts` holds it against JPL's data and Kepler's third law.
- **Only the viewpoint ever moves.** Flights, riding along and the sizes view change the camera or what is drawn at a position,
  never a position. Every view reads the same tracks.
- **A dragged date never shows the wrong sky.** Until its year's tile lands, the picture and table keep their own date, dimmed.
- **Tile requests are plain.** They carry no trace headers, so that a host on another origin need not
  answer a CORS preflight.

## Boundaries

External data is decoded once, with `Schema`, where it enters: `repo/horizons.ts` for Horizons,
`service/load-tile.ts` for the catalog, `service/spk.ts` for kernel bytes, and `ui/classroom.ts` for the
stage's events.

Gyral and Effect meet in one place: see [the bridge note](docs/design-docs/gyral-effect-bridge.md).
