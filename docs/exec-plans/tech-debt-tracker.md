# Technical debt

Each entry says what triggers paying it down.

| Debt | Why it matters | Pay it when |
|---|---|---|
| No deployment or tile bucket. `tileStoreFile` writes to a local directory. | The page has no public home | The first teacher is due to try it |
| The stage has no keyboard camera controls. | Keyboard users cannot turn or zoom; the table does carry every number | Before any classroom pilot |
| Mars through Neptune use barycenters. | Off by a few hundred kilometers from the planet's center; needed for close views | Moon kernels land |
| No moons, spin or textures. | The product's main promises beyond positions | Next product slices |
| Time runs forward only, with no way to scrub to a date. | A teacher reaches a date by pasting a link | A teacher asks, or the next slice touches the controls |
| Data covers 2000 to 2050, so Uranus and Neptune cannot finish an orbit. | About 31 MB and 2,700 Horizons requests would cover all of DE440s; verification needs batching first | Someone wants a full Neptune orbit |
| Each worktree publishes its own tiles, about two minutes on first run. | Tiles are immutable and could be shared across worktrees, as kernels are | Worktrees become routine |
| Leap seconds are a table in the code. | A new leap second would need a release; none has been added since 2017 | IERS announces one |
| One worker at a time. `TileStore` has no compare-and-swap. | Two writers could lose a catalog update | Builds run from more than one place |
| No strict CSP. | Not needed by a static page today, but a cheap defense | Before public deployment |
| No mutation testing in CI. Six deliberate breaks were done by hand. | Late tests may be weaker than they look | The domain next grows |
| The gardening workflow reports staleness but opens no fix-up pull requests. | The article's doc-gardening agent is not built, so someone must read the weekly report | Stale documents start slipping past the report |
| Four of the seven skills are private. | `AGENTS.md` names standards an outside contributor or agent cannot read; `CONTRIBUTING.md` carries what they ask | The owner decides whether to publish them |
| The site must sit at the root of a domain. Links start from `/`. | Rules out a plain project site such as `example.github.io/learn-solar-system/` | Someone wants to host it there |
| No video or screenshot evidence loop for pull requests. | The article's agents record their fixes | Agents start working unattended |
