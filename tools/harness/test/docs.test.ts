import { assert, describe, it } from "@effect/vitest"
import { checkDocs, checkFreshness } from "../src/rules/docs.js"

const page = (path: string, text: string) => ({ path, text })
const stamped = (body = "") => `# T\n\n- **Status:** accepted · **Verified:** 2026-10-31\n\n${body}`
const base = [page("AGENTS.md", "[a](docs/DESIGN.md)\n"), page("docs/DESIGN.md", stamped())]
const rules = (...pages: ReadonlyArray<ReturnType<typeof page>>) =>
  checkDocs(pages).map((violation) => violation.rule)

describe("checkDocs", () => {
  it("accepts a small map that reaches every document", () => {
    assert.deepStrictEqual(rules(...base), [])
  })

  it("refuses an AGENTS.md past 100 lines: it is a map, not a manual", () => {
    const long = `[a](docs/DESIGN.md)\n${"line\n".repeat(100)}`
    assert.deepStrictEqual(rules(page("AGENTS.md", long), base[1]!), ["agents-length"])
  })

  it("finds a link to a file that does not exist", () => {
    assert.deepStrictEqual(rules(page("AGENTS.md", "[a](docs/DESIGN.md) [b](docs/GONE.md)"), base[1]!), [
      "broken-link",
    ])
  })

  it("resolves links relative to the file that holds them", () => {
    assert.deepStrictEqual(
      rules(
        page("AGENTS.md", "[i](docs/design-docs/index.md)"),
        page("docs/design-docs/index.md", "[a](a.md) [up](../../AGENTS.md)"),
        page("docs/design-docs/a.md", stamped()),
      ),
      [],
    )
  })

  it("ignores web links, anchors and links inside code", () => {
    assert.deepStrictEqual(
      rules(
        page(
          "AGENTS.md",
          "[a](docs/DESIGN.md) [w](https://x.test) [h](#top) [s](docs/DESIGN.md#part)\n`[c](nope.md)`\n```\n[d](nope.md)\n```\n",
        ),
        base[1]!,
      ),
      [],
    )
  })

  it("finds a document nothing links to", () => {
    assert.deepStrictEqual(rules(...base, page("docs/design-docs/orphan.md", stamped())), [
      "unreachable-doc",
    ])
  })

  it("requires a status and a verification date on design documents", () => {
    assert.deepStrictEqual(rules(page("AGENTS.md", "[a](docs/DESIGN.md)"), page("docs/DESIGN.md", "# T\n")), [
      "missing-status",
    ])
  })

  it("does not ask generated files or indexes for a status", () => {
    assert.deepStrictEqual(
      rules(
        page("AGENTS.md", "[g](docs/generated/index.md) [r](docs/references/index.md)"),
        page("docs/generated/index.md", "[w](w.md)"),
        page("docs/generated/w.md", "# W"),
        page("docs/references/index.md", "[x](x.md)"),
        page("docs/references/x.md", "# X"),
      ),
      [],
    )
  })

  it("requires an execution plan to keep progress and a decision log", () => {
    assert.deepStrictEqual(
      rules(
        page("AGENTS.md", "[p](docs/exec-plans/active/a.md)"),
        page("docs/exec-plans/active/a.md", "# Plan\n## Progress\n"),
      ),
      ["plan-shape"],
    )
  })
})

describe("checkFreshness", () => {
  const doc = (verified: string) => page("docs/DESIGN.md", `- **Verified:** ${verified}\n`)

  it("accepts a document verified within 30 days", () => {
    assert.deepStrictEqual(checkFreshness([doc("2026-10-02")], "2026-10-31"), [])
  })

  it("flags one older than that", () => {
    assert.deepStrictEqual(
      checkFreshness([doc("2026-09-30")], "2026-10-31").map((violation) => violation.rule),
      ["stale-doc"],
    )
  })
})
