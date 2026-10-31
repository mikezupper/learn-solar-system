import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

/** The acceptance tests in docs/product-specs/mission-clock.md, run against a real build. */
const JUNE = "2026-06-01T00:00:00Z"
const NOW = new Date("2026-10-31T12:00:00Z")
const DAY = 86_400_000

const classroom = (page: Page) => page.locator("solar-classroom")
const stage = (page: Page) => page.locator("sky-stage")
const clock = (page: Page) => classroom(page).locator("time")
const shown = async (page: Page) => Date.parse((await clock(page).getAttribute("datetime")) ?? "")
const timeline = (page: Page) => page.getByRole("slider", { name: /Jump to any date/ })
const label = (page: Page, name: string) => stage(page).locator("li", { hasText: name })
const dayOf = (iso: string) => String(Math.floor((Date.parse(iso) - Date.UTC(2026, 0, 1)) / DAY))

const opened = async (page: Page, moment = JUNE) => {
  await page.goto(`/?at=${moment}`)
  await expect(label(page, "Sun")).toBeVisible()
}

test.describe("the page opens with a show, unless that would be wrong", () => {
  test("opening on the present replays this year, then settles on today", async ({ page }) => {
    await page.clock.install({ time: NOW })
    await page.goto("/")
    await expect(classroom(page).getByRole("status").first()).toContainText("Catching up")
    expect(await shown(page)).toBeLessThan(NOW.getTime() - DAY)
    await expect(page.getByRole("button", { name: "Right now" })).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 })
    expect(Math.abs((await shown(page)) - NOW.getTime())).toBeLessThan(60_000)
  })

  test("a shared link holds still from the first moment", async ({ page }) => {
    await page.goto(`/?at=${JUNE}`)
    await expect(clock(page)).toHaveAttribute("datetime", new Date(JUNE).toISOString())
    await page.waitForTimeout(500)
    await expect(clock(page)).toHaveAttribute("datetime", new Date(JUNE).toISOString())
  })

  test("nothing replays for anyone who asked for less motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.clock.install({ time: NOW })
    await page.goto("/")
    await expect(page.getByRole("button", { name: "Right now" })).toHaveAttribute("aria-pressed", "true")
  })
})

test.describe("how fast time runs", () => {
  test("the big button starts and stops time, and offers a link once stopped", async ({ page }) => {
    await opened(page)
    await page.getByRole("button", { name: "Run time at 1 year per second" }).click()
    await expect.poll(() => shown(page)).toBeGreaterThan(Date.parse(JUNE) + DAY)
    await expect(page.getByRole("radio", { name: "1 year per second" })).toBeChecked()
    await page.getByRole("button", { name: "Stop time" }).click()
    await expect(page.getByRole("link", { name: /Link to this moment/ })).toBeVisible()
  })

  test("a speed step starts time at once, and Play remembers it", async ({ page }) => {
    await opened(page)
    await page.getByRole("radio", { name: "1 week per second" }).check()
    await expect(classroom(page).locator("output")).toContainText("Earth in about 52")
    await page.getByRole("button", { name: "Stop time" }).click()
    await expect(page.getByRole("button", { name: "Run time at 1 week per second" })).toBeVisible()
  })

  test("the first press suits the zoom: a week per second with the inner planets", async ({ page }) => {
    await opened(page)
    await page.getByRole("radio", { name: "Inner planets" }).check()
    await expect(page.getByRole("button", { name: "Run time at 1 week per second" })).toBeVisible()
  })

  test("Right now runs back to today without leaving the page", async ({ page }) => {
    await page.clock.install({ time: NOW })
    await opened(page)
    await page.getByRole("button", { name: "Right now" }).click()
    await expect(page.getByRole("button", { name: "Right now" })).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 })
    expect(Math.abs((await shown(page)) - NOW.getTime())).toBeLessThan(60_000)
  })
})

