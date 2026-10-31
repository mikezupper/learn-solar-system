# Where Gyral and Effect meet

- **Status:** accepted · **Verified:** 2026-10-31

Both libraries want to own effects. Gyral makes them data that drivers perform; Effect wants one runtime
and no bare promises. Each keeps its rules because they own different ground.

| Concern | Owner |
|---|---|
| UI state, intents, reducers, views | Gyral |
| Timers for the view (`every`) | Gyral |
| Domain logic, schemas, typed errors | Effect, with no Gyral import |
| Fetching, hashing, telemetry | Effect |
| Where they meet | One driver per Effect workflow |

```
ui/classroom.ts   a reducer returns a command naming a token from runtime/tokens.ts
runtime/tokens.ts a token: types and a name, with no implementation
runtime/app-runtime.ts   skyLoader.provide(input => runtime.runPromise(loadSky(input.moment)))
service/load-sky.ts      an Effect that never fails: every outcome is a SkyLoad value
```

**A workflow that crosses the bridge never fails.** `loadSky` turns each typed error into a `SkyLoad` value
with `Effect.catchTags`, so the reducer handles every outcome by exhaustive match. Defects still reject
the promise, and `onFailure` in the command reports them as an unavailable catalog.

**One `ManagedRuntime` per page**, in `app-runtime.ts`, the only file in the browser that runs an Effect.
Tests never load it: they provide fake drivers under the same token names.

**The 60 fps path crosses neither library.** `sky-stage` is a plain custom element running its own
animation frame, so a frame costs no message and no render. It draws only when something changed, and
hands back a timing report every 30 draws.

Rejected: Gyral's `@gyral/http`, which would have put a second HTTP stack and error model beside Effect's.
