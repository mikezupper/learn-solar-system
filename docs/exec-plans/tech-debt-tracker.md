# Technical debt

Each entry says what triggers paying it down.

| Debt | Why it matters | Pay it when |
|---|---|---|
| CI has never run. `.github/workflows/` was written without a remote. | The workflows are unproven, and the same gates run only locally | The repository gets a remote |
| No deployment or tile bucket. `tileStoreFile` writes to a local directory. | The page has no public home | The first teacher is due to try it |
| The stage has no keyboard camera controls. | Keyboard users cannot turn or zoom; the table does carry every number | Before any classroom pilot |
| Mars through Neptune use barycenters. | Off by a few hundred kilometers from the planet's center; needed for close views | Moon kernels land |
| No moons, orbit lines, spin, textures or time controls. | The product's main promises beyond positions | Next product slices |
| Leap seconds are a table in the code. | A new leap second would need a release; none has been added since 2017 | IERS announces one |
| One worker at a time. `TileStore` has no compare-and-swap. | Two writers could lose a catalog update | Builds run from more than one place |
| No strict CSP. | Not needed by a static page today, but a cheap defense | Before public deployment |
| No mutation testing in CI. Six deliberate breaks were done by hand. | Late tests may be weaker than they look | The domain next grows |
| The gardening workflow reports staleness but opens no fix-up pull requests. | The article's doc-gardening agent is not built | CI is running |
| No video or screenshot evidence loop for pull requests. | The article's agents record their fixes | Agents start working unattended |
