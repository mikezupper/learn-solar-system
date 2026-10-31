import js from "@eslint/js"
import gyral from "@gyral/core/eslint"
import { defineConfig } from "eslint/config"
import tseslint from "typescript-eslint"

/**
 * The effect-fp skill's hard rules, made mechanical. Each message says what to do instead, because
 * the reader is usually an agent. Exceptions are narrow overrides by path below, with the reason,
 * and never inline `eslint-disable` comments.
 */
const NO_THROW = {
  selector: "ThrowStatement",
  message: "Return a tagged error through the Effect error channel instead of throwing.",
}
const NO_TRY = {
  selector: "TryStatement",
  message: "Use Effect.try or Effect.tryPromise once, at the interop edge, with a tagged error.",
}
const NO_ASYNC = {
  selector: "FunctionDeclaration[async=true], ArrowFunctionExpression[async=true], FunctionExpression[async=true]",
  message: "Write this with Effect.gen or Effect.fn instead of an async function.",
}
const NO_CONSOLE = {
  selector: "CallExpression[callee.object.name='console']",
  message: "Use Effect.log* so the line reaches telemetry with its span, or Console in a tool.",
}
const NO_ENV = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: "Read settings through Config, in the config layer.",
}
const NO_RUN = {
  selector: "CallExpression[callee.object.name='Effect'][callee.property.name=/^run/]",
  message: "Compose the Effect and let the one entry point run it. See apps/web/src/runtime/app-runtime.ts.",
}
const NO_CLOCK = {
  selector: "MemberExpression[object.name='Date'][property.name='now'], NewExpression[callee.name='Date'][arguments.length=0], MemberExpression[object.name='Math'][property.name='random']",
  message: "Take the time or randomness as an input, or through Clock and Random, so tests can control it.",
}
const NO_LET = {
  selector: "VariableDeclaration[kind='let']",
  message: "Use a const and a pure expression. A hot path may be listed in eslint.config.js with its reason.",
}
const NO_LOOP = {
  selector: "ForStatement, ForInStatement, ForOfStatement, WhileStatement, DoWhileStatement",
  message: "Use Array or Effect.forEach. A hot path may be listed in eslint.config.js with its reason.",
}
const NO_NULL = {
  selector: "Literal[raw='null']",
  message: "Model absence with Option<A>.",
}
const NO_CAST = {
  selector: "TSAsExpression:not([typeAnnotation.typeName.name='const'])",
  message: "Decode with Schema at the boundary, or fix the type. Do not cast.",
}

const APPLICATION = [NO_THROW, NO_TRY, NO_ASYNC, NO_CONSOLE, NO_ENV, NO_RUN, NO_CLOCK, NO_LET, NO_LOOP, NO_NULL, NO_CAST]
const without = (...removed) => APPLICATION.filter((rule) => !removed.includes(rule))

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.gyral/**",
      "**/coverage/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "skills/**",
      ".harness/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["eslint.config.js", "vitest.config.ts"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-restricted-syntax": ["error", ...APPLICATION],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "lodash", message: "Effect's data modules are the standard library here." },
            { name: "@effect/platform", message: "Effect 4 moved this into effect/http and effect." },
            { name: "@effect/schema", message: "Schema lives in effect." },
          ],
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      // Effect.fn generators may be empty of `yield*`, and Schema classes merge a type with a value.
      "require-yield": "off",
      "@typescript-eslint/no-redeclare": "off",
      "no-redeclare": "off",
      // Effect's Data and Schema tagged classes declare no members of their own.
      "@typescript-eslint/no-extraneous-class": "off",
      // Phase.Starting: {} is how Data.TaggedEnum spells a variant with no fields.
      "@typescript-eslint/no-empty-object-type": ["error", { allowObjectTypes: "always" }],
      // Effect's generators yield typed values that this rule cannot follow.
      "@typescript-eslint/no-unsafe-type-assertion": "off",
    },
  },
  {
    files: ["apps/web/src/ui/**/*.ts"],
    ...gyral.configs.recommended,
  },
  {
    // The hot path: runs per axis, per body, per frame, and must not allocate.
    files: ["packages/ephemeris/src/service/chebyshev.ts"],
    rules: { "no-restricted-syntax": ["error", ...without(NO_LET, NO_LOOP)] },
  },
  {
    // A DOM element with a canvas: its fields change by design, and the platform's APIs use null.
    files: ["apps/web/src/ui/stage.ts", "apps/web/src/ui/stage-scene.ts"],
    rules: { "no-restricted-syntax": ["error", ...without(NO_NULL, NO_CAST)] },
  },
  {
    // The edge where the page's facts enter, and the single place Effects run in a browser.
    files: ["apps/web/src/runtime/app-runtime.ts"],
    rules: { "no-restricted-syntax": ["error", ...without(NO_CLOCK)] },
  },
  {
    // Tests state facts directly and may fail loudly; Playwright and Vitest browser mode are async.
    files: ["**/test/**/*.ts", "**/e2e/**/*.ts"],
    rules: {
      "no-restricted-syntax": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/only-throw-error": "off",
    },
  },
  {
    // Build configuration runs on Node at the edge of the repository, not in the app.
    files: ["**/*.config.ts", "eslint.config.js"],
    rules: {
      "no-restricted-syntax": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
    },
  },
)
