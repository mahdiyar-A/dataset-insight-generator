import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Lint runs as a CI gate, so the severity levels here decide what blocks a merge.
 *
 * The line: errors are things that break at runtime or in a production build.
 * Style and typing debt is a warning — visible in CI output, but it does not
 * stop a correctness fix from shipping. Anything downgraded below is annotated
 * with why and what it would take to promote it back to an error.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "next-env.d.ts",
  ]),

  {
    // ── Enforced ───────────────────────────────────────────────────────────
    // Every .tsx page and lib module now type-checks clean under `tsc --noEmit`
    // and API response shapes live in lib/types.ts. These are errors so the
    // suppressions cannot creep back in.
    rules: {
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-explicit-any": "error",

      // ── Still warnings ───────────────────────────────────────────────────
      // Flags setState inside useEffect. The existing usages are deliberate
      // (animation phase transitions, derived state from async loads) and are
      // not causing render loops. Kept visible so new occurrences get reviewed.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",

      // Cosmetic: unescaped apostrophes in copy. Renders correctly.
      "react/no-unescaped-entities": "warn",
    },
  },

  {
    // .jsx files are not type-checked by tsc, so a @ts-nocheck banner in one is
    // a no-op left over from when these components were .tsx. Their props are
    // typed with JSDoc instead, which .tsx callers do see.
    files: ["**/*.jsx", "**/*.js"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
