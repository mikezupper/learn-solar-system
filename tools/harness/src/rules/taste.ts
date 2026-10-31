import type { TextFile, Violation } from "./violation.js"

const MAX_LINES = 400

interface Rule {
  readonly rule: string
  readonly appliesTo: RegExp
  readonly finds: RegExp
  readonly message: string
  readonly fix: string
}

const VIEWS = /^apps\/web\/(src\/ui\/[^/]+\.ts|[^/]+\.html)$/
const STYLES = /\.css$/
const SCRIPTS = /(^|\/)package\.json$|\.sh$|\.ya?ml$/

const RULES: ReadonlyArray<Rule> = [
  {
    rule: "semantic-markup",
    appliesTo: VIEWS,
    finds: /\sclass=|\sstyle=|<div\b|<span\b/,
    message: "Markup carries no class, style, div or span; an element is chosen for what it means.",
    fix: "Use the specific element for this content (see skills/semantic-html-skill/skills.md) and style it by element or attribute.",
  },
  {
    rule: "css-logical",
    appliesTo: STYLES,
    finds:
      /\b(?:margin|padding|border)-(?:left|right|top|bottom)\b|\btext-align:\s*(?:left|right)\b|(?:^|[\s;{])(?:(?:min-|max-)?(?:width|height)|left|right|top|bottom)\s*:/m,
    message: "Physical CSS properties break for right-to-left readers.",
    fix: "Use logical properties: inline-size, block-size, margin-inline-start, inset-inline-start, text-align: start.",
  },
  {
    rule: "css-color",
    appliesTo: STYLES,
    finds: /:\s*[^;{}]*(?:#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\()/,
    message: "Colors are written in oklch, so lightness stays even across hues.",
    fix: "Rewrite the color with oklch(), ideally as a token in the tokens layer.",
  },
  {
    rule: "css-important",
    appliesTo: STYLES,
    finds: /!important/,
    message: "!important overrides the cascade layers that settle precedence here.",
    fix: "Move the rule to a later @layer.",
  },
  {
    rule: "plain-document",
    appliesTo: /^apps\/web\/about-the-data\.html$/,
    finds: /<style\b|<link[^>]+stylesheet|<script\b/,
    message: "The data page is a plain semantic document: no stylesheet and no script.",
    fix: "Remove it. The page must read correctly with the browser's defaults.",
  },
  {
    rule: "pattern-kill",
    appliesTo: SCRIPTS,
    finds: /pkill\s+-f/,
    message: "pkill -f matches the shell that runs it, so a script can kill itself.",
    fix: "Stop the process by its PID, or let the Effect scope that started it stop it.",
  },
]

const isSource = (path: string): boolean => /^(apps|packages|tools)\/.*\.(ts|css)$/.test(path)

export const checkTaste = (files: ReadonlyArray<TextFile>): ReadonlyArray<Violation> =>
  files.flatMap(({ path, text }) => [
    ...(isSource(path) && text.trimEnd().split("\n").length > MAX_LINES
      ? [
          {
            rule: "file-length",
            file: path,
            message: `Longer than ${String(MAX_LINES)} lines, which crowds out the task in an agent's context.`,
            fix: "Split it along a real seam in the behavior, not at an arbitrary line.",
          },
        ]
      : []),
    ...RULES.filter((rule) => rule.appliesTo.test(path) && rule.finds.test(text)).map(
      ({ rule, message, fix }): Violation => ({ rule, file: path, message, fix }),
    ),
  ])
