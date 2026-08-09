import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    // Next's build output and node_modules contain no tests and are slow to scan.
    exclude: ["node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["lib/**/*.{ts,tsx}", "app/**/*.{ts,tsx}", "components/**/*.jsx"],
    },
  },
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json.
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
