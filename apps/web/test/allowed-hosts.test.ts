import { assert, describe, it } from "@effect/vitest"
import { parseAllowedHosts } from "../src/config/allowed-hosts.js"

describe("parseAllowedHosts", () => {
  it("adds nothing when unset, which leaves Vite allowing only localhost and IP addresses", () => {
    assert.deepStrictEqual(parseAllowedHosts(undefined), [])
    assert.deepStrictEqual(parseAllowedHosts(""), [])
  })

  it("reads one host", () => {
    assert.deepStrictEqual(parseAllowedHosts("class.example.test"), ["class.example.test"])
  })

  it("reads a comma-separated list, ignoring spaces and stray commas", () => {
    assert.deepStrictEqual(parseAllowedHosts(" a.example.test, b.example.test ,,"), [
      "a.example.test",
      "b.example.test",
    ])
  })

  it("keeps a leading dot, which Vite reads as a domain and all its subdomains", () => {
    assert.deepStrictEqual(parseAllowedHosts(".example.test"), [".example.test"])
  })
})
