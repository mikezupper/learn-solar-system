# Technical debt

Each entry says what triggers paying it down.

| Debt | Why it matters | Pay it when |
|---|---|---|
| No public deployment. The production image exists, but nothing runs it yet. | The page has no public home | The first teacher is due to try it |
| Mars through Neptune use barycenters. | Off by a few hundred kilometers from the planet's center; needed for close views | Moon kernels land |
| No moons, spin or textures. | The product's main promises beyond positions | Next product slices |
| Time runs forward only, though the timeline can drag back to any date. | Nobody can watch a planet retrace its path | A teacher asks |
| The stars are random decoration. | A real catalog would be more honest, and could be a static data file that costs no JavaScript budget | The next visual pass |
| The dark page is untested on a projector in a lit room. | It could wash out, and classrooms are the main audience | Before any classroom pilot |
| The page is tested in Chromium, and at phone sizes in WebKit, but not in Firefox or on a real phone or school laptop. | WebKit on Linux is not Safari on iOS, and trails are smooth only at a good frame rate | Before public deployment |
| Data covers 2000 to 2050, so Uranus and Neptune cannot finish an orbit. | About 31 MB and 2,700 Horizons requests would cover all of DE440s; verification needs batching first | Someone wants a full Neptune orbit |
| Each worktree publishes its own tiles, about two minutes on first run. | Tiles are immutable and could be shared across worktrees, as kernels are | Worktrees become routine |
| Leap seconds are a table in the code. | A new leap second would need a release; none has been added since 2017 | IERS announces one |
| One worker at a time. `TileStore` has no compare-and-swap. | Two writers could lose a catalog update | Builds run from more than one place |
| No mutation testing in CI. Six deliberate breaks were done by hand. | Late tests may be weaker than they look | The domain next grows |
| The gardening workflow reports staleness but opens no fix-up pull requests. | The article's doc-gardening agent is not built, so someone must read the weekly report | Stale documents start slipping past the report |
| Four of the seven skills are private. | `AGENTS.md` names standards an outside contributor or agent cannot read; `CONTRIBUTING.md` carries what they ask | The owner decides whether to publish them |
| The site must sit at the root of a domain. Links start from `/`. | Rules out a plain project site such as `example.github.io/learn-solar-system/` | Someone wants to host it there |
| Each image build on a new machine, or after its cache is pruned, rebuilds all the data and asks Horizons 459 questions. | The owner chose to build data inside the image. CI uses the fixtures, so only real builds call JPL | Images are built from more than one machine |
| Two releases cannot run side by side behind one load balancer. Each image holds only its own files. | A page from one release could ask the other for a script it lacks | The site runs more than one container |
| No video or screenshot evidence loop for pull requests. | The article's agents record their fixes | Agents start working unattended |
