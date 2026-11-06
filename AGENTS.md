# AGENTS.md: the map

You are working in **solar-system**: a page that shows teachers and students where the planets really
are, calculated from NASA JPL's data. This file is a table of contents. Read what the task needs.

## Start here

1. `pnpm bootstrap` once per worktree: fetches the public skills and installs dependencies.
2. Read the plan for your work in [docs/exec-plans/active/](docs/exec-plans/index.md). Work that spans
   more than one sitting gets a plan first. See [docs/PLANS.md](docs/PLANS.md).
3. `pnpm dev` boots this worktree on its own ports; `pnpm harness where` prints them; `pnpm dev:stop`
   tears it all down.

## Where truth lives

| Question | Read |
|---|---|
| Who this is for, and what good looks like | [docs/PRODUCT_SENSE.md](docs/PRODUCT_SENSE.md) |
| What the product does, slice by slice | [docs/product-specs/index.md](docs/product-specs/index.md) |
| How the code is organized | [ARCHITECTURE.md](ARCHITECTURE.md) |
| The principles, and which tool enforces each | [docs/design-docs/golden-principles.md](docs/design-docs/golden-principles.md) |
| Design decisions and their reasons | [docs/design-docs/index.md](docs/design-docs/index.md) |
| Visual design, and writing for learners | [docs/DESIGN.md](docs/DESIGN.md), [docs/FRONTEND.md](docs/FRONTEND.md) |
| Budgets, failure modes, what to measure | [docs/RELIABILITY.md](docs/RELIABILITY.md) |
| Threat model | [docs/SECURITY.md](docs/SECURITY.md) |
| How good each part is right now | [docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md) |
| Known debt | [docs/exec-plans/tech-debt-tracker.md](docs/exec-plans/tech-debt-tracker.md) |
| Outside systems' exact contracts | [docs/references/index.md](docs/references/index.md) |
| Facts derived from the code | [docs/generated/index.md](docs/generated/index.md) |
| Deploying, teaching with it, contributing | [docs/guides/index.md](docs/guides/index.md), [CONTRIBUTING.md](CONTRIBUTING.md) |

## Skills: read the one for your task before you start

Four skills are private to the maintainer, so their folders may be empty. No gate reads them. If one is
empty, follow [CONTRIBUTING.md](CONTRIBUTING.md), which states what they ask.

| Task | Skill |
|---|---|
| Any TypeScript | [skills/effect-fp-skill/SKILL.md](skills/effect-fp-skill/SKILL.md); walk its `references/code-review.md` before you finish |
| New behavior or a bug fix | [skills/test-driven-development-skill/SKILL.md](skills/test-driven-development-skill/SKILL.md) |
| A new workflow or slice | [skills/event-modeling-skill/SKILL.md](skills/event-modeling-skill/SKILL.md) |
| Stored or derived data | [skills/designing-data-intensive-applications-skill/SKILL.md](skills/designing-data-intensive-applications-skill/SKILL.md) |
| A component | The Gyral MCP server in `.mcp.json`: call `start_here` once. [docs/references/gyral-llms.txt](docs/references/gyral-llms.txt) works offline |
| Markup | [skills/semantic-html-skill/skills.md](skills/semantic-html-skill/skills.md) |
| Styles | [skills/modern-css-skill/SKILL.md](skills/modern-css-skill/SKILL.md) |
| Any prose: docs, comments, on-screen text | [skills/sense-of-style-writing-skill/SKILL.md](skills/sense-of-style-writing-skill/SKILL.md); the brief is in [docs/FRONTEND.md](docs/FRONTEND.md) |
| Seeing your change in a browser | [skills/drive-the-app/SKILL.md](skills/drive-the-app/SKILL.md) |
| Reading logs, metrics and traces | [skills/read-telemetry/SKILL.md](skills/read-telemetry/SKILL.md) |

## Rules that fail the build

- **Layers** (`pnpm lint:layers`): `types -> config -> repo -> providers -> service -> runtime -> ui`.
  Code imports only earlier layers. Only the stage imports Three.js.
- **Effect's hard rules** (`pnpm lint`): no `throw`, `try`, `async`, `console`, `process.env`, `null` or
  casts in application code. Effects run only in `app-runtime.ts` and each program's `main.ts`.
- **Taste** (`pnpm lint:taste`): files stay under 400 lines; views have no `class`, `style`, `div` or
  `span`; CSS uses logical properties and oklch.
- **Docs** (`pnpm lint:docs`, `pnpm quality --check`): every document is reachable from here, and links
  resolve, including in the README and guides at the root. `pnpm lint:freshness` reports design documents
  nobody has verified in 30 days; it runs weekly and in `verify:full`, never in a pull request.
- **Coverage** (`pnpm coverage`): at least 85% of lines.
- **Generated docs** (`pnpm gen-docs --check`): never edit `docs/generated/` by hand.

Each lint message says how to fix what it found. If a rule blocks you, do not work around it: fix the
design, or change the rule and its reason together.

## How to work

- Parse at the boundary, once. Errors are typed values. Time arrives as an input.
- Write the failing test first, and see it fail for the right reason. Take expected values from outside
  the code: JPL, published catalogs, definitions.
- Record decisions in the plan's decision log, not in chat. If it is not in this repository, the next
  agent cannot see it.
- When something fails, ask what capability is missing, then add it to the repository.
- Commit messages are imperative, with no attribution trailers.
- Real hostnames and other local settings go in `.env`, which git ignores. See `.env.example`.

## Commands

```sh
pnpm verify              # everything that needs neither Docker nor the 33 MB kernel
pnpm verify:full         # also the real kernel and the telemetry stack
pnpm dev:quick           # the page on the 2026-2027 fixtures: no Docker, no downloads
pnpm test                # unit tests: no network, no browser
pnpm test:browser        # Gyral elements in Chromium
pnpm e2e                 # needs `pnpm build` first; Chromium, plus WebKit at phone sizes
pnpm tiles:build         # compile, check against Horizons, publish missing years (TILE_YEARS, TILE_STORE_DIR)
deploy/build-image.sh    # the production image: build and check it; --push publishes it. See docs/guides/deployment.md
pnpm obs:logs '<LogsQL>' ; pnpm obs:metrics '<PromQL>' ; pnpm obs:traces solar-web
pnpm gen-docs            # regenerate docs/generated
```
