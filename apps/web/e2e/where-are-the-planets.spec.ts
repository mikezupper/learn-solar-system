import { readFileSync } from "node:fs"
import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

/** The acceptance tests in docs/product-specs/where-are-the-planets-now.md, run against a real build. */
type Vector = readonly [number, number, number]
interface GoldenBody {
  readonly name: string
  readonly rows: ReadonlyArray<{ readonly jdTdb: number; readonly positionKm: Vector }>
}
const golden: { readonly bodies: ReadonlyArray<GoldenBody> } = JSON.parse(
  readFileSync(new URL("../../../fixtures/horizons/planets-2026.json", import.meta.url), "utf8"),
)
const KM_PER_AU = 149_597_870.7
const LIGHT_KM_PER_MINUTE = 299_792.458 * 60
const ROW = 3

const rowOf = (name: string) => {
  const row = golden.bodies.find((body) => body.name === name)?.rows[ROW]
  if (row === undefined) throw new Error(`No golden row for ${name}`)
  return row
}

/** Julian date to UTC: 2440587.5 is the Unix epoch, and TDB ran 69.184 s ahead of UTC in 2026. */
const momentOfRow = new Date(
  (rowOf("Mars").jdTdb - 2440587.5) * 86_400_000 - 69_184,
).toISOString()

