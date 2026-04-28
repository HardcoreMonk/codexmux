import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build artifacts
    "bin/**",
    "build-resources/**",
    "dist/**",
    "dist-electron/**",
    "electron/**",
    "release/**",
    "scripts/**",
    "android/.gradle/**",
    "android/**/build/**",
    "android/app/src/main/assets/**",
    "android/capacitor-cordova-android-plugins/**",
    // Landing site (Eleventy / CJS, separate build)
    "landing-src/**",
    "eleventy.config.js",
    "_site/**",
  ]),
]);

export default eslintConfig;
