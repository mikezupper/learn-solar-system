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
  const at = (name: string, x: number) => ({ name, x, y: 0 })

  it("keeps labels that do not touch", () => {
    assert.strictEqual(labelsWithRoom([at("a", 0), at("b", 100)], 50).length, 2)
  })

  it("drops the later of two crowded labels", () => {
    assert.deepStrictEqual(
      labelsWithRoom([at("a", 0), at("b", 10)], 50).map((label) => label.name),
      ["a"],
    )
  })

  it("measures a label against those it kept, not those it dropped", () => {
    assert.deepStrictEqual(
      labelsWithRoom([at("a", 0), at("b", 40), at("c", 80)], 50).map((label) => label.name),
      ["a", "c"],
    )
  })
})
