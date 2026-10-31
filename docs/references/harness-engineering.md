# Harness engineering: a summary

This repository's working method comes from one article. This page summarizes it in our own words, because
the article is not ours to republish or license. Read the original for the full argument:

Ryan Lopopolo, ["Harness engineering: leveraging Codex in an agent-first world"](https://openai.com/index/harness-engineering/),
OpenAI, February 11, 2026.

## The argument

A small team at OpenAI built and shipped a product in which coding agents wrote all of the code. The article
reports that the team's early progress was limited less by the agents than by the environment around them, so
the engineers' main job became building that environment: the tools, structure and feedback that let an agent
do reliable work unattended. When an agent failed, they asked which capability was missing and added it to the
repository, instead of asking the agent to try harder.

## The ideas this repository takes from it

| Idea | What it means | Where it lives here |
|---|---|---|
| A map, not a manual | A short entry file points to deeper documents, because an agent's context is limited | [AGENTS.md](../../AGENTS.md) |
| The repository is the system of record | What an agent cannot read does not exist for it, so decisions and plans are checked in | [docs/](../design-docs/core-beliefs.md), [plans](../exec-plans/index.md) |
| Knowledge is checked by machines | Lints confirm that documents are linked, current and correctly shaped | `pnpm lint:docs`, `pnpm lint:freshness` |
| Layers with enforced directions | Each domain has fixed layers, and a custom lint rejects any import that points the wrong way | `pnpm lint:layers`, [ARCHITECTURE.md](../../ARCHITECTURE.md) |
| Parse at the boundary | Outside data is decoded where it enters, and the core sees only valid values | `Schema`, in `repo/` and `service/` |
| Lint messages that teach | A failure says how to fix itself, because the reader is usually an agent | `tools/harness/src/rules/` |
| The app is legible to agents | Each worktree boots its own copy, and an agent can drive it and query its telemetry | `pnpm dev`, [the design note](../design-docs/observability.md) |
| Paying debt continuously | Small, regular cleanup beats a large one later, since agents copy whatever patterns they find | [the debt tracker](../exec-plans/tech-debt-tracker.md), `.github/workflows/gardening.yml` |

## Where this repository differs

The article describes a large product with high pull-request throughput and few blocking gates. This is a small
project, and accuracy is its product, so its gates do block: a pull request must pass `pnpm verify`. It also adds
a rule of its own, that an expected value in a test must come from outside the code. See
[core beliefs](../design-docs/core-beliefs.md).
