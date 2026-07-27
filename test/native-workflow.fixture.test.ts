import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { encodeNativePayload } from "../src/lib/codex-ui-control.js";
import { KEYCAP_WORKFLOWS } from "../src/lib/keycap-workflows.js";
import { WORKFLOWS } from "../src/lib/workflows.js";

const native = resolve(
  "com.todd.streamdeckcodex.sdPlugin/bin/codex-ui-control",
);

type WorkflowState = Record<string, boolean>;
const validWorkflowState: WorkflowState = {
  uniqueFreshWitness: true,
  taskIdWasNew: true,
  databaseIdentityStable: true,
  canonicalCwdMatches: true,
  focusedWindowStable: true,
  uniqueComposer: true,
  draftMatches: true,
};

function fixture(state: WorkflowState): number | null {
  const result = spawnSync(
    native,
    ["--workflow-fixture", encodeNativePayload(state)],
    {
      encoding: "utf8",
    },
  );
  if (result.error) throw result.error;
  return result.status;
}

describe("native workflow postcondition fixture", () => {
  it("round-trips production request payloads through Foundation decoding", () => {
    const payloads = [...WORKFLOWS, ...KEYCAP_WORKFLOWS].map((workflow) =>
      encodeNativePayload({
        prompt: `${workflow.prompt} ? café ✅`,
        cwd: "/tmp/a path/?q=✓",
        databasePath: "/tmp/state.sqlite",
        sourceThreadId: "019f9c13-ce4e-7f01-bf9c-311e5262b4ce",
        paddingProbe: "x",
      }),
    );
    const route = encodeNativePayload({
      route: "new-chat",
      path: "/tmp/東京?x=1",
      databasePath: "/tmp/state.sqlite",
    });
    expect(encodeNativePayload({ paddingProbe: "x" })).toMatch(/={1,2}$/);
    for (const payload of payloads) {
      expect(
        spawnSync(native, ["--payload-fixture", "workflow", payload], {
          encoding: "utf8",
        }).status,
      ).toBe(0);
    }
    expect(
      spawnSync(native, ["--payload-fixture", "route", route], {
        encoding: "utf8",
      }).status,
    ).toBe(0);
  });

  it("redacts reversible workflow payloads from native failures", () => {
    const secret = "prompt /private/cwd.sqlite ? café";
    const result = spawnSync(native, ["workflow", secret], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain(secret);
    expect(JSON.parse(result.stdout)).toMatchObject({ reasonCode: "UNKNOWN" });
    expect(JSON.parse(result.stdout).requested).toBeUndefined();
  });

  it("finds a current witness after large noise and at a chunk boundary", () => {
    const run = (scenario: string) =>
      spawnSync(native, ["--current-witness-fixture", scenario], {
        encoding: "utf8",
      }).status;
    expect(run("large-noise")).toBe(0);
    expect(run("split-boundary")).toBe(0);
    expect(run("no-event-within-cap")).toBe(1);
  });

  it("fails closed for command postcondition divergences", () => {
    const run = (state: Record<string, unknown>) =>
      spawnSync(native, ["--dispatch-fixture", encodeNativePayload(state)], {
        encoding: "utf8",
      }).status;
    expect(run({ markerBefore: 1, markerAfter: 2 })).toBe(0);
    expect(run({ markerBefore: 1, markerAfter: 1 })).toBe(1);
    expect(
      run({
        sameComposer: true,
        draftIsEmpty: true,
        messagesBefore: 0,
        messagesAfter: 1,
      }),
    ).toBe(0);
    expect(
      run({
        sameComposer: false,
        draftIsEmpty: true,
        messagesBefore: 0,
        messagesAfter: 1,
      }),
    ).toBe(1);
    expect(
      run({
        sameComposer: true,
        draftIsEmpty: true,
        messagesBefore: 0,
        messagesAfter: 0,
      }),
    ).toBe(1);
    expect(run({ pendingRemains: false })).toBe(0);
    expect(run({ pendingRemains: true })).toBe(1);
    expect(run({ sidebarBefore: true, sidebarAfter: false })).toBe(0);
    expect(run({ sidebarBefore: true, sidebarAfter: true })).toBe(1);
    expect(run({ sidebarBefore: true })).toBe(1);
  });
  it("accepts only the connected fresh-task proof", () => {
    expect(existsSync(native)).toBe(true);
    expect(fixture(validWorkflowState)).toBe(0);
  });

  it("forces a stubborn SQLite probe through SIGKILL and reaps it", () => {
    const result = spawnSync(native, ["--sqlite-timeout-fixture"], {
      encoding: "utf8",
      timeout: 2_000,
    });
    if (result.error) throw result.error;
    expect(result.status).toBe(0);
  });

  it("queries a real readonly SQLite snapshot including archived IDs", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "codex-sqlite-"));
    const database = resolve(directory, "state.sqlite");
    try {
      const setup = spawnSync("/usr/bin/sqlite3", [
        database,
        "CREATE TABLE threads (id TEXT, cwd TEXT, archived INTEGER); INSERT INTO threads VALUES ('aaaaaaaaaaaaaaaa', '/tmp/active', 0), ('bbbbbbbbbbbbbbbb', '/tmp/archived', 1);",
      ]);
      expect(setup.status).toBe(0);
      const directProbe = spawnSync(
        "/usr/bin/sqlite3",
        [
          "-readonly",
          "-noheader",
          realpathSync(database),
          "SELECT id FROM threads;",
        ],
        { encoding: "utf8" },
      );
      expect(directProbe.status).toBe(0);
      const observed = spawnSync(
        native,
        ["--sqlite-fixture", realpathSync(database)],
        { encoding: "utf8" },
      );
      expect(observed.stdout).toContain("SQLite fixture accepted");
      expect(observed.status).toBe(0);
      expect(
        spawnSync(native, ["--sqlite-fixture", "/tmp/missing.sqlite"]).status,
      ).toBe(1);
      const corrupt = resolve(directory, "corrupt.sqlite");
      writeFileSync(corrupt, "not a sqlite database");
      expect(
        spawnSync(native, ["--sqlite-fixture", realpathSync(corrupt)]).status,
      ).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reads actual temporary log bytes through the backward witness scanner", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "codex-log-"));
    const log = resolve(directory, "desktop.log");
    const event = (id: string) =>
      `thread_stream_view_activity_changed active=true conversationId=${id} rendererWindowId=window-${id} rendererWindowAppearance=primary rendererWindowFocused=true`;
    const run = (text: string, existingThreadIds: string[] = []) => {
      writeFileSync(log, text);
      return spawnSync(
        native,
        [
          "--log-fixture",
          encodeNativePayload({
            path: realpathSync(log),
            threadId: "new-task",
            existingThreadIds,
          }),
        ],
        { encoding: "utf8" },
      ).status;
    };
    try {
      expect(run(event("new-task"))).toBe(0);
      expect(run(`${event("new-task")}\n${event("other-task")}`)).toBe(1);
      expect(run(event("new-task"), ["new-task"])).toBe(1);
      const split = event("new-task");
      expect(run(`${"noise\n".repeat(10)}${split}`)).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("requires route-specific Skills presentation, not a persistent sidebar button", () => {
    const run = (scenario: string): number | null => {
      const result = spawnSync(native, ["--route-fixture", scenario], {
        encoding: "utf8",
      });
      if (result.error) throw result.error;
      return result.status;
    };
    expect(run("skills-heading")).toBe(0);
    expect(run("skills-selected-tab")).toBe(0);
    expect(run("skills-sidebar-button")).toBe(1);
  });

  it("accepts only a Codex-owned Add Project picker delta", () => {
    const run = (scenario: string): number | null => {
      const result = spawnSync(native, ["--new-project-fixture", scenario], {
        encoding: "utf8",
      });
      if (result.error) throw result.error;
      return result.status;
    };
    expect(run("picker-appears")).toBe(0);
    expect(run("delayed-picker")).toBe(0);
    expect(run("unrelated-system-dialog")).toBe(1);
    expect(run("persistent-sidebar-label")).toBe(1);
    expect(run("normal-codex-window")).toBe(1);
    expect(run("no-picker")).toBe(1);
    expect(run("timeout")).toBe(1);
  });

  it.each([
    { uniqueFreshWitness: false },
    { taskIdWasNew: false },
    { databaseIdentityStable: false },
    { canonicalCwdMatches: false },
    { focusedWindowStable: false },
    { uniqueComposer: false },
    { draftMatches: false },
  ])("fails closed for divergent workflow observer state", (change) => {
    expect(fixture({ ...validWorkflowState, ...change })).toBe(1);
  });
});
