import { assert, describe, it } from "@effect/vitest"
import {
  fitDistance,
  fitDistanceInto,
  kmPerPixel,
  niceFactor,
  placeLabels,
  rideRadiusKm,
  scaleBarAu,
  sizeScales,
} from "../src/service/framing.js"
import { KM_PER_AU, PLANETS, SUN_DIAMETER_KM } from "../src/types/index.js"

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

describe("fitDistanceInto", () => {
  const view = { verticalFovDegrees: 90, viewWidth: 1000, viewHeight: 1000 }

  it("matches fitDistance when nothing covers the view", () => {
    assert.closeTo(
      fitDistanceInto({ ...view, radius: 10, freeWidth: 1000, freeHeight: 1000 }),
      fitDistance(10, 90, 1),
      1e-9,
    )
  })

  it("stands further back when something covers part of the view", () => {
    const covered = fitDistanceInto({ ...view, radius: 10, freeWidth: 1000, freeHeight: 500 })
    assert.isAbove(covered, fitDistance(10, 90, 1))
  })

  // A radius 10 sphere seen in half the height needs half the tangent: tan(half angle) = 0.5.
  it("fits the radius into the space left over", () => {
    const covered = fitDistanceInto({ ...view, radius: 10, freeWidth: 1000, freeHeight: 500 })
    assert.closeTo(covered, 10 / Math.sin(Math.atan(0.5)), 1e-9)
  })
})

describe("kmPerPixel", () => {
  // At 45 degrees either side, the height of the view at distance d is 2d.
  it("follows from the distance and the field of view", () => {
    assert.closeTo(kmPerPixel(1000, 90, 500), 4, 1e-9)
  })
})

describe("rideRadiusKm", () => {
  it("keeps the Sun in the frame", () => {
    assert.isAbove(rideRadiusKm(5 * KM_PER_AU), 5 * KM_PER_AU)
  })

  it("does not crowd a planet close to the Sun", () => {
    assert.isAtLeast(rideRadiusKm(0.31 * KM_PER_AU), 0.31 * KM_PER_AU)
  })
})

describe("scaleBarAu", () => {
  it("chooses the longest round length that stays short of the view", () => {
    assert.strictEqual(scaleBarAu(8, 1000), 10)
    assert.strictEqual(scaleBarAu(150, 1000), 1)
    assert.strictEqual(scaleBarAu(4000, 1000), 0.01)
  })
})

describe("niceFactor", () => {
  it.each([
    [8437, 8400],
    [362, 360],
    [17.6, 18],
    [1.44, 1.4],
    [0.2, 1],
  ])("rounds %d to %d, and never shrinks anything", (raw, nice) => {
    assert.closeTo(niceFactor(raw), nice, 1e-9)
  })
})

describe("sizeScales", () => {
  const diameter = (name: string) => PLANETS.find((planet) => planet.name === name)?.diameterKm ?? 0

  it("enlarges every planet by one factor, so they stay true to one another", () => {
    const { planets } = sizeScales(18_000_000)
    assert.closeTo((diameter("Jupiter") * planets) / (diameter("Earth") * planets), 11.2, 0.1)
  })

  it("makes Earth big enough to see", () => {
    const pixels = (diameter("Earth") * sizeScales(18_000_000).planets) / 18_000_000
    assert.isAbove(pixels, 5)
    assert.isBelow(pixels, 12)
  })

  it("enlarges the Sun less, or it would swallow the inner planets", () => {
    const { planets, sun } = sizeScales(18_000_000)
    assert.isBelow(sun, planets)
    assert.isBelow((SUN_DIAMETER_KM * sun) / 18_000_000, 40)
  })

  it("never draws anything smaller than life", () => {
    const { planets, sun } = sizeScales(1)
    assert.strictEqual(planets, 1)
    assert.strictEqual(sun, 1)
  })
})

describe("planet diameters", () => {
  // NASA's planetary fact sheet.
  it.each([
    ["Mercury", 4879],
    ["Venus", 12_104],
    ["Earth", 12_756],
    ["Mars", 6792],
    ["Jupiter", 142_984],
    ["Saturn", 120_536],
    ["Uranus", 51_118],
    ["Neptune", 49_528],
  ] as const)("%s is %d km across", (name, km) => {
    assert.strictEqual(PLANETS.find((planet) => planet.name === name)?.diameterKm, km)
  })
})
