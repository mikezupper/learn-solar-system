import { assert, describe, it } from "@effect/vitest"
import { checkLayers } from "../src/rules/layers.js"

const file = (path: string, ...imports: ReadonlyArray<string>) => ({
  path,
  text: imports.map((specifier) => `import x from "${specifier}"`).join("\n"),
})
const rules = (...files: ReadonlyArray<ReturnType<typeof file>>) =>
  checkLayers(files).map((violation) => violation.rule)

describe("checkLayers: direction inside a package", () => {
  it("lets a layer import itself and the layers before it", () => {
    assert.deepStrictEqual(
      rules(file("packages/ephemeris/src/service/a.ts", "./b.js", "../repo/index.js", "../types/x.js")),
      [],
    )
  })

  it("refuses an import that points forward", () => {
    assert.deepStrictEqual(rules(file("packages/ephemeris/src/repo/a.ts", "../service/b.js")), [
      "layer-direction",
    ])
  })

  it("tells the reader how to fix a forward import", () => {
    const [violation] = checkLayers([file("packages/ephemeris/src/types/a.ts", "../repo/b.js")])
    assert.include(violation?.message ?? "", "types may not import repo")
    assert.include(violation?.fix ?? "", "Move")
  })

  it("lets the entry point import anything, and nothing import the entry point", () => {
    assert.deepStrictEqual(rules(file("apps/web/src/main.ts", "./ui/a.js", "./runtime/b.js")), [])
    assert.deepStrictEqual(rules(file("apps/web/src/ui/a.ts", "../main.js")), ["layer-direction"])
  })

  it("lets an entry point import a file beside it, such as its stylesheet", () => {
    assert.deepStrictEqual(rules(file("apps/web/src/main.ts", "./styles.css")), [])
  })

  it("refuses a directory that is not a known layer", () => {
    assert.deepStrictEqual(rules(file("apps/web/src/helpers/a.ts")), ["unknown-layer"])
  })
})

describe("checkLayers: direction between packages", () => {
  it("allows the declared edges", () => {
    assert.deepStrictEqual(
      rules(file("packages/classroom/src/service/a.ts", "@solar/ephemeris/service")),
      [],
    )
  })

  it("refuses an undeclared edge", () => {
    assert.deepStrictEqual(rules(file("packages/ephemeris/src/service/a.ts", "@solar/classroom/types")), [
      "package-direction",
    ])
  })

  it("applies layer order across packages too", () => {
    assert.deepStrictEqual(rules(file("apps/worker/src/repo/a.ts", "@solar/ephemeris/service")), [
      "layer-direction",
    ])
  })

  it("treats providers as the single interface for cross-cutting concerns", () => {
    assert.deepStrictEqual(rules(file("packages/ephemeris/src/service/a.ts", "@solar/providers")), [])
    assert.deepStrictEqual(rules(file("packages/ephemeris/src/repo/a.ts", "@solar/providers")), [
      "layer-direction",
    ])
  })
})

describe("checkLayers: which code may touch which platform", () => {
  it("keeps Node out of the browser's dependencies", () => {
    assert.deepStrictEqual(rules(file("packages/ephemeris/src/service/a.ts", "node:fs")), [
      "restricted-import",
    ])
    assert.deepStrictEqual(rules(file("apps/worker/src/repo/a.ts", "node:crypto")), [])
  })

  it("confines Three.js to the stage", () => {
    assert.deepStrictEqual(rules(file("apps/web/src/ui/classroom.ts", "three")), ["restricted-import"])
    assert.deepStrictEqual(rules(file("apps/web/src/ui/stage.ts", "three")), [])
  })

  it("confines Gyral to the UI and the runtime that serves it", () => {
    assert.deepStrictEqual(rules(file("packages/classroom/src/service/a.ts", "@gyral/core")), [
      "restricted-import",
    ])
    assert.deepStrictEqual(rules(file("apps/web/src/runtime/tokens.ts", "@gyral/core")), [])
  })

  it("confines telemetry export to providers", () => {
    assert.deepStrictEqual(rules(file("apps/worker/src/service/a.ts", "effect/observability")), [
      "restricted-import",
    ])
    assert.deepStrictEqual(rules(file("packages/providers/src/telemetry.ts", "effect/observability")), [])
  })

  it("does not police tests or tools", () => {
    assert.deepStrictEqual(rules(file("packages/ephemeris/test/a.test.ts", "node:fs", "three")), [])
    assert.deepStrictEqual(rules(file("tools/harness/src/main.ts", "node:fs")), [])
  })
})
