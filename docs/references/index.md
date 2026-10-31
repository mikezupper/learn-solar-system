# References

The exact contracts of outside systems, kept here so that an agent need not leave the repository.

- [A summary of the harness-engineering article](harness-engineering.md): the approach this repository follows, in
  our words, with a link to the original.
- [NAIF SPK file layout](naif-spk.md): what `service/spk.ts` reads.
- [JPL Horizons API](horizons-api.md): the request the verifier sends, and how to read the answer.
- [Gyral agent pack](gyral-llms.txt): the rules, one full component and an import map, from
  `https://gyral.dev/llms-small.txt`.
- **Effect:** the installed package ships its own guidance, which matches the pinned version exactly. Read
  `node_modules/effect/CLAUDE.md` and `node_modules/effect/ai-docs/` from any package that depends on it.
