import { assert, describe, it } from "@effect/vitest"
import { worktreeIdentity } from "../src/worktree.js"

describe("worktreeIdentity", () => {
  const identity = worktreeIdentity("/home/a/solar-system")

  it("gives the same path the same identity, so a restart finds its stack", () => {
    assert.deepStrictEqual(worktreeIdentity("/home/a/solar-system"), identity)
  })

  it("gives two worktrees different projects and ports", () => {
    const other = worktreeIdentity("/home/a/solar-system-feature")
    assert.notStrictEqual(other.project, identity.project)
    assert.notStrictEqual(other.ports.web, identity.ports.web)
  })

  it("names a Docker Compose project legally", () => {
    assert.match(identity.project, /^solar-[0-9a-f]{8}$/)
  })

  it("uses five distinct unprivileged ports", () => {
    const ports = Object.values(identity.ports)
    assert.strictEqual(new Set(ports).size, 5)
    assert.isTrue(ports.every((port) => port > 1024 && port < 65_536))
  })
})
