# Golden principles

- **Status:** accepted · **Verified:** 2026-10-31

Every rule names its enforcer. "Review" means it is not yet mechanical.

| Rule | Why | Enforcer |
|---|---|---|
| Code imports only earlier layers | Keeps the core free of infrastructure | `pnpm lint:layers` |
| Packages depend inward | Same, across packages | `pnpm lint:layers` |
| Only the stage imports Three.js | Everything else stays testable without a GPU | `pnpm lint:layers` |
| Node APIs stay in the worker and tools | The domain must also run in browsers | `pnpm lint:layers` |
| Telemetry export lives in `providers` | One door out of the process | `pnpm lint:layers` |
| No `throw`, `try` or `async` in application code | Errors are typed values | `pnpm lint` |
| Effects run only at the edge | One runtime per program | `pnpm lint` bans `Effect.run*` everywhere |
| No `null`, no casts | Absence is `Option`; shapes are decoded | `pnpm lint` |
| Time and randomness are inputs | Tests control them; reducers stay pure | `pnpm lint`, plus Gyral |
| No `let` or loops, except listed hot paths | Pure expressions, with reasons where it matters | `pnpm lint` |
| Decode external data once, at the boundary | The core sees only valid values | `pnpm lint`, review |
| Files under 400 lines | They must fit in a context window | `pnpm lint:taste` |
| Views have no `class`, `style`, `div` or `span` | An element is chosen for its meaning | `pnpm lint:taste` |
| CSS is logical and oklch, without `!important` | Right-to-left readers, even color, cascade layers | `pnpm lint:taste` |
| The data page has no CSS or script | It must read correctly on anything | `pnpm lint:taste`, e2e |
| Every document is reachable and links resolve | An unreachable document does not exist | `pnpm lint:docs`, which also reads the README and the guides at the root |
| Design documents are re-verified every 30 days | Stale guidance misleads | `pnpm lint:freshness`, weekly in Gardening. Never in a pull request, because it depends on the date and not on the change |
| `docs/generated` is never hand-edited | It derives from code | `pnpm gen-docs --check` |
| At least 85% of lines are covered | A floor, not a goal | `pnpm coverage` |
| JavaScript stays under 240 KiB gzipped | Classroom laptops and school networks | `pnpm budget` |
| Every page passes axe in both color schemes | Every learner | `pnpm e2e` |
| Flash never costs the truth: decoration says so, and enlarged views label themselves | Accuracy is the product | `pnpm e2e`, `explanation.test.ts`, review |
| The page calls no other site | School networks, and readers' privacy | `pnpm e2e` |
| The planets keep a minimum share of every screen, at the top of the page and while reading | They are the point of the page | `pnpm e2e`, in Chromium and WebKit |
| Numbers in the page's static text are under test | No type checks HTML, and a typo would reach a class | `explanation.test.ts` |
| Expected values come from outside the code | A test that pastes its output proves nothing | Review |
| Each command has a success spec and one failure spec per rule | Rules are not explicit otherwise | Review |
| Lint messages say how to fix the problem | The reader is usually an agent | Review |