test.describe("the timeline", () => {
  test("marks the years the site has", async ({ page }) => {
    await opened(page)
    await expect(page.locator("[data-scrub] ol li")).toHaveText(["2026", "2027"])
  })

  test("moves the planets at once within the year", async ({ page }) => {
    await opened(page)
    const before = await stage(page).screenshot()
    await timeline(page).fill(dayOf("2026-11-15T00:00:00Z"))
    await expect(clock(page)).toHaveAttribute("datetime", "2026-11-15T00:00:00.000Z")
    await expect.poll(async () => (await stage(page).screenshot()).equals(before)).toBe(false)
  })

  test("waits for another year's data, and says so, rather than guess", async ({ page }) => {
    await opened(page)
    const before = await classroom(page).getByRole("row", { name: /^Mars\b/ }).textContent()
    await page.route("**/tiles/planets-2027*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800))
      await route.continue()
    })
    await timeline(page).fill(dayOf("2027-03-01T00:00:00Z"))
    await expect(classroom(page).locator("output")).toContainText("Fetching the planets for 2027")
    await expect(page.locator("[data-numbers]")).toHaveAttribute("aria-busy", "true")
    expect(await classroom(page).getByRole("row", { name: /^Mars\b/ }).textContent()).toBe(before)
    await expect(page.locator("[data-numbers]")).toHaveAttribute("aria-busy", "false", { timeout: 10_000 })
    await expect(clock(page)).toHaveAttribute("datetime", "2027-03-01T00:00:00.000Z")
    expect(await classroom(page).getByRole("row", { name: /^Mars\b/ }).textContent()).not.toBe(before)
  })

  test("lets time carry on after a drag, if it was running", async ({ page }) => {
    await opened(page)
    await page.getByRole("radio", { name: "1 week per second" }).check()
    await timeline(page).fill(dayOf("2026-08-01T00:00:00Z"))
    await expect(page.getByRole("radio", { name: "1 week per second" })).toBeChecked()
    await expect.poll(() => shown(page)).toBeGreaterThan(Date.parse("2026-08-01T00:00:00Z"))
  })
})

test.describe("what to show", () => {
  test("the ring around the inner planets flies you in", async ({ page }) => {
    await opened(page)
    const sun = await label(page, "Sun").boundingBox()
    const style = (await label(page, "Sun").getAttribute("style")) ?? ""
    if (sun === null) throw new Error("Expected a box")
    await page.mouse.click(style.includes("-100%") ? sun.x + sun.width : sun.x, sun.y + sun.height / 2)
    await expect(page.getByRole("radio", { name: "Inner planets" })).toBeChecked()
    await expect(label(page, "Mercury")).toBeVisible()
  })

  test("riding along keeps a planet in place while the rest move around it", async ({ page }) => {
    await opened(page)
    await page.getByRole("radio", { name: "Ride along" }).check()
    await page.getByLabel("Planet to ride with").selectOption("Mars")
    await expect(page.getByText("Riding along with Mars")).toBeVisible()
    await page.waitForTimeout(1200)
    await page.getByRole("radio", { name: "1 month per second" }).check()
    const mars = await label(page, "Mars").boundingBox()
    const sun = await label(page, "Sun").boundingBox()
    await page.waitForTimeout(1500)
    const marsAfter = await label(page, "Mars").boundingBox()
    const sunAfter = await label(page, "Sun").boundingBox()
    if (mars === null || sun === null || marsAfter === null || sunAfter === null) throw new Error("Expected boxes")
    expect(Math.hypot(marsAfter.x - mars.x, marsAfter.y - mars.y)).toBeLessThan(12)
    expect(Math.hypot(sunAfter.x - sun.x, sunAfter.y - sun.y)).toBeGreaterThan(12)
  })

  test("riding along changes no number", async ({ page }) => {
    await opened(page)
    const before = await classroom(page).getByRole("table").textContent()
    await page.getByRole("radio", { name: "Ride along" }).check()
    await expect(classroom(page).getByRole("table")).toHaveText(before ?? "")
  })

  test("enlarged sizes are off at first, and label themselves when on", async ({ page }) => {
    await opened(page)
    const badge = stage(page).locator("p[data-badge]")
    const checkbox = page.getByRole("checkbox", { name: /Show planet sizes/ })
    await expect(checkbox).not.toBeChecked()
    await expect(badge).toBeHidden()
    const dots = await stage(page).screenshot()
    await checkbox.check()
    await expect(badge).toContainText("Not to scale")
    await expect(badge).toContainText("Distances are still true")
    await expect(badge).toContainText(/planets drawn [\d,]+ times too big, the Sun [\d,]+ times/)
    await expect.poll(async () => (await stage(page).screenshot()).equals(dots)).toBe(false)
    await checkbox.uncheck()
    await expect(badge).toBeHidden()
  })

  test("the enlargement changes as you zoom, so that the label stays true", async ({ page }) => {
    await opened(page)
    await page.getByRole("checkbox", { name: /Show planet sizes/ }).check()
    const badge = stage(page).locator("p[data-badge]")
    await expect(badge).toContainText("Not to scale")
    const wide = await badge.textContent()
    await page.getByRole("radio", { name: "Inner planets" }).check()
    await expect.poll(() => badge.textContent()).not.toBe(wide)
  })
})

