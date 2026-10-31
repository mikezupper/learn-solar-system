import { assert, describe, it } from "@effect/vitest"
import { checkTaste } from "../src/rules/taste.js"
import { formatViolation } from "../src/rules/violation.js"

const rules = (path: string, text: string) =>
  checkTaste([{ path, text }]).map((violation) => violation.rule)

describe("checkTaste", () => {
  it("limits a source file's length, so it fits in a context window", () => {
    assert.deepStrictEqual(rules("packages/a/src/service/a.ts", "x\n".repeat(401)), ["file-length"])
    assert.deepStrictEqual(rules("packages/a/src/service/a.ts", "x\n".repeat(399)), [])
  })

  it.each(['<p class="x">', '<p style="y">', "<div>", "<span>"])(
    "refuses %s in a view: choose an element for what it means",
    (markup) => {
      assert.deepStrictEqual(rules("apps/web/src/ui/view.ts", `html\`${markup}\``), ["semantic-markup"])
      assert.deepStrictEqual(rules("apps/web/index.html", markup), ["semantic-markup"])
    },
  )

  it("does not apply markup rules to tests", () => {
    assert.deepStrictEqual(rules("apps/web/test/view.test.ts", "<div>"), [])
  })

  it.each(["margin-left: 1px", "padding-right: 1px", "text-align: left", "width: 1px", "left: 0"])(
    "refuses the physical CSS %s: logical properties serve right-to-left readers",
    (css) => {
      assert.deepStrictEqual(rules("apps/web/src/styles.css", `a { ${css}; }`), ["css-logical"])
    },
  )

  it("accepts logical CSS", () => {
    assert.deepStrictEqual(
      rules("apps/web/src/styles.css", "a { margin-inline-start: 1px; inline-size: 2px; inset-block-start: 0; }"),
      [],
    )
  })

  it.each(["color: #fff", "color: rgb(0 0 0)", "color: hsl(0 0% 0%)"])(
    "refuses %s: colors are oklch",
    (css) => {
      assert.deepStrictEqual(rules("apps/web/src/styles.css", `a { ${css}; }`), ["css-color"])
    },
  )

  it("refuses !important: cascade layers settle precedence", () => {
    assert.deepStrictEqual(rules("apps/web/src/styles.css", "a { color: red !important; }"), ["css-important"])
  })

  it.each(['<link rel="stylesheet" href="a.css">', "<style>", "<script>"])(
    "keeps the data page free of %s",
    (markup) => {
      assert.deepStrictEqual(rules("apps/web/about-the-data.html", markup), ["plain-document"])
    },
  )

  it("refuses pkill -f in scripts: it matches the shell that runs it", () => {
    assert.deepStrictEqual(rules("package.json", '{"scripts":{"a":"pkill -f vite"}}'), ["pattern-kill"])
  })

  it("says how to fix what it finds", () => {
    const [violation] = checkTaste([{ path: "apps/web/src/styles.css", text: "a { left: 0; }" }])
    assert.include(violation?.fix ?? "", "inset-inline-start")
  })
})

describe("formatViolation", () => {
  it("leads with the file and rule, then gives the fix on its own line", () => {
    assert.strictEqual(
      formatViolation({ rule: "r", file: "f.ts", message: "Wrong.", fix: "Do this." }),
      "f.ts: [r] Wrong.\n  Fix: Do this.",
    )
  })
})
