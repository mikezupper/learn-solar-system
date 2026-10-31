# Core beliefs

- **Status:** accepted · **Verified:** 2026-10-31

These come from [the harness-engineering article](../references/harness-engineering.md).

**Humans steer; agents execute.** People set direction and judge outcomes. Agents write the code, tests,
docs and tooling. When an agent struggles, the question is what capability is missing, and the answer goes
into the repository.

**What an agent cannot see does not exist.** A decision in chat is lost to the next run. Plans, decisions
and contracts of outside systems are all checked in.

**A map, not a manual.** `AGENTS.md` stays short and points elsewhere, because context is scarce and a giant
instruction file crowds out the task.

**Enforce invariants, not implementations.** Rules that matter are mechanical, and their messages say how
to fix the violation. Within those boundaries, code is free to take any shape.

**Boring and internal beat clever and opaque.** Prefer what an agent can read and test in-repo. The SPK
reader is a small file here and not a dependency, for this reason.

**Pay debt continuously.** Agents copy the patterns they find, including bad ones, so small and frequent
cleanup beats a large one later.

**This project adds one of its own: accuracy comes from outside.** An expected value is taken from JPL, a
published catalog or a definition, and never from running the code and pasting the result.
