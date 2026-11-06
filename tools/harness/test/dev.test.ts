import { spawn, spawnSync } from "node:child_process"
import { once } from "node:events"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, FileSystem, Layer, Sink, Stream } from "effect"
import { ChildProcessSpawner } from "effect/process"
import { dev, stop } from "../src/commands/dev.js"
import { worktreeIdentity } from "../src/worktree.js"

const DEV_RECORD = ".harness/dev.pid"
const WEB_RECORD = ".harness/web.pid"
const ROOT = "/home/a/solar-system"
const TEARDOWN = `docker compose -p ${worktreeIdentity(ROOT).project} -f observability/compose.yaml down -v --remove-orphans`
const WEB_PROCESS = 4242

const handle = (pid: number, output: string) =>
  ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(pid),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    unref: Effect.succeed(Effect.void),
    stdin: Sink.drain,
    stdout: Stream.make(new TextEncoder().encode(output)),
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  })

/**
 * A repository at a fixed path. Commands are recorded rather than run, because a test must not touch
 * Docker. Signals are real, and go to real processes: what the system says about them is the point.
 */
const repository = (records: Readonly<Record<string, string>> = {}) => {
  const commands: Array<string> = []
  const removed: Array<string> = []
  const written: Record<string, string> = {}
  const missing = FileSystem.makeNoop({})
  const layer = Layer.mergeAll(
    FileSystem.layerNoop({
      readFileString: (path) => {
        const text = records[path]
        return text === undefined ? missing.readFileString(path) : Effect.succeed(text)
      },
      // A running dev removes its record as it exits, which is what stop waits to see.
      exists: () => Effect.succeed(false),
      makeDirectory: () => Effect.void,
      writeFileString: (path, text) =>
        Effect.sync(() => {
          written[path] = text
        }),
      remove: (path) => Effect.sync(() => void removed.push(path)),
    }),
    Layer.succeed(ChildProcessSpawner.ChildProcessSpawner)(
      ChildProcessSpawner.make((command) =>
        Effect.sync(() => {
          const line = command._tag === "StandardCommand" ? `${command.command} ${command.args.map(String).join(" ")}` : ""
          commands.push(line)
          return handle(line.includes("vite") ? WEB_PROCESS : 1, line.startsWith("git ") ? `${ROOT}\n` : "")
        }),
      ),
    ),
  )
  return { commands, removed, written, layer }
}

/** The id of a process that has run and exited, which the system now reports as no such process. */
const exitedProcess = () => String(spawnSync(process.execPath, ["-e", ""]).pid)

const WAIT = "setTimeout(() => {}, 20000)"

describe("stop", () => {
  it.effect("brings the stack down when the recorded dev has already exited", () => {
    const world = repository({ [DEV_RECORD]: exitedProcess() })
    return stop.pipe(
      Effect.provide(world.layer),
      Effect.map(() => {
        assert.include(world.commands, TEARDOWN)
        assert.include(world.removed, DEV_RECORD)
      }),
    )
  })

  it.effect("brings the stack down when no dev was recorded", () => {
    const world = repository()
    return stop.pipe(
      Effect.provide(world.layer),
      Effect.map(() => {
        assert.include(world.commands, TEARDOWN)
      }),
    )
  })

  it.effect("signals a running dev, and leaves the teardown to it", () =>
    Effect.gen(function* () {
      const running = spawn(process.execPath, ["-e", WAIT])
      const exited = once(running, "exit")
      const world = repository({ [DEV_RECORD]: String(running.pid) })
      yield* stop.pipe(Effect.provide(world.layer))
      const [, signal] = yield* Effect.promise(() => exited)
      assert.strictEqual(signal, "SIGTERM")
      assert.notInclude(world.commands, TEARDOWN)
    }),
  )

  it.effect("fails on a record that is no process id, and leaves the stack alone", () =>
    Effect.gen(function* () {
      const world = repository({ [DEV_RECORD]: "not a process id" })
      const exit = yield* stop.pipe(Effect.provide(world.layer), Effect.exit)
      assert.isTrue(Exit.isFailure(exit))
      assert.notInclude(world.commands, TEARDOWN)
    }),
  )

  // A dev killed outright never stops its web server, so the server keeps its port and answers requests.
  it.live("stops a web server that outlived its dev, along with the stack", () =>
    Effect.gen(function* () {
      const web = spawn(process.execPath, ["-e", WAIT], { detached: true })
      const exited = once(web, "exit")
      const world = repository({ [DEV_RECORD]: exitedProcess(), [WEB_RECORD]: String(web.pid) })
      yield* stop.pipe(Effect.provide(world.layer))
      const [, signal] = yield* Effect.promise(() => exited)
      assert.strictEqual(signal, "SIGTERM")
      assert.include(world.commands, TEARDOWN)
      assert.includeMembers(world.removed, [DEV_RECORD, WEB_RECORD])
    }),
  )

  it.live("brings the stack down even when that web server has already exited", () => {
    const world = repository({ [DEV_RECORD]: exitedProcess(), [WEB_RECORD]: exitedProcess() })
    return stop.pipe(
      Effect.provide(world.layer),
      Effect.map(() => {
        assert.include(world.commands, TEARDOWN)
        assert.include(world.removed, WEB_RECORD)
      }),
    )
  })
})

describe("dev", () => {
  it.effect("records its web server for stop to find, and clears the record on the way out", () => {
    const world = repository()
    return dev.pipe(
      Effect.provide(world.layer),
      Effect.map(() => {
        assert.strictEqual(world.written[WEB_RECORD], String(WEB_PROCESS))
        assert.includeMembers(world.removed, [DEV_RECORD, WEB_RECORD])
      }),
    )
  })
})
