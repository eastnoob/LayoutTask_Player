import { resolve } from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        experiment: resolve(__dirname, "experiment/index.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "**/.worktrees/**"],
    globals: false,
  },
});
