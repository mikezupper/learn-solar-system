# Solar System Classroom

A page that shows teachers and students where the Sun and planets really are, at true scale, calculated
from NASA JPL's planetary data. A tile of a year's positions is about 100 KB and agrees with JPL Horizons
to within a few meters.

```sh
pnpm bootstrap     # fetch the pinned skills, install dependencies
pnpm dev           # boot this worktree: telemetry stack, tiles, web server
pnpm dev:stop      # tear it down
pnpm verify        # run the checks that need neither Docker nor the kernel
```

`pnpm dev` needs Docker and network access to JPL. Start with [AGENTS.md](AGENTS.md), which maps everything
else, and [ARCHITECTURE.md](ARCHITECTURE.md).
