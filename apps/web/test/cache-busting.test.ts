import { readdirSync, readFileSync } from "node:fs"
import { assert, describe, it } from "@effect/vitest"

/**
 * A deployed file with a fixed name is cached for a year, so a change to it would never reach a visitor.
 * Vite names a file after its contents only when it can see the file: a relative url() in a stylesheet,
 * not an absolute one, which it leaves to `public/` untouched.
 */
const STYLE_DIRS = ["../src/styles/", "../src/ui/"]

const stylesheets = STYLE_DIRS.flatMap((dir) =>
  readdirSync(new URL(dir, import.meta.url))
    .filter((name) => name.endsWith(".css"))
    .map((name) => ({ name, text: readFileSync(new URL(`${dir}${name}`, import.meta.url), "utf8") })),
)

const urls = stylesheets.flatMap(({ name, text }) =>
  [...text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((match) => ({ name, url: match[1] ?? "" })),
)

describe("files a stylesheet points to", () => {
  it("are found", () => {
    assert.isAbove(urls.length, 0)
  })

  it("are relative, so that the build names each one after its contents", () => {
    const fixed = urls.filter(({ url }) => url.startsWith("/") || url.includes("://"))
    assert.deepStrictEqual(fixed, [])
  })

  it("leave no font in public/, where its name could not change", () => {
    const fonts = readdirSync(new URL("../public/fonts/", import.meta.url)).filter((name) => name.endsWith(".woff2"))
    assert.deepStrictEqual(fonts, [])
  })
})
