# Frontend

- **Status:** accepted · **Verified:** 2026-10-31

## How the three standards fit together

| Standard | Applies to |
|---|---|
| Gyral | Every component: model, intents, one pure reducer per message, commands for effects |
| Semantic HTML | All markup. `about-the-data.html` follows the skill literally: no CSS, no script |
| Modern CSS | The app's styling, in cascade layers, selected by element and attribute |

The semantic-HTML skill forbids CSS, and the modern-CSS skill exists to write it. Both hold here because
they govern different things: markup never carries `class`, `style`, `div` or `span`, and styles reach it
through element selectors. Shadow DOM keeps those selectors safe inside the stage. The one page that is a
pure document has no CSS at all.

## Rules

- Page content uses light DOM (`shadow: false`), so that crawlers and the document stylesheet reach it.
- A widget with a lifecycle gets its own element. `sky-stage` takes one property, `view`, and reports
  through `gyral-output` events that the page decodes with `Schema`. `moment-clock` runs the date between the page's ticks,
  because redrawing the whole page that often would be wasteful.
- A component never imports the stage or the Effect runtime. It names driver tokens from
  `runtime/tokens.ts`, so model tests run in Node in milliseconds.
- Check accessibility with axe, and confirm the scan reached the content. The page is dark only, and the tests still run in
  both color schemes, so that a reader's preference cannot break it.
- Stylesheets are linked from `index.html`, never imported from JavaScript. On the dev server an imported stylesheet arrives
  only after every module has loaded, so the browser paints the bare HTML first.
- Layouts start from a phone, and each larger screen adds to it. A screen class depends on height as well as width, so that a
  phone a few pixels taller cannot get a worse layout. `apps/web/e2e/layered-ui.spec.ts` holds a minimum share of sky at each.
- Controls exist once. `popover` makes them a sheet on a phone, and `display: contents` hands them to the bar on anything larger.
- A control that looks unusual stays a real form control underneath: the speed steps are radio buttons, the timeline a range.
- The explanation below the live view is static HTML in `index.html`, so that it reads with no script. A number
  stated there needs a test in `apps/web/test/explanation.test.ts`.

## The writing brief

Every sentence in this repository follows
[the sense-of-style skill](../skills/sense-of-style-writing-skill/SKILL.md).

| Writing | Category | Reader | They should be able to |
|---|---|---|---|
| `apps/web/src/ui/copy.ts`, `index.html`, `about-the-data.html` | Explanatory and educational | A student or teacher with no astronomy background | Explain what they see, and know where the explanation stops |
| Everything under `docs/`, code comments, lint messages | Technical documentation | A coding agent or a maintainer new to the repository | Find the fact and act correctly |

For learners: start from what they can see, define a term where it first matters, and say what the page
does not show. For agents: exact names, commands and units; a comment explains why, never what. Do not
claim a command works unless it has been run.
