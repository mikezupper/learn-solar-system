# Quality score

- **Status:** accepted · **Verified:** 2026-10-31

Coverage is lines and branches from `pnpm coverage`. Grades are judgment; the gaps column is the point.

| Part | Grade | Coverage | Known gaps |
|---|---|---|---|
| `packages/ephemeris` | A | 99% / 90% | Handles one segment per body, per kernel. Satellite kernels past Mars are not yet tried |
| `packages/classroom` | A | 100% / 96% | No readings for moons |
| `packages/providers` | B | 80% / none | The live OTLP path is proven only by `pnpm obs:check` |
| `apps/worker` | B+ | 98% / 100% | The kernel test needs a 33 MB download, so it runs only in `verify:full` |
| `apps/web` | B | 86% / 74% | `stage.ts`, `stage-scene.ts` and the runtime are excluded from unit coverage and covered only by e2e. No keyboard camera |
| `tools/harness` | B+ | 99% / 89% | `commands/` is excluded and exercised by running it. CI is unproven |
| Docs | B | | Written with the scaffold, so they have not yet caught drift in practice |

## How the accuracy claim is backed

| Claim | Evidence | Runs in |
|---|---|---|
| A tile agrees with Horizons within 5 m | `packages/ephemeris/test/golden.test.ts` | `pnpm test` |
| A published tile is within 1 km of live Horizons | `verifyTile`; measured 4.7 m for 2000 through 2050 | `pnpm tiles:build` |
| A planet stays on its line | `packages/classroom/test/orbit.test.ts`; `apps/worker/test/orbit-fidelity.kernel.test.ts` for a full orbit | `pnpm test`, `pnpm test:kernel` |
| It reproduces a real eclipse | Same test file, against Espenak's published values | `pnpm test` |
| The page shows those numbers | `apps/web/e2e/where-are-the-planets.spec.ts` | `pnpm e2e` |
| The worker is deterministic | `apps/worker/test/pipeline.kernel.test.ts` | `pnpm test:kernel` |
