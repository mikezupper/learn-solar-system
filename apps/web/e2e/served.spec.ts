import { expect, test } from "@playwright/test"

/**
 * Runs against the production image, where nginx sends the real headers, with E2E_BASE_URL naming a
 * running container. The page must work under its Content-Security-Policy: a style or script the
 * policy blocks would fail quietly, with no error a reader would see.
 */
test.skip(process.env.E2E_BASE_URL === undefined, "Needs a running production image: set E2E_BASE_URL")

declare global {
  interface Window {
    blockedByPolicy: Array<string>
  }
}

test("the page works under its Content-Security-Policy", async ({ page }) => {
  await page.addInitScript(() => {
    window.blockedByPolicy = []
    document.addEventListener("securitypolicyviolation", (event) => {
      const target = event.target instanceof Element ? event.target.localName : "document"
      // WebKit blocks an inline style inside its own parts for every <select> a script creates, even on
      // an empty page. That select looks and works exactly as it does with no policy, so this one report
      // is WebKit's, not the page's. Every other report fails the test.
      if (event.effectiveDirective === "style-src-attr" && target === "select") return
      window.blockedByPolicy.push(`${event.effectiveDirective} on ${target}, from ${event.sourceFile}:${String(event.lineNumber)}`)
    })
  })
  const response = await page.goto("/?at=2026-08-12T17:46:00Z")
  expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'")

  // The numbers in the deployment guide: the data arrived, and its hash matched.
  const mars = page.locator("solar-classroom").getByRole("row", { name: /^Mars\b/ })
  await expect(mars).toContainText("1.495")
  await expect(mars).toContainText("1.947")
  await expect(mars).toContainText("16.2")

  // On a phone the speeds and views wait in a sheet.
  const more = page.getByRole("button", { name: "More controls" })
  if (await more.isVisible()) await more.click()
  await page.getByRole("radio", { name: "Ride along" }).check()
  await page.getByRole("radio", { name: "1 month per second" }).check()
  await page.getByRole("checkbox", { name: /Show planet sizes/ }).check()
  await expect(page.locator("sky-stage p[data-badge]")).toContainText("Not to scale")

  const fonts = await page.evaluate(async () => {
    await document.fonts.ready
    return [...document.fonts].filter((font) => font.status === "loaded").map((font) => font.family)
  })
  expect(fonts).toEqual(expect.arrayContaining(["Unbounded", "Doto"]))
  expect(await page.evaluate(() => window.blockedByPolicy)).toEqual([])
})
