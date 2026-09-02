import { defineConfig } from "vitest/config";
import { transformWithOxc } from "vite";

// Tests that spawn the compiled native helper, the generators, or another
// Node process. `npm run test:fast` skips them for the inner loop; `check`
// and CI run both projects.
const integrationTests = [
  "test/build-pipeline.test.ts",
  "test/health-diagnostics.test.ts",
  "test/keypad-profiles.test.ts",
  "test/model-dial.acceptance.test.ts",
  "test/native-*.test.ts",
  "test/physical-input.acceptance.test.ts",
  "test/plan-mode.acceptance.test.ts",
  "test/profile-installer.test.ts",
  "test/ptt-guard.test.ts",
  "test/reasoning-dial.acceptance.test.ts",
];

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
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/**/*.test.ts"],
          exclude: integrationTests,
        },
      },
      {
        extends: true,
        test: { name: "integration", include: integrationTests },
      },
    ],
  },
});
