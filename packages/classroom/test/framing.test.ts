import { assert, describe, it } from "@effect/vitest"
import { fitDistance, labelsWithRoom } from "../src/service/framing.js"

describe("fitDistance", () => {
  it("fits a radius to a square view by simple trigonometry", () => {
    // A 90 degree field of view has a half-angle of 45 degrees, and sin 45 = 1 / sqrt 2.
    assert.closeTo(fitDistance(10, 90, 1), 10 * Math.SQRT2, 1e-9)
  })

  it("stands farther back when a narrow window limits the view", () => {
    assert.isAbove(fitDistance(10, 90, 0.5), fitDistance(10, 90, 1))
  })

  it("does not change for a wide window, where height is the limit", () => {
    assert.closeTo(fitDistance(10, 90, 2), fitDistance(10, 90, 1), 1e-9)
  })
})

describe("labelsWithRoom", () => {
  const LABEL = { width: 64, height: 18 }
  const at = (name: string, x: number, y = 0) => ({ name, x, y })
  const names = (labels: ReadonlyArray<{ readonly name: string }>) => labels.map((label) => label.name)

  it("keeps labels that do not touch", () => {
    assert.strictEqual(labelsWithRoom([at("a", 0), at("b", 100)], LABEL).length, 2)
  })

  it("drops the later of two labels that overlap", () => {
    assert.deepStrictEqual(names(labelsWithRoom([at("a", 0), at("b", 10)], LABEL)), ["a"])
  })

  it("keeps two labels that are close but on separate lines of text", () => {
    assert.deepStrictEqual(names(labelsWithRoom([at("a", 0, 0), at("b", 5, 20)], LABEL)), ["a", "b"])
  })

  it("keeps a label that starts just past the end of another", () => {
    assert.deepStrictEqual(names(labelsWithRoom([at("a", 0), at("b", 65)], LABEL)), ["a", "b"])
  })

  it("measures a label against those it kept, not those it dropped", () => {
    assert.deepStrictEqual(
      names(labelsWithRoom([at("a", 0), at("b", 40), at("c", 80)], LABEL)),
      ["a", "c"],
    )
  })
})
