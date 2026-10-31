import { basename, dirname, join, normalize } from "node:path/posix"
import type { TextFile, Violation } from "./violation.js"

const MAX_AGENTS_LINES = 100
const MAX_AGE_DAYS = 30
const ROOTS = ["AGENTS.md", "ARCHITECTURE.md"]
const MILLIS_PER_DAY = 86_400_000

const withoutCode = (text: string): string =>
  text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "")

/** The repository paths a Markdown file links to. Web links and bare anchors are not paths. */
const linksIn = ({ path, text }: TextFile): ReadonlyArray<string> =>
  [...withoutCode(text).matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)]
    .map((match) => match[1] ?? "")
    .filter((link) => !/^[a-z]+:/i.test(link) && !link.startsWith("#"))
    .map((link) => normalize(join(dirname(path), link.split("#")[0] ?? "")))
    .map((link) => link.replace(/\/$/, ""))

const needsStatus = (path: string): boolean =>
  path.startsWith("docs/") &&
  path.endsWith(".md") &&
  basename(path) !== "index.md" &&
  !/^docs\/(generated|references|exec-plans)\//.test(path)

const reachableFrom = (
  frontier: ReadonlyArray<string>,
  byPath: ReadonlyMap<string, TextFile>,
  seen: ReadonlySet<string>,
): ReadonlySet<string> => {
  const next = frontier
    .flatMap((path) => {
      const page = byPath.get(path)
      return page === undefined ? [] : linksIn(page)
    })
    .filter((link) => !seen.has(link))
  return next.length === 0
    ? seen
    : reachableFrom([...new Set(next)], byPath, new Set([...seen, ...next]))
}

/** `otherFiles` lists the rest of the repository, so documents may link to source and skills. */
export const checkDocs = (
  pages: ReadonlyArray<TextFile>,
  otherFiles: ReadonlyArray<string> = [],
): ReadonlyArray<Violation> => {
  const byPath = new Map(pages.map((page) => [page.path, page]))
  const known = [...byPath.keys(), ...otherFiles]
  const exists = (link: string) =>
    known.some(
      (path) => path === link || path.startsWith(`${link}/`) || link.startsWith(`${path}/`),
    )
  const roots = ROOTS.filter((root) => byPath.has(root))
  const reached = reachableFrom(roots, byPath, new Set(roots))

  const tooLong = pages
    .filter(({ path, text }) => path === "AGENTS.md" && text.trimEnd().split("\n").length > MAX_AGENTS_LINES)
    .map(
      ({ path }): Violation => ({
        rule: "agents-length",
        file: path,
        message: `AGENTS.md is a map and must stay under ${String(MAX_AGENTS_LINES)} lines.`,
        fix: "Move the detail into a document under docs/ and link to it.",
      }),
    )
  const broken = pages.flatMap((page) =>
    linksIn(page)
      .filter((link) => !exists(link))
      .map(
        (link): Violation => ({
          rule: "broken-link",
          file: page.path,
          message: `Links to ${link}, which does not exist.`,
          fix: "Correct the link, or restore the file if it should still exist.",
        }),
      ),
  )
  const unreachable = pages
    .filter(({ path }) => path.startsWith("docs/") && !reached.has(path))
    .map(
      ({ path }): Violation => ({
        rule: "unreachable-doc",
        file: path,
        message: "Nothing leads here from AGENTS.md, so an agent will never find it.",
        fix: "Link it from the nearest index.md, or delete it if it is obsolete.",
      }),
    )
  const unstamped = pages
    .filter(
      ({ path, text }) =>
        needsStatus(path) &&
        !(/\*\*Status:\*\*\s*\S+/.test(text) && /\*\*Verified:\*\*\s*\d{4}-\d{2}-\d{2}/.test(text)),
    )
    .map(
      ({ path }): Violation => ({
        rule: "missing-status",
        file: path,
        message: "A design document must say whether it is current, and when someone last checked.",
        fix: 'Add a line near the top: "- **Status:** accepted · **Verified:** YYYY-MM-DD".',
      }),
    )
  const misshapen = pages
    .filter(
      ({ path, text }) =>
        /^docs\/exec-plans\/(active|completed)\/.+\.md$/.test(path) &&
        !(text.includes("## Progress") && text.includes("## Decision log")),
    )
    .map(
      ({ path }): Violation => ({
        rule: "plan-shape",
        file: path,
        message: "An execution plan must record its progress and its decisions.",
        fix: 'Add "## Progress" and "## Decision log" sections. See docs/PLANS.md.',
      }),
    )
  return [...tooLong, ...broken, ...unreachable, ...unstamped, ...misshapen]
}

/** Finds documents nobody has re-checked recently. Stale guidance misleads more than no guidance. */
export const checkFreshness = (
  pages: ReadonlyArray<TextFile>,
  todayIso: string,
): ReadonlyArray<Violation> =>
  pages.flatMap(({ path, text }) => {
    const verified = /\*\*Verified:\*\*\s*(\d{4}-\d{2}-\d{2})/.exec(text)?.[1]
    if (verified === undefined) return []
    const ageDays = (Date.parse(todayIso) - Date.parse(verified)) / MILLIS_PER_DAY
    return ageDays > MAX_AGE_DAYS
      ? [
          {
            rule: "stale-doc",
            file: path,
            message: `Last verified ${verified}, more than ${String(MAX_AGE_DAYS)} days ago.`,
            fix: "Compare the document with the code, correct it, and update the date. Mark it superseded if it no longer applies.",
          },
        ]
      : []
  })
