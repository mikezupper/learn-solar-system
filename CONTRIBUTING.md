# Contributing

Thank you for helping. This page explains how to contribute, with or without writing code. Everyone taking part
agrees to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help without writing code

- **Try it with a class.** No teacher has used this yet, so the product's main assumptions are untested. The
  open questions at the end of [each product spec](docs/product-specs/index.md) are the ones we most want
  answered. Tell us through [classroom feedback](https://github.com/mikezupper/learn-solar-system/issues/new?template=classroom_feedback.yml).
- **Check the science.** If you know the field, read [the science section of the README](README.md#the-science)
  and the page's own explanation, and file an
  [accuracy report](https://github.com/mikezupper/learn-solar-system/issues/new?template=accuracy_report.yml)
  for anything wrong or misleading.
- **Improve the words.** Every sentence on the page should make sense to a student with no astronomy background.
- **Report what confuses you**, including in this guide.

## Set up

You need:

| Tool | Version | Needed for |
|---|---|---|
| [Node.js](https://nodejs.org/) | 24 (`.node-version` pins 24.15.0) | Everything |
| [pnpm](https://pnpm.io/) | 10.33.2, which `corepack enable` provides | Everything |
| [Docker](https://docs.docker.com/get-docker/) with Compose | Any recent version | Only `pnpm dev` and `pnpm obs:*` |

```sh
git clone https://github.com/mikezupper/learn-solar-system.git
cd learn-solar-system
corepack enable
pnpm bootstrap                                     # fetches the public skills and installs dependencies
pnpm --filter @solar/web exec playwright install chromium   # the browser the tests use
```

Then choose how to run the page:

```sh
pnpm dev:quick     # the fastest start: real data for 2026 and 2027, with no Docker or downloads
pnpm dev           # the full environment, described below
```

`pnpm dev:quick` prints a local address. It holds two years of data, so open a date inside them, such as
`/?at=2026-08-12T17:46:00Z`. Plain "right now" works only while the present falls in those years.

`pnpm dev` is what most agents and maintainers use. It starts this worktree's own telemetry stack in Docker,
publishes planet data for 2000 through 2050, and serves the page on ports worked out from the folder's path.
Its first run downloads a 33 MB file from JPL and takes a few minutes. `pnpm harness where` prints the ports,
and `pnpm dev:stop` shuts everything down.

### About the skills folder

`skills/` holds the written standards this repository follows, as Git submodules. Three are public, and
`pnpm bootstrap` fetches them. Four are private to the maintainer, and Git skips them, so those folders stay empty
on your machine: `event-modeling-skill`, `designing-data-intensive-applications-skill`,
`test-driven-development-skill` and `sense-of-style-writing-skill`. You do not need them. No test or lint reads
them, and this guide states what they would ask of you.

A maintainer with access fetches them explicitly:

```sh
git submodule update --init --checkout skills/event-modeling-skill \
  skills/designing-data-intensive-applications-skill \
  skills/test-driven-development-skill skills/sense-of-style-writing-skill
```

The submodules are separate repositories, and this project's MIT license does not cover them.

## Make a change

1. **Find or open an issue** for anything larger than a small fix, so that we can agree on the approach first.
2. **Create a branch** from `main`.
3. **Write a failing test first**, and see it fail for the right reason. Then write the code that makes it pass.
4. **Take expected values from outside the code.** Use JPL, a published catalog or a definition. A test that
   pastes the code's own output proves nothing. This is the rule that protects the project's accuracy.
5. **Run `pnpm verify`.** It must pass before you open a pull request, and CI runs it again.
6. **Update what your change makes untrue:** documents, the page's explanation, and `CHANGELOG.md`.
7. **Open a pull request** and fill in the template.

Small pull requests get reviewed sooner. By contributing, you agree that your work is licensed under the
project's [MIT license](LICENSE).

## What the checks enforce

`pnpm verify` runs everything below. Each failure message says how to fix the problem.

| Command | What it checks |
|---|---|
| `pnpm typecheck` | TypeScript, in strict mode, across the workspace |
| `pnpm lint` | ESLint, including Effect's rules: no `throw`, `try`, `async`, `console`, `process.env`, `null` or casts in application code |
| `pnpm lint:layers` | Imports follow `types -> config -> repo -> providers -> service -> runtime -> ui`, and only the stage imports Three.js |
| `pnpm lint:docs` | Links resolve, including in this file, and every document under `docs/` can be reached from `AGENTS.md` |
| `pnpm lint:taste` | Source files stay under 400 lines; views have no `class`, `style`, `div` or `span`; CSS uses logical properties and oklch |
| `pnpm gen-docs --check` | `docs/generated/` matches the code. If it drifts, run `pnpm gen-docs` and commit the result |
| `pnpm quality --check` | Every package has a grade in `docs/QUALITY_SCORE.md` |
| `pnpm coverage` | Unit tests pass, with at least 85% of lines covered |
| `pnpm test:browser` | Components work in real Chromium |
| `pnpm build`, `pnpm budget` | The page builds, with at most 240 KiB of gzipped JavaScript |
| `pnpm e2e` | The acceptance tests pass against the built page, including accessibility checks with axe in both color schemes |

`pnpm verify:full` also runs the tests against the real JPL kernel and the telemetry stack. CI runs those as
separate jobs, so you need not run them yourself unless your change touches the worker or telemetry.

## Conventions

- **Layers.** Code imports only from earlier layers. [ARCHITECTURE.md](ARCHITECTURE.md) explains them.
- **Effect.** Parse outside data once, at the boundary, with `Schema`. Errors are typed values. Effects run only
  in `app-runtime.ts` and each program's `main.ts`.
- **Views.** Components are [Gyral](https://gyral.dev) custom elements: a pure reducer per message, and effects as
  commands. Choose elements for their meaning, and style them by element or attribute.
- **On-screen text.** Sentences a component renders belong in `apps/web/src/ui/copy.ts`. The long explanation is
  plain HTML in `apps/web/index.html`, so that it reads without JavaScript. A number stated there needs a test in
  `apps/web/test/explanation.test.ts`.
- **Writing.** Write for the reader in front of you: a student with no astronomy background on the page, and a
  maintainer new to the repository in the docs. Prefer concrete statements, define a term where it first matters,
  and say what the page does not show. Do not claim a command works unless you have run it.
- **Commit messages.** Use the imperative mood, as in "Draw each planet's path". The first line says what changed,
  and the body says why, if that is not obvious. This project's commits carry no attribution trailers.
- **Decisions.** If a decision matters, record it in the repository, not only in a chat or a pull-request comment.
  Work that spans more than one sitting gets a plan: see [docs/PLANS.md](docs/PLANS.md).
- **Real hostnames.** These go in `.env`, which Git ignores, and never in code, config or commits.

### Contributing with a coding agent

This repository is built to work with agents, and they are welcome. Point yours at [AGENTS.md](AGENTS.md), which
maps everything else. You remain responsible for what you submit, so run the checks and read the diff. An agent
without access to the private skills should follow this guide instead.

## Common tasks

| To | Do this |
|---|---|
| Change on-screen wording | Edit `apps/web/src/ui/copy.ts` or `apps/web/index.html`, then update any test that pins the sentence |
| Add a metric | Add it to `packages/providers/src/instruments.ts`, then run `pnpm gen-docs` |
| Add a package | Give it a row in `docs/QUALITY_SCORE.md` and an edge in `tools/harness/src/rules/layers.ts` |
| Publish other years | `TILE_YEARS=2051-2060 pnpm tiles:build`. See [the deployment guide](docs/guides/deployment.md) |
| See logs, metrics and traces | With `pnpm dev` running: `pnpm obs:logs '<LogsQL>'`, `pnpm obs:metrics '<PromQL>'`, `pnpm obs:traces solar-web` |

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `pnpm test:browser` or `pnpm e2e` says a browser is missing | Run `pnpm --filter @solar/web exec playwright install chromium`. On Linux, add `--with-deps` if it complains about system libraries |
| `pnpm e2e` fails because `dist` is missing | It tests the built page, so run `pnpm build` first |
| `pnpm install` refuses your Node version | The repository requires Node 24. Check `node --version` |
| Vite says "Blocked request. This host is not allowed" | Copy `.env.example` to `.env` and list the name in `ALLOWED_HOSTS` |
| The page says it can check its data only on a secure page | Browsers offer SHA-256 only on `https` and `localhost`, so reach the page through one of those |
| "right now" shows no planets under `pnpm dev:quick` | The present falls outside its 2026 and 2027 data. Open a link with `?at=`, or use `pnpm dev` |
| `pnpm dev` stops with a Docker error | Start Docker, or use `pnpm dev:quick`, which does not need it |
| `pnpm tiles:build` stops at Horizons | Horizons is a shared public service, and an unverified tile is never published. Try again later |
| A folder under `skills/` is empty | That skill is private, and you do not need it. See [About the skills folder](#about-the-skills-folder) |
