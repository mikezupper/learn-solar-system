# NAIF SPK file layout

What `packages/ephemeris/src/service/spk.ts` reads. Source: NAIF's DAF and SPK Required Reading.

**Records** are 1024 bytes and numbered from 1. **Word addresses** count doubles from 1, so the byte offset
of a word is `(address - 1) * 8`.

**File record** (record 1):

| Bytes | Field |
|---|---|
| 0-7 | ID word, `DAF/SPK ` |
| 8-11 | ND, doubles per summary: 2 |
| 12-15 | NI, integers per summary: 6 |
| 76-79 | FWARD, first summary record |
| 88-95 | Number format, `LTL-IEEE` |

**Summary record:** three doubles (NEXT, PREV, NSUM), then NSUM summaries of 5 doubles each. NEXT = 0 ends
the chain. Each summary holds: start and end time (2 doubles), then target, center, frame, data type, start
address and end address (6 int32s).

**Type 2 segment:** N records of `[MID, RADIUS, X0..Xn, Y0..Yn, Z0..Zn]`, then a four-double footer:
`[INIT, INTLEN, RSIZE, N]`. **Type 3** adds velocity coefficients after Z, which tiles drop.

**Evaluating:** `record = floor((t - INIT) / INTLEN)`, then `s = 2 * (t - start of record) / INTLEN - 1`,
then the Chebyshev series at `s`. Times are TDB seconds past J2000; positions are km, in the ICRF.

**What DE440s holds:** Mercury and Venus centers, the Earth and Moon relative to their barycenter, and the
Sun. For Mars through Pluto it holds only barycenters: true centers come from moon kernels.

| Kernel | Size | Coverage |
|---|---|---|
| `de440s.bsp` | 33 MB | Pinned in `data/kernels.lock.json` |
| `mar099s.bsp` | 68 MB | 1995 to 2050 |
| `jup365.bsp` | 1.1 GB | 1600 to 2200 |
| `sat441.bsp` | 662 MB | 1749 to 2250 |
| `nep105.bsp` | 210 MB | 1600 to 2400 |

All are at `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/`. `mar099s` was tried in the prototype,
with its Phobos and Deimos within 5 cm of Horizons. The rest are sized from the server and not yet tried.
