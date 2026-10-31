import { assert, describe, it } from "@effect/vitest"
import { fitDistance, placeLabels } from "../src/service/framing.js"

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

describe("placeLabels", () => {
  const BOX = { width: 64, height: 14 }
  const VIEW = 1000
  const at = (name: string, x: number, y = 100) => ({ name, x, y })
  const placed = (...labels: ReadonlyArray<ReturnType<typeof at>>) =>
    placeLabels(labels, VIEW, BOX).map((label) => `${label.name}:${label.side}`)

  it("puts a label after its dot when there is room", () => {
    assert.deepStrictEqual(placed(at("a", 100)), ["a:after"])
  })

  it("keeps labels that do not touch", () => {
    assert.deepStrictEqual(placed(at("a", 100), at("b", 300)), ["a:after", "b:after"])
  })

  it("keeps two close labels on separate lines of text", () => {
    assert.deepStrictEqual(placed(at("a", 100, 100), at("b", 105, 120)), ["a:after", "b:after"])
  })

  it("does not cover a neighbor's dot, when the other side is free", () => {
    assert.deepStrictEqual(placed(at("Venus", 100), at("Mercury", 150, 105)), [
      "Venus:before",
      "Mercury:after",
    ])
  })

  it("names two planets side by side by labeling outward", () => {
    assert.deepStrictEqual(placed(at("a", 100), at("b", 110)), ["a:before", "b:after"])
  })

  it("still names a body whose neighbors crowd it, then labels what it can around it", () => {
    assert.deepStrictEqual(placed(at("Sun", 100), at("x", 90), at("y", 110)), ["Sun:after", "x:before"])
  })

  it("leaves room for a neighbor's own label, not just its dot", () => {
    assert.deepStrictEqual(placed(at("Venus", 100, 100), at("Mercury", 150, 112)), [
      "Venus:before",
      "Mercury:after",
    ])
  })

  it("drops a label only when both of its sides are taken", () => {
    assert.deepStrictEqual(placed(at("a", 100), at("b", 101), at("c", 102)), ["a:before", "b:after"])
  })

  it("moves a label inside the view at the right edge", () => {
    assert.deepStrictEqual(placed(at("Neptune", 960)), ["Neptune:before"])
  })

  it("allows a label that exactly reaches the edge", () => {
    assert.deepStrictEqual(placed(at("a", 936)), ["a:after"])
  })

  it("drops a label that fits on neither side of a very narrow view", () => {
    assert.deepStrictEqual(
      placeLabels([at("a", 30)], 60, BOX).map((label) => label.name),
      [],
    )
  })

  it("returns where each label belongs, for the stage to draw", () => {
    assert.deepStrictEqual(placeLabels([at("a", 100, 40)], VIEW, BOX), [
      { name: "a", x: 100, y: 40, side: "after" },
    ])
  })
})
