// Vite+ configuration: the org's standard check, lint and format settings.
// See nyuchi/.github/.github/workflows/reusable-vite-plus.yml.
import { defineConfig } from "vite-plus";

export default defineConfig({
  // `vp check` reads ONLY this block, not .oxfmtrc.json. These values mirror
  // nyuchi/.github/.oxfmtrc.json, which the org-required `vite-plus / fmt`
  // job uses on Markdown and JSON. Keep the two identical: two formatters
  // with different settings on one file can never both pass.
  fmt: {
    printWidth: 80,
    proseWrap: "preserve",
    tabWidth: 2,
    useTabs: false,
    endOfLine: "lf",
    trailingComma: "all",
    sortPackageJson: false,
    overrides: [
      {
        files: ["*.md", "*.mdx"],
        options: { embeddedLanguageFormatting: "off" },
      },
    ],
  },
  lint: {
    // scripts/extract.ts and the registry handlers it runs are not this
    // package's code: build-data.mjs bundles them INSIDE a mzizi-registry
    // checkout, where `@/` and `next/server` resolve. Type checking them here
    // can only report those imports as missing.
    ignorePatterns: ["scripts/extract.ts", "scripts/registry-handlers/**"],
    // Without typeCheck, `vp check` is oxlint only and passes type errors.
    options: { typeAware: true, typeCheck: true },
  },
  // Only this repo's tests — not the registry checkout under .registry/.
  test: { include: ["test/**/*.test.ts"] },
});
