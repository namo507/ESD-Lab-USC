/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
  settings: { react: { version: "18.3" } },
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:react/jsx-runtime",
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "react/prop-types": "off",
    "react-hooks/exhaustive-deps": "error",
    "no-console": "off",
  },
  overrides: [
    {
      // The 3D scene renders react-three-fiber elements (<mesh>, <group>,
      // <hemisphereLight>, …) whose props are three.js constructor arguments,
      // not DOM attributes. react/no-unknown-property only knows the DOM, so it
      // flags every one of them. The rule is switched off for these files
      // rather than globally, so real DOM typos are still caught everywhere else.
      files: ["src/components/buddy3d/**/*.tsx"],
      rules: { "react/no-unknown-property": "off" },
    },
  ],
  ignorePatterns: ["dist", "node_modules", ".eslintrc.cjs"],
};
