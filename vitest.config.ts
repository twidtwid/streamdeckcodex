import { defineConfig } from "vitest/config";
import { transformWithOxc } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "test-legacy-action-decorators",
      enforce: "pre",
      async transform(code, id) {
        if (!id.includes("/src/actions/") || !id.endsWith(".ts")) return;
        return transformWithOxc(code, id, {
          lang: "ts",
          target: "es2023",
          decorator: { legacy: true },
        });
      },
    },
  ],
  test: {
    coverage: { enabled: false },
    environment: "node",
  },
});
