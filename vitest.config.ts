import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    // Run test files sequentially to avoid database race conditions
    // (all integration tests share the same live database)
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Automatically restore all vi.spyOn mocks after each test to prevent
    // mock leakage between test files in sequential mode
    restoreMocks: true,
  },
});
