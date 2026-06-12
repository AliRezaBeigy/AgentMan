import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 30_000
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, ".")
    }
  }
})
