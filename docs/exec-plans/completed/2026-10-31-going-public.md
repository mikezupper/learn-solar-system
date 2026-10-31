# Going public

## Goal

Publish the repository as an open-source project under the MIT license, with a README, guides for contributors, a
main page that explains itself, and CI proven on GitHub. The project owner asked for all of this. Done means a
stranger can clone it, follow the guide and get a green `pnpm verify`.

## Progress

- [x] Remove third-party text and stray test output from history
- [x] Let people without access to the private skills clone and bootstrap
- [x] Move the date-dependent check out of pull requests
- [x] Explain the page on the page, with its numbers under test
- [x] Fix the tile requests that a separate host would refuse
- [x] License, README, guides, templates, citation
- [x] CI proven on GitHub
- [x] A stranger's clone verified: no SSH key or GitHub credentials, through `pnpm bootstrap`, `pnpm verify` and one published year

## Decision log

**2026-10-31. History was rewritten before the first push.** `docs/references/harness-engineering.md` was a verbatim
copy of OpenAI's article, which an MIT repository cannot license, and ten failure screenshots had been committed by
accident. Removing them only from the latest commit would still publish them, and nothing had been pushed, so
rewriting cost nothing outside this machine. The file is now a summary in our own words with a link to the source.
All commit messages, authors and dates were kept; hashes from `b911602` onward changed.

**2026-10-31. The private skills stay private, and Git skips them.** Four of the seven skills are private. Making them
public is the owner's decision about other repositories, so it was not done here.
Instead `.gitmodules` marks those four `update = none`, and the three public ones use `https`, so `git clone
--recurse-submodules` and `pnpm bootstrap` both work for a stranger, with no failure or password prompt. No gate reads
the skills. A maintainer fetches them with `git submodule update --init --checkout`. The cost is that a public
`AGENTS.md` links to files an outsider cannot read, so `AGENTS.md` and `CONTRIBUTING.md` say so.

**2026-10-31. Document freshness runs on a schedule, not on pull requests.** A 30-day limit in `pnpm verify` would have
started failing every contributor's pull request about a month after publishing, through no fault of theirs. The
check moved to `pnpm lint:freshness`, run weekly by the Gardening workflow and by `pnpm verify:full`. The rule itself
is unchanged. Only who gets told, and when, has changed.

**2026-10-31. The page's explanation is static HTML.** It must read with JavaScript off and when the data fails to load,
which a Gyral component cannot do. So it does not live in `copy.ts`, and because no type checks its numbers,
`apps/web/test/explanation.test.ts` holds them against JPL's data and Kepler's third law. See
[the spec](../../product-specs/explain-the-page.md).

**2026-10-31. Tile requests carry no trace headers.** Rehearsing the deployment guide showed that the page could never
load tiles from another origin: Effect's HTTP client adds `traceparent` and `b3`, which trigger a preflight that an
ordinary static host refuses. No test had tried a second origin. Tile requests now set
`TracerPropagationEnabled` to false, and the client span is still recorded.

**2026-10-31. Kernel downloads no longer share a partial file.** The first CI run started with an empty cache, and
two kernel test files downloaded at once. Both wrote `de440s.bsp.partial`, and the second rename found its file gone. A
local cache had hidden this, and two worktrees booting on a fresh machine would have hit it too. Each download now
works in its own directory.

**2026-10-31. `mikezupper/learn-solar-system`.** The address the owner gave spelled the account `mikezuppper`, which does
not exist on GitHub. `mikezupper` is the logged-in account and owns the skill repositories.

**2026-10-31. The contact address is the one on the commits.** The Code of Conduct needs one. Security reports use
GitHub's private reporting, so that no address is needed there.

**2026-10-31. No NASA logo in the badges or anywhere else.** NASA restricts its insignia, and the project is not
affiliated with NASA. The README and the page's footer both say so.

**2026-10-31. Badges read live values where they can.** Version badges read `pnpm-workspace.yaml` and `package.json` from
`main`, so that they cannot go stale. The science badges are static, and restate figures in
[RELIABILITY](../../RELIABILITY.md).

**2026-10-31. No release was cut, and no site deployed.** Neither was asked for. A version number exists only in
`package.json` and `CITATION.cff`.
