import { expect, test, type Page } from "@playwright/test"

/** The acceptance tests in docs/product-specs/fits-every-screen.md. A phone must never lose the planets. */
const MOMENT = "2026-08-12T17:46:00Z"

const opened = async (page: Page, width: number, height: number) => {
  await page.setViewportSize({ width, height })
  await page.goto(`/?at=${MOMENT}`)
  await expect(page.locator("sky-stage li", { hasText: "Sun" })).toBeVisible()
  await page.waitForFunction(() =>
    document.getAnimations().every(
      (animation) =>
        animation.effect?.getComputedTiming().iterations === Infinity ||
        animation.playState === "finished" ||
        animation.timeline !== document.timeline,
    ),
  )
}

/** The share of the viewport where the sky can actually be seen, from the geometry of what sits on top of it. */
const skyShare = (page: Page) =>
  page.evaluate(() => {
    const figure = document.querySelector("solar-classroom > figure")
    if (figure === null) return 0
    const sky = figure.getBoundingClientRect()
    const skyLayer = Number(getComputedStyle(figure).zIndex) || 0
    const above = (element: Element | null) =>
      element !== null && (Number(getComputedStyle(element).zIndex) || 0) > skyLayer
    const panel = document.querySelector("[data-numbers]")
    const tiles = document.querySelector("[data-view]")
    const rects = [
      ...[...document.querySelectorAll("body > header > *")],
      document.querySelector("[data-dock]"),
      ...(tiles !== null && getComputedStyle(tiles).display !== "none" ? [tiles] : []),
      ...(above(panel) ? [panel] : []),
    ].flatMap((element) => (element === null ? [] : [element.getBoundingClientRect()]))
    const STEP = 6
    const points = Array.from({ length: Math.floor(innerWidth / STEP) }, (_, column) =>
      Array.from({ length: Math.floor(innerHeight / STEP) }, (_, row) => [column * STEP + 2, row * STEP + 2] as const),
    ).flat()
    const clear = points.filter(
      ([x, y]) =>
        y >= sky.top &&
        y <= sky.bottom &&
        rects.every((rect) => x < rect.left || x > rect.right || y < rect.top || y > rect.bottom),
    )
    return Math.round((clear.length / points.length) * 100)
  })

const toTheNumbers = async (page: Page) => {
  await page.evaluate(() => {
    const panel = document.querySelector("[data-numbers]")
    if (panel !== null) scrollTo({ top: scrollY + panel.getBoundingClientRect().top - innerHeight * 0.3, behavior: "instant" })
  })
  await page.waitForTimeout(900)
}

/** Whether the Sun's label sits where it can be seen: on screen, and clear of the controls and the numbers. */
const sunInView = (page: Page) =>
  page.evaluate(() => {
    const stage = document.querySelector("sky-stage")
    const sun = [...(stage?.shadowRoot?.querySelectorAll("li") ?? [])].find((item) => item.textContent === "Sun")
    const figure = document.querySelector("solar-classroom > figure")?.getBoundingClientRect()
    const dock = document.querySelector("[data-dock]")?.getBoundingClientRect()
    if (sun === undefined || sun.hidden || figure === undefined || dock === undefined) return false
    const box = sun.getBoundingClientRect()
    return box.top >= Math.max(0, figure.top) && box.bottom <= Math.min(figure.bottom, dock.top, innerHeight)
  })

const SCREENS = [
  { name: "an iPhone mini", width: 375, height: 629, top: 70, reading: 30 },
  { name: "an iPhone mini with its bars hidden", width: 375, height: 712, top: 70, reading: 30 },
  { name: "an iPhone 16", width: 393, height: 659, top: 70, reading: 30 },
  { name: "an iPhone Pro Max", width: 430, height: 739, top: 70, reading: 30 },
  { name: "an iPad mini in portrait", width: 768, height: 954, top: 55, reading: 30 },
  { name: "a laptop", width: 1366, height: 768, top: 50, reading: 35 },
  { name: "a large desktop", width: 1920, height: 1080, top: 55, reading: 55 },
] as const

