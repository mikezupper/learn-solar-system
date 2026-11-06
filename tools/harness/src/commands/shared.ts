import { Array, Console, Effect, FileSystem, Schema, String as Str } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { formatViolation, type TextFile, type Violation } from "../rules/violation.js"

/** A check failed, or the harness could not run. The message is what the reader needs next. */
export class HarnessFailure extends Schema.TaggedError<HarnessFailure>()("HarnessFailure", {
  message: Schema.String,
}) {}

export const toFailure = (cause: unknown): HarnessFailure =>
  new HarnessFailure({ message: String(cause) })

/** Runs a command and collects its output. */
export const capture = (command: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    return yield* spawner.string(ChildProcess.make(command, args)).pipe(Effect.mapError(toFailure))
  })

/** Runs a command with its output on this terminal, and fails if it exits non-zero. */
export const runVisibly = (
  command: string,
  args: ReadonlyArray<string>,
  env: Readonly<Record<string, string>> = {},
  onStart: (pid: number) => Effect.Effect<void, HarnessFailure> = () => Effect.void,
) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const handle = yield* spawner
      .spawn(
        ChildProcess.make(command, args, {
          env,
          extendEnv: true,
          stdout: "inherit",
          stderr: "inherit",
          stdin: "ignore",
        }),
      )
      .pipe(Effect.mapError(toFailure))
    yield* onStart(handle.pid)
    const exitCode = yield* handle.exitCode.pipe(Effect.mapError(toFailure))
    if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
      return yield* new HarnessFailure({
        message: `${command} ${args.join(" ")} exited with code ${String(exitCode)}.`,
      })
    }
  }).pipe(Effect.scoped)

const TEXT_FILE = /\.(md|txt|ts|css|html|json|ya?ml|sh)$/
const NOT_OURS = /^(skills\/[^/]+-skill(\/|$)|fixtures\/|pnpm-lock\.yaml$)/

/** Every file git knows about or would add, minus submodules, fixtures and the lockfile. */
export const listRepositoryFiles = capture("git", ["ls-files", "-co", "--exclude-standard"]).pipe(
  Effect.map((output) => Array.filter(Str.split(Str.trim(output), "\n"), Str.isNonEmpty)),
)

export const readTextFiles = (paths: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const present = yield* Effect.filter(paths, (path) =>
      fs.exists(path).pipe(Effect.mapError(toFailure)),
    )
    return yield* Effect.forEach(
      present.filter((path) => TEXT_FILE.test(path) && !NOT_OURS.test(path)),
      (path) =>
        fs.readFileString(path).pipe(
          Effect.map((text): TextFile => ({ path, text })),
          Effect.mapError(toFailure),
        ),
    )
  })

/** Prints what a lint found, then fails the command if it found anything. */
export const report = (name: string, checked: number, violations: ReadonlyArray<Violation>) =>
  Effect.gen(function* () {
    if (violations.length === 0) {
      yield* Console.log(`${name}: ok (${String(checked)} files)`)
      return
    }
    yield* Effect.forEach(violations, (violation) => Console.error(formatViolation(violation)))
    return yield* new HarnessFailure({
      message: `${name}: ${String(violations.length)} problem(s). Each one above says how to fix it.`,
    })
  })

