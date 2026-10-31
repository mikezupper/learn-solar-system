# Tile data

- **Status:** accepted · **Verified:** 2026-10-31

## Summary

JPL's kernels are the system of record, and tiles are data derived from them: deterministic, immutable and
rebuildable. There is no database. A catalog file lists immutable blobs, and the page checks each blob's
hash before reading a number from it.

## Assumptions and load parameters

| Parameter | Value | Source |
|---|---|---|
| Tile size | 104,400 bytes per year | Measured |
| Gzip saving | About 2% | Measured on the prototype; doubles barely compress |
| Writes | A few tiles per kernel release, from one worker | Assumed |
| Reads | One catalog and one tile per page load | By design |
| Freshness | A kernel changes rarely; DE440 dates from 2020 | JPL |

**Scale gate:** the data fits one directory, there is one writer, and it is not user data. So no database,
no broker and no stream processor.

## Data model and storage

`catalog.json` is the only mutable file: `{ formatVersion, tiles: [TileEntry] }`. A blob is a flat array of
little-endian doubles, and each entry's segment table says where each body's records start. Moons will add
new `system` values and new tiles, not larger ones.

## Partitioning

By calendar year, because a learner's moment lands in exactly one year. A page downloads about 100 KB. Moon
tiles should go monthly: Phobos alone is 548 KB a year.

## Invariants and enforcement

| Invariant | Mechanism |
|---|---|
| A published tile agrees with Horizons | `verifyTile` runs before any write; a rejected tile returns early |
| A blob never changes | Its name contains its hash |
| A reader never sees a listing with no file | Blob first, then an atomic rename of the catalog |
| A reader never trusts bad bytes | Length and SHA-256 compared with the entry |
| A stale page never misreads a new format | `formatVersion` is a literal in the Schema, so decoding fails |
| A tile can be rebuilt exactly | Same kernel and dates give the same bytes; the kernel test compares hashes |

## Fault handling

A worker that crashes leaves at most an unlisted blob, and a rerun is idempotent: the same bytes record
nothing. Horizons calls run one at a time, with three retries and exponential backoff. An unreachable
Horizons stops the build, because unverified is not verified.

## Schema evolution

Adding an optional field needs no version change. Change `formatVersion` only when an older reader would
misread a tile; old pages then show an error until reloaded. Keep publishing old blobs, because their names
are immutable and a cached page may still ask for them.

## Tradeoffs and revisit triggers

| Rejected | Why | Reopen when |
|---|---|---|
| Sending positions from a server | 60 fps and time travel cannot wait on a network, and samples need interpolating anyway | Never, for planets |
| `astronomy-engine` in the browser | Up to 335,000 km off at Neptune, and no moons beyond Jupiter's four | A no-backend mode is wanted |
| Calling Horizons at page load | No CORS, no uptime promise, and a shared service | Never; spacecraft go through the worker |
| Compare-and-swap on the catalog | One writer | Builds run from more than one place |