test.describe("the planets keep their share of the screen", () => {
  for (const { name, width, height, top, reading } of SCREENS) {
    test(`on ${name}, at the top of the page`, async ({ page }) => {
      await opened(page, width, height)
      expect(await skyShare(page)).toBeGreaterThanOrEqual(top)
    })

    test(`on ${name}, while reading the numbers`, async ({ page }) => {
      await opened(page, width, height)
      await toTheNumbers(page)
      expect(await skyShare(page)).toBeGreaterThanOrEqual(reading)
      await expect.poll(() => sunInView(page), { timeout: 5000 }).toBe(true)
    })
  }

  test("a bigger phone never gets less sky than a smaller one", async ({ page }) => {
    await opened(page, 375, 629)
    const mini = await skyShare(page)
    await opened(page, 430, 739)
    expect(await skyShare(page)).toBeGreaterThanOrEqual(mini - 2)
  })
})

test.describe("on a phone", () => {
  const phone = async (page: Page) => opened(page, 375, 629)
  const more = (page: Page) => page.getByRole("button", { name: "More controls" })

  test("only the essentials show at first", async ({ page }) => {
    await phone(page)
    await expect(page.getByRole("button", { name: /Run time at/ })).toBeInViewport()
    await expect(page.getByRole("button", { name: "Right now" })).toBeInViewport()
    await expect(page.getByRole("slider", { name: /Jump to any date/ })).toBeInViewport()
    await expect(page.locator("solar-classroom time")).toBeInViewport()
    await expect(page.getByRole("radio", { name: "1 week per second" })).toBeHidden()
    await expect(page.getByRole("radio", { name: /Inner planets/ })).toBeHidden()
    await expect(page.getByRole("checkbox", { name: /Show planet sizes/ })).toBeHidden()
  })

  test("the bar stays slim", async ({ page }) => {
    await phone(page)
    const dock = await page.locator("[data-dock]").boundingBox()
    expect(dock?.height).toBeLessThanOrEqual(112)
  })

  test("the rest is one tap away, and choosing from it works", async ({ page }) => {
    await phone(page)
    await more(page).click()
    await expect(page.getByRole("radio", { name: /Inner planets/ })).toBeVisible()
    await page.getByRole("radio", { name: "1 week per second" }).check()
    await expect(page.getByRole("button", { name: "Stop time" })).toBeAttached()
    await expect(page.getByRole("radio", { name: "1 week per second" })).toBeChecked()
    // Time keeps redrawing the page, and the sheet must stay open through that.
    await page.waitForTimeout(600)
    await expect(page.getByRole("radio", { name: /Inner planets/ })).toBeVisible()
  })

  test("the sheet closes three ways, and leaves the sky showing while open", async ({ page }) => {
    await phone(page)
    const radio = page.getByRole("radio", { name: /Inner planets/ })
    await more(page).click()
    const sheet = await page.locator("#controls").boundingBox()
    expect(sheet?.y).toBeGreaterThan(120)
    await page.getByRole("button", { name: "Close the controls" }).click()
    await expect(radio).toBeHidden()
    await more(page).click()
    await page.keyboard.press("Escape")
    await expect(radio).toBeHidden()
    await more(page).click()
    await page.mouse.click(180, 40)
    await expect(radio).toBeHidden()
  })

  test("the sheet lays its controls out across its whole width", async ({ page }) => {
    await phone(page)
    await more(page).click()
    const sheet = await page.locator("#controls").boundingBox()
    for (const part of ["[data-speed]", "[data-view]"]) {
      const box = await page.locator(part).boundingBox()
      if (sheet === null || box === null) throw new Error("Expected boxes")
      expect(box.width).toBeGreaterThan(sheet.width * 0.8)
    }
    const speed = await page.locator("[data-speed]").boundingBox()
    const view = await page.locator("[data-view]").boundingBox()
    if (speed === null || view === null) throw new Error("Expected boxes")
    expect(speed.y + speed.height).toBeLessThanOrEqual(view.y)
    const overflow = await page.locator("#controls").evaluate((element) => element.scrollWidth - element.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test("riding along can be chosen from the sheet", async ({ page }) => {
    await phone(page)
    await more(page).click()
    await page.getByRole("radio", { name: /Ride along/ }).check()
    await page.getByLabel("Planet to ride with").selectOption("Mars")
    await expect(page.getByRole("radio", { name: /Ride along/ })).toBeChecked()
  })

  test("the menu reaches a section, then gets out of the way", async ({ page }) => {
    await phone(page)
    const link = page.getByRole("link", { name: "How it works", exact: true })
    await expect(link).toBeHidden()
    await page.getByRole("button", { name: "Open the list of contents" }).click()
    await link.click()
    await expect(page.getByRole("heading", { level: 2, name: "How it works", exact: true })).toBeInViewport()
    await expect(link).toBeHidden()
  })

  test("the planets keep moving above the numbers while time runs", async ({ page }) => {
    await phone(page)
    // Slow enough that the two years of test data do not run out during the test.
    await more(page).click()
    await page.getByRole("radio", { name: "1 week per second" }).check()
    await page.keyboard.press("Escape")
    await toTheNumbers(page)
    const stage = page.locator("sky-stage")
    const before = await stage.screenshot()
    await expect.poll(async () => (await stage.screenshot()).equals(before)).toBe(false)
    await expect(page.getByRole("button", { name: "Stop time" })).toBeInViewport()
  })

  test("a table row can still be read and chosen beneath the sky", async ({ page }) => {
    await phone(page)
    await toTheNumbers(page)
    const row = page.locator("solar-classroom").getByRole("button", { name: "Mars", exact: true })
    await row.scrollIntoViewIfNeeded()
    await row.click()
    await expect(row).toHaveAttribute("aria-pressed", "true")
  })

  test("a date that cannot be shown still explains itself", async ({ page }) => {
    await phone(page)
    await page.route("**/tiles/planets-2027*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800))
      await route.continue()
    })
    await page.getByRole("slider", { name: /Jump to any date/ }).fill("430")
    await expect(page.locator("[data-dock] output")).toBeVisible()
    await expect(page.locator("[data-dock] output")).toContainText("Fetching the planets for 2027")
  })

  test("a stopped moment can still be shared", async ({ page }) => {
    await phone(page)
    await page.getByRole("button", { name: /Run time at/ }).click()
    await page.getByRole("button", { name: "Stop time" }).click()
    await expect(page.getByRole("link", { name: /Link to this moment/ })).toBeInViewport()
  })
})

test.describe("each larger screen adds a layer", () => {
  test("a tablet shows the speeds and views without a tap", async ({ page }) => {
    await opened(page, 768, 954)
    await expect(page.getByRole("radio", { name: "1 week per second" })).toBeInViewport()
    await expect(page.getByRole("radio", { name: /Inner planets/ })).toBeInViewport()
    await expect(page.getByRole("button", { name: "More controls" })).toBeHidden()
  })

  test("a phone on its side puts the controls beside the sky", async ({ page }) => {
    await opened(page, 812, 340)
    const dock = await page.locator("[data-dock]").boundingBox()
    if (dock === null) throw new Error("Expected a box")
    expect(dock.width).toBeLessThan(812 / 2)
    expect(dock.x).toBeGreaterThan(812 / 2)
    expect(await skyShare(page)).toBeGreaterThanOrEqual(50)
    await expect(page.getByRole("button", { name: /Run time at/ })).toBeInViewport()
  })

  test("a phone on its side keeps the sky beside the numbers", async ({ page }) => {
    await opened(page, 812, 340)
    await toTheNumbers(page)
    expect(await skyShare(page)).toBeGreaterThanOrEqual(25)
  })

  test("a laptop keeps what to show on one row", async ({ page }) => {
    await opened(page, 1366, 768)
    const row = await page.locator("[data-view]").boundingBox()
    expect(row?.height).toBeLessThan(56)
  })

  test("a laptop shows the headline and the speeds, with the numbers a scroll away", async ({ page }) => {
    await opened(page, 1366, 768)
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport()
    await expect(page.getByRole("radio", { name: "1 week per second" })).toBeInViewport()
    await expect(page.locator("solar-classroom").getByRole("table")).not.toBeInViewport()
  })

  test("a large desktop shows the numbers beside the sky without a scroll", async ({ page }) => {
    await opened(page, 1920, 1080)
    await expect(page.locator("solar-classroom").getByRole("table")).toBeInViewport()
    await expect(page.getByRole("radio", { name: "1 week per second" })).toBeInViewport()
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport()
  })
})
