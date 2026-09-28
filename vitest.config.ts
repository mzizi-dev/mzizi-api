import { defineConfig } from "vitest/config";

// Only this repo's tests — not the registry checkout under .registry/.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