test.describe("following a planet's light", () => {
  test("choosing a planet names its light time, and choosing it again clears the path", async ({ page }) => {
    await opened(page)
    const mars = classroom(page).getByRole("button", { name: "Mars", exact: true })
    await mars.click()
    await expect(mars).toHaveAttribute("aria-pressed", "true")
    await expect(page.locator("[data-hero]")).toContainText("Light from Mars takes this long")
    await mars.click()
    await expect(mars).toHaveAttribute("aria-pressed", "false")
  })
})

test.describe("the buttons in the explanation", () => {
  test("set up the view they describe and bring it back on screen", async ({ page }) => {
    await opened(page)
    const button = page.getByRole("button", { name: "Watch Mercury hurry" })
    await button.scrollIntoViewIfNeeded()
    await button.click()
    await expect(page.getByRole("radio", { name: "Inner planets" })).toBeChecked()
    await expect(page.getByRole("radio", { name: "1 week per second" })).toBeChecked()
    await expect(stage(page)).toBeInViewport()
  })
})

test.describe("a full-screen stage must not trap anyone", () => {
  test("a plain wheel scrolls the page and leaves the zoom alone", async ({ page }) => {
    await opened(page)
    await stage(page).hover()
    await page.mouse.wheel(0, 600)
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100)
  })

  test("a vertical swipe scrolls the page on a touch screen", async ({ page }) => {
    await opened(page)
    const touch = await stage(page).locator("canvas[data-sky]").evaluate((canvas) => getComputedStyle(canvas).touchAction)
    expect(touch).toBe("pan-y")
  })

  test("the arrow keys turn the view, and plus and minus zoom", async ({ page }) => {
    await opened(page)
    const canvas = stage(page).locator("canvas[data-sky]")
    await canvas.focus()
    const before = await stage(page).screenshot()
    await page.keyboard.press("ArrowRight")
    await expect.poll(async () => (await stage(page).screenshot()).equals(before)).toBe(false)
    await expect(label(page, "Mercury")).toBeHidden()
    for (let press = 0; press < 22; press += 1) await page.keyboard.press("+")
    await expect(label(page, "Mercury")).toBeVisible()
    expect(await page.evaluate(() => scrollY)).toBe(0)
  })
})

test.describe("phones and small laptops", () => {
  for (const [name, width, height] of [["a phone", 390, 844], ["a small phone", 320, 568], ["a tablet", 820, 1180], ["a small laptop", 1024, 600]] as const) {
    test(`on ${name}, the page does not scroll sideways and the controls can be reached`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await opened(page)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      await expect(page.getByRole("button", { name: /Run time at/ })).toBeInViewport()
      await expect(page.getByRole("button", { name: "Right now" })).toBeInViewport()
      await expect(timeline(page)).toBeInViewport()
    })
  }
})

test.describe("a reader's own font", () => {
  // The body text uses the system's font, and some are far wider than others. The narrowest phone with a
  // wide font is the hardest case, and a machine with a narrower default would otherwise never see it.
  test("a wide font still fits the narrowest phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await opened(page)
    await page.addStyleTag({
      content: `body { --text: "DejaVu Sans", Verdana, sans-serif; }
        body, table, th, td, button, p, li { font-family: "DejaVu Sans", Verdana, sans-serif; }`,
    })
    await page.waitForTimeout(200)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe("every learner can use the new controls", () => {
  test("the page passes axe with time running, riding along, and sizes showing", async ({ page }) => {
    await opened(page)
    await page.getByRole("radio", { name: "Ride along" }).check()
    await page.getByRole("checkbox", { name: /Show planet sizes/ }).check()
    await classroom(page).getByRole("button", { name: "Mars", exact: true }).click()
    await page.getByRole("radio", { name: "1 month per second" }).check()
    // Controls fade in as the page opens, and a control mid-fade is not what a learner ends up reading.
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.effect?.getComputedTiming().iterations === Infinity || animation.playState === "finished" || animation.timeline !== document.timeline),
    )
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })

  test("the timeline announces a date, not a count of days", async ({ page }) => {
    await opened(page)
    await expect(timeline(page)).toHaveAttribute("aria-valuetext", /June 1, 2026/)
  })

  test("the speed steps keep their full names", async ({ page }) => {
    await opened(page)
    for (const name of ["1 day per second", "1 week per second", "1 month per second", "1 year per second"]) {
      await expect(page.getByRole("radio", { name, exact: true })).toBeAttached()
    }
  })
})

test.describe("privacy", () => {
  test("the page calls no other site, so that a school network sees only this one", async ({ page, baseURL }) => {
    const hosts = new Set<string>()
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (url.protocol.startsWith("http")) hosts.add(url.host)
    })
    await opened(page)
    await page.waitForTimeout(300)
    expect([...hosts]).toEqual([new URL(baseURL ?? "").host])
  })
})
