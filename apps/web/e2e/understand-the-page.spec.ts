import { expect, test, type Page } from "@playwright/test"

/** The acceptance tests in docs/product-specs/explain-the-page.md, run against a real build. */
const MOMENT = "2026-06-01T00:00:00Z"

/** The live component, as distinct from the tables and text in the page's explanation below it. */
const classroom = (page: Page) => page.locator("solar-classroom")

const EXPLANATION = [
  "What this page does",
  "How to use it",
  "How it works",
  "The science behind the page",
  "What this page leaves out",
  "Sources",
]

test.describe("a reader wants to understand the page", () => {
  test("it says what the page does, how to use it, how it works and what the science is", async ({ page }) => {
    await page.goto(`/?at=${MOMENT}`)
    for (const name of EXPLANATION) {
      await expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible()
    }
    for (const name of ["Choose what to show", "Make time run", "Show a class one moment", "Things to try", "How we know the numbers are right"]) {
      await expect(page.getByRole("heading", { level: 3, name })).toBeVisible()
    }
  })

  test("the list of contents reaches every section", async ({ page }) => {
    await page.goto(`/?at=${MOMENT}`)
    const contents = page.getByRole("navigation", { name: "On this page" })
    const places: ReadonlyArray<readonly [string, string]> = [
      ["What it does", "What this page does"],
      ["How to use it", "How to use it"],
      ["How it works", "How it works"],
      ["The science", "The science behind the page"],
      ["What it leaves out", "What this page leaves out"],
      ["Sources", "Sources"],
      ["Numbers", "The numbers behind the picture"],
    ]
    for (const [link, heading] of places) {
      await contents.getByRole("link", { name: link, exact: true }).click()
      await expect(page.getByRole("heading", { level: 2, name: heading, exact: true })).toBeInViewport()
    }
  })

  test("the live picture still comes first", async ({ page }) => {
    await page.goto(`/?at=${MOMENT}`)
    await expect(classroom(page).getByRole("table")).toBeVisible()
    const stage = await page.locator("sky-stage").boundingBox()
    const explanation = await page.getByRole("heading", { level: 2, name: "What this page does" }).boundingBox()
    if (stage === null || explanation === null) throw new Error("Expected boxes")
    expect(stage.y).toBeLessThan(explanation.y)
    expect(stage.y).toBeLessThan(page.viewportSize()?.height ?? 0)
  })

  test("the explanation stays when the planet data cannot load", async ({ page }) => {
    await page.route("**/tiles/catalog.json", (route) => route.fulfill({ status: 503 }))
    await page.goto("/")
    await expect(page.getByRole("alert")).toContainText("could not be loaded")
    await expect(page.getByRole("heading", { level: 2, name: "How it works" })).toBeVisible()
  })

  test("the example link opens the moment it names", async ({ page }) => {
    await page.goto(`/?at=${MOMENT}`)
    await page.getByRole("link", { name: "?at=2026-08-12T17:46:00Z" }).click()
    await expect(classroom(page).locator("time")).toHaveAttribute("datetime", "2026-08-12T17:46:00.000Z")
  })

  test("the buttons in the text are hidden when no script could answer them", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, ...(baseURL === undefined ? {} : { baseURL }) })
    const page = await context.newPage()
    await page.goto("/")
    await expect(page.getByRole("button", { name: "Watch Mercury hurry" })).toBeHidden()
    await context.close()
  })

  test("the math waits until a reader asks for it", async ({ page }) => {
    await page.goto(`/?at=${MOMENT}`)
    const formula = page.getByRole("math").first()
    await expect(formula).toBeHidden()
    await page.getByText("The math, for the curious").click()
    await expect(formula).toBeVisible()
  })

  test("on a phone, nothing makes the page scroll sideways", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/?at=${MOMENT}`)
    await expect(classroom(page).getByRole("table")).toBeVisible()
    await page.getByText("The math, for the curious").click()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test.describe("with JavaScript turned off", () => {
    test.use({ javaScriptEnabled: false })

    test("the explanation still reads, and says what is missing", async ({ page }) => {
      await page.goto("/")
      // Playwright's text matching skips <noscript> itself, so this reads the paragraph inside it.
      await expect(page.locator("noscript p")).toContainText("needs JavaScript")
      for (const name of EXPLANATION) {
        await expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible()
      }
    })
  })
})
