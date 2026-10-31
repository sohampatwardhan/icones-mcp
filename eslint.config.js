// `tsdoc/syntax` parses TypeScript with typescript-eslint. That parser imports
// the `typescript` package, which is the TypeScript 6 API (`@typescript/typescript6`).
// TypeScript 7.0 does not ship a compiler API. Compilation still uses the
// TypeScript 7 `tsc` binary from `@typescript/native`.
import tsdoc from "eslint-plugin-tsdoc";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.ts", "scripts/**/*.ts", "test/**/*.ts", "vitest.config.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
    plugins: {
      tsdoc,
    },
    rules: {
      "tsdoc/syntax": "error",
    },
  },
];