const distance = (a: Vector, b: Vector = [0, 0, 0]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** The live component, as distinct from the tables and text in the page's explanation below it. */
const classroom = (page: Page) => page.locator("solar-classroom")

const rowCells = (page: Page, planet: string) =>
  classroom(page).getByRole("row", { name: new RegExp(`^${planet}\\b`) }).getByRole("cell")

/** Fails any test in which the page throws or logs an error. */
const watchForErrors = (page: Page): ReadonlyArray<string> => {
  const errors: Array<string> = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  return errors
}

test.describe("a teacher opens a shared link", () => {
  test("every distance matches JPL Horizons at the printed precision", async ({ page }) => {
    const errors = watchForErrors(page)
    await page.goto(`/?at=${momentOfRow}`)
    await expect(classroom(page).getByRole("table")).toBeVisible()

    for (const name of ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"]) {
      const expected = (distance(rowOf(name).positionKm) / KM_PER_AU).toFixed(3)
      await expect(rowCells(page, name).nth(0)).toHaveText(expected)
    }
    const fromEarthKm = distance(rowOf("Mars").positionKm, rowOf("Earth").positionKm)
    await expect(rowCells(page, "Mars").nth(1)).toHaveText((fromEarthKm / KM_PER_AU).toFixed(3))
    await expect(rowCells(page, "Mars").nth(2)).toHaveText((fromEarthKm / LIGHT_KM_PER_MINUTE).toFixed(1))
    await expect(rowCells(page, "Earth").nth(1)).toHaveText("n/a")
    expect(errors).toEqual([])
  })

  test("the link holds still and says so", async ({ page }) => {
    await page.goto(`/?at=${momentOfRow}`)
    await expect(classroom(page).locator("time")).toContainText("UTC")
    await expect(page.getByText("everyone who opens it sees the same sky")).toBeVisible()
    await expect(classroom(page).locator("time")).toHaveAttribute("datetime", momentOfRow)
    await expect(page.getByRole("link", { name: "Go to the present moment" })).toHaveAttribute("href", "/")
  })

  test("the stage draws the planets, and a different date moves them", async ({ page }) => {
    const errors = watchForErrors(page)
    await page.goto("/?at=2026-01-15T00:00:00Z")
    const stage = page.locator("sky-stage")
    await expect(stage.locator("li", { hasText: "Neptune" })).toBeVisible()
    await expect(stage.locator("li", { hasText: "Sun" })).toBeVisible()
    await expect(stage.locator("li", { hasText: "Jupiter" })).toBeVisible()
    const january = await stage.screenshot()

    await page.goto("/?at=2026-11-15T00:00:00Z")
    await expect(stage.locator("li", { hasText: "Neptune" })).toBeVisible()
    const november = await stage.screenshot()

    expect(january.equals(november)).toBe(false)
    const litPixels = await page.evaluate(async (base64) => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64}`
      await image.decode()
      const canvas = document.createElement("canvas")
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext("2d")
      if (context === null) return 0
      context.drawImage(image, 0, 0)
      const { data } = context.getImageData(0, 0, image.width, image.height)
      let lit = 0
      for (let i = 0; i < data.length; i += 4) if ((data[i] ?? 0) > 150) lit += 1
      return lit
    }, november.toString("base64"))
    expect(litPixels).toBeGreaterThan(100)
    expect(errors).toEqual([])
  })
})

test.describe("a student explores the view", () => {
  test("zooming in separates the inner planets, and their labels return", async ({ page }) => {
    await page.goto(`/?at=${momentOfRow}`)
    const stage = page.locator("sky-stage")
    const mercury = stage.locator("li", { hasText: "Mercury" })
    await expect(stage.locator("li", { hasText: "Neptune" })).toBeVisible()
    await expect(mercury).toBeHidden()
    await stage.hover()
    await expect(async () => {
      await page.mouse.wheel(0, -600)
      await expect(mercury).toBeVisible({ timeout: 200 })
    }).toPass({ timeout: 10_000 })
  })

  test("on a phone, Neptune's label stays inside the view", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/?at=2026-08-12T17:46:00Z")
    const stage = page.locator("sky-stage")
    const label = stage.locator("li", { hasText: "Neptune" })
    await expect(label).toBeVisible()
    const stageBox = await stage.boundingBox()
    const labelBox = await label.boundingBox()
    if (stageBox === null || labelBox === null) throw new Error("Expected boxes")
    expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width)
  })
})

const countLit = (page: Page, shot: Buffer) =>
  page.evaluate(async (base64) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = document.createElement("canvas")
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext("2d")
    if (context === null) return 0
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, image.width, image.height)
    let lit = 0
    for (let i = 0; i < data.length; i += 4) if ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) > 60) lit += 1
    return lit
  }, shot.toString("base64"))

const shownMoment = (page: Page) => classroom(page).locator("time").getAttribute("datetime")

test.describe("a student watches the planets move", () => {
  test("each planet's path is drawn as a line around the Sun", async ({ page }) => {
    await page.goto("/?at=2026-06-01T00:00:00Z")
    const stage = page.locator("sky-stage")
    await expect(stage.locator("li", { hasText: "Neptune" })).toBeVisible()
    // Eight dots and a Sun light a few hundred pixels. Eight long ellipses light thousands.
    expect(await countLit(page, await stage.screenshot())).toBeGreaterThan(3000)
  })

  test("choosing a speed runs time forward, and the picture and table follow", async ({ page }) => {
    const errors = watchForErrors(page)
    await page.goto("/?at=2026-03-01T00:00:00Z")
    const stage = page.locator("sky-stage")
    await expect(stage.locator("li", { hasText: "Neptune" })).toBeVisible()
    await page.getByRole("radio", { name: "Inner planets" }).check()
    await expect(stage.locator("li", { hasText: "Mercury" })).toBeVisible()
    const before = await stage.screenshot()
    const distanceBefore = await rowCells(page, "Mercury").nth(0).textContent()

    await page.getByRole("radio", { name: "1 week per second" }).check()
    await expect.poll(async () => (await shownMoment(page)) ?? "").not.toBe("2026-03-01T00:00:00.000Z")
    await expect.poll(() => rowCells(page, "Mercury").nth(0).textContent()).not.toBe(distanceBefore)
    await expect(page.getByText("The motion is real, only faster")).toBeVisible()
    expect((await stage.screenshot()).equals(before)).toBe(false)
    expect(errors).toEqual([])
  })

  test("the date advances at the speed chosen", async ({ page }) => {
    await page.goto("/?at=2026-03-01T00:00:00Z")
    await page.getByRole("radio", { name: "1 day per second" }).check()
    const start = Date.parse((await shownMoment(page)) ?? "")
    await page.waitForTimeout(2000)
    const days = (Date.parse((await shownMoment(page)) ?? "") - start) / 86_400_000
    // Two real seconds is two days, give or take a tick either side on a busy machine.
    expect(days).toBeGreaterThan(1)
    expect(days).toBeLessThan(3.5)
  })

  test("stopping holds the moment and offers a link to it", async ({ page }) => {
    await page.goto("/?at=2026-03-01T00:00:00Z")
    await page.getByRole("radio", { name: "1 week per second" }).check()
    await expect.poll(async () => (await shownMoment(page)) ?? "").not.toBe("2026-03-01T00:00:00.000Z")
    await page.getByRole("radio", { name: "Stopped" }).check()
    const stoppedAt = (await shownMoment(page)) ?? ""
    await page.waitForTimeout(600)
    expect(await shownMoment(page)).toBe(stoppedAt)
    await expect(page.getByRole("link", { name: /Link to this moment/ })).toHaveAttribute(
      "href",
      `/?at=${stoppedAt}`,
    )
  })

  test("time crosses into the next year's data without a pause in the page", async ({ page }) => {
    const errors = watchForErrors(page)
    await page.goto("/?at=2026-12-20T00:00:00Z")
    await page.getByRole("radio", { name: "1 month per second" }).check()
    await expect.poll(async () => (await shownMoment(page)) ?? "", { timeout: 15_000 }).toMatch(/^2027-/)
    await expect(page.locator("sky-stage")).toBeVisible()
    expect(errors).toEqual([])
  })

  test("at the end of the data, time stops and says why", async ({ page }) => {
    await page.goto("/?at=2027-12-20T00:00:00Z")
    await page.getByRole("radio", { name: "1 month per second" }).check()
    await expect(page.getByText("planet data through 2027")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole("radio", { name: "Stopped" })).toBeChecked()
    expect((await shownMoment(page)) ?? "").toMatch(/^2027-12/)
  })

  test("Right now returns to the present without reloading the page", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-31T12:00:00Z") })
    await page.goto("/?at=2026-03-01T00:00:00Z")
    await expect(classroom(page).getByRole("table")).toBeVisible()
    await page.getByRole("radio", { name: "Right now" }).check()
    await expect.poll(async () => (await shownMoment(page)) ?? "").toMatch(/^2026-10-31T12:00/)
    await expect(page.getByText("updated every second")).toBeVisible()
  })

  test("the inner view makes the inner planets readable, and the giants leave the frame", async ({ page }) => {
    await page.goto("/?at=2026-06-01T00:00:00Z")
    const stage = page.locator("sky-stage")
    await page.getByRole("radio", { name: "Inner planets" }).check()
    for (const name of ["Mercury", "Venus", "Earth", "Mars"]) {
      await expect(stage.locator("li", { hasText: name })).toBeVisible()
    }
    await expect(stage.locator("li", { hasText: "Neptune" })).toBeHidden()
  })

  test("the controls work from the keyboard", async ({ page }) => {
    await page.goto("/?at=2026-03-01T00:00:00Z")
    await page.getByRole("radio", { name: "1 day per second" }).focus()
    await page.keyboard.press("ArrowRight")
    await expect(page.getByRole("radio", { name: "1 week per second" })).toBeChecked()
    await expect(page.getByText("The motion is real, only faster")).toBeVisible()
  })
})

test.describe("a student opens the page with no link", () => {
  test("it shows the present moment and keeps it current", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-31T12:00:00Z") })
    await page.goto("/")
    await expect(page.getByText("updated every second")).toBeVisible()
    const shown = () => classroom(page).locator("time").getAttribute("datetime")
    const first = await shown()
    expect(first).toMatch(/^2026-10-31T12:00:/)
    await expect.poll(shown).not.toBe(first)
    await expect(page.getByRole("link", { name: "Go to the present moment" })).toHaveCount(0)
  })
})

test.describe("when the page cannot show the sky", () => {
  test("a date outside the published years is explained", async ({ page }) => {
    await page.goto("/?at=1990-01-01")
    await expect(page.getByRole("alert")).toContainText("2026 through 2027")
    await expect(classroom(page).getByRole("table")).toHaveCount(0)
    await expect(page.getByRole("link", { name: "Go to the present moment" })).toBeVisible()
  })

  test("a date it cannot read is quoted back with an example", async ({ page }) => {
    await page.goto("/?at=tomorrow")
    await expect(page.getByRole("alert")).toContainText('"tomorrow"')
    await expect(page.getByRole("alert")).toContainText("2026-08-12T17:46:00Z")
  })

  test("a damaged tile is refused, and no number reaches the screen", async ({ page }) => {
    await page.route("**/tiles/*.bin", async (route) => {
      const response = await route.fetch()
      const body = await response.body()
      body[1000] = (body[1000] ?? 0) ^ 0xff
      await route.fulfill({ response, body })
    })
    await page.goto(`/?at=${momentOfRow}`)
    await expect(page.getByRole("alert")).toContainText("arrived damaged")
    await expect(classroom(page).getByRole("table")).toHaveCount(0)
  })

  test("a missing catalog is reported in plain words", async ({ page }) => {
    await page.route("**/tiles/catalog.json", (route) => route.fulfill({ status: 503 }))
    await page.goto(`/?at=${momentOfRow}`)
    await expect(page.getByRole("alert")).toContainText("could not be loaded")
  })
})

test.describe("every learner can use it", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the page passes axe in the ${colorScheme} color scheme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto(`/?at=${momentOfRow}`)
      await expect(classroom(page).getByRole("table")).toBeVisible()
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations).toEqual([])
      // A scan of the wrong root would pass silently, so check that it reached the table.
      expect(results.passes.some((rule) => rule.nodes.some((node) => node.html.includes("<th")))).toBe(true)
    })

    test(`the data page passes axe in the ${colorScheme} color scheme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto("/about-the-data.html")
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations).toEqual([])
    })
  }

  test("the first Tab press reaches a skip link that works", async ({ page }) => {
    await page.goto(`/?at=${momentOfRow}`)
    await page.keyboard.press("Tab")
    const skip = page.getByRole("link", { name: "Skip to main content" })
    await expect(skip).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/#main$/)
  })

  test("the table states the moment in words and in a form machines can read", async ({ page }) => {
    await page.goto(`/?at=${momentOfRow}`)
    await expect(classroom(page).locator("time")).toContainText("2026")
    await expect(classroom(page).getByRole("columnheader", { name: /Distance from the Sun/ })).toBeVisible()
    await expect(classroom(page).getByRole("rowheader", { name: "Neptune" })).toBeVisible()
  })

  test("the data page works with no stylesheet, class or script", async ({ page }) => {
    await page.goto("/about-the-data.html")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Where these numbers come from")
    const found = await page.evaluate(() => ({
      stylesheets: document.styleSheets.length,
      classes: document.querySelectorAll("[class]").length,
      scripts: document.querySelectorAll("script").length,
    }))
    expect(found).toEqual({ stylesheets: 0, classes: 0, scripts: 0 })
  })
})
