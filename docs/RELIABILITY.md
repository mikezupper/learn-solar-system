# Reliability

- **Status:** accepted · **Verified:** 2026-10-31

## Budgets

| What | Budget | Measured | Enforced by |
|---|---|---|---|
| Tile error against live Horizons | 1 km | 2.5 m | `verifyTile`, at publish |
| Tile error against recorded Horizons | 5 m | under 3 m | `golden.test.ts` |
| Eclipse time and gamma | 1 s, 0.0002 | within both | `golden.test.ts` |
| Page JavaScript, gzipped | 240 KiB | 209 KiB | `pnpm budget` |
| One year of planets | none yet | 104,400 bytes | |

## Failure modes

| Failure | What happens | Where |
|---|---|---|
| A downloaded kernel differs from its pin | The worker stops and keeps nothing; a cached copy that went bad is replaced | `kernel-file.ts` |
| A tile disagrees with Horizons | `TileRejectedError`; the store is untouched | `build-tile.ts` |
| Horizons is unreachable | Retries, then stops. An unverified tile is not published | `horizons.ts` |
| The worker crashes between blob and catalog | An unlisted blob remains, which a rerun reuses | `build-tile.ts` |
| The catalog cannot be fetched or is a newer format | The page says the data could not be loaded | `load-sky.ts` |
| A tile arrives damaged | The page refuses it and shows no numbers | `load-tile.ts` |
| SHA-256 is unavailable (plain http) | Treated as damage: unverifiable bytes are not shown | `digest.ts` |
| WebGL will not start | The stage reports it; the table remains | `stage.ts` |
| A date outside the catalog | The page names the years it has | `load-sky.ts` |
| The year rolls over while open | The page fetches the next tile | `classroom.ts` |

## Limits

One worker writes at a time: the catalog has no compare-and-swap. Serving the catalog from a CDN needs a
short cache lifetime for `catalog.json` and an immutable one for blobs, which the dev server already mimics.

## What to measure

[docs/generated/instruments.md](generated/instruments.md) lists every metric. `frame_ms` records the
slowest draw in each window of 30 draws. Read [the telemetry skill](../skills/read-telemetry/SKILL.md).
