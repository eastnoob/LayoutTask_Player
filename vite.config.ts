import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "protocol/**/*.test.ts", "tools/**/*.test.ts"],
  },
});
