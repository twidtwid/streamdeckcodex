import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../src/lib/commands.js";
import { KEYCAP_WORKFLOWS } from "../src/lib/keycap-workflows.js";

const manifest = JSON.parse(
  readFileSync(
    resolve("com.todd.streamdeckcodex.sdPlugin/manifest.json"),
    "utf8",
  ),
) as {
  Actions: Array<{
    UUID: string;
    Controllers?: string[];
    Encoder?: { layout?: string };
    Icon: string;
    VisibleInActionsList?: boolean;
  }>;
  Author: string;
  Category: string;
  CategoryIcon: string;
  Icon: string;
  Nodejs: { Version: string };
  Profiles: Array<{ DeviceType: number }>;
  SDKVersion: number;
  SupportURL: string;
  URL: string;
};
const profile = JSON.parse(
  readFileSync(
    resolve("profile-src/streamdeckcodex-plus/manifest.json"),
    "utf8",
  ),
) as {
  Device: { Model: string };
  InstalledByPluginUUID: string;
  Pages: { Current: string; Default: string; Pages: string[] };
};
const profileContract = JSON.parse(
  readFileSync(resolve("profile-src/profile-contract.json"), "utf8"),
) as { pages: Array<{ id: string; keys: unknown[] }> };
const curatedPageIds = profileContract.pages.slice(2).map((page) => page.id);
const curatedKeyCount = profileContract.pages
  .slice(2)
  .reduce((count, page) => count + page.keys.length, 0);
const agentPage = JSON.parse(
  readFileSync(
    resolve(
      "profile-src/streamdeckcodex-plus/Profiles/0D4C7F4C-666D-46B1-A787-7F2ABE2E12F0/manifest.json",
    ),
    "utf8",
  ),
) as {
  Name: string;
  Controllers: Array<{
    Type: string;
    Actions: Record<
      string,
      { Name: string; Settings: Record<string, unknown>; UUID: string }
    >;
  }>;
};
const commandPage = JSON.parse(
  readFileSync(
    resolve(
      "profile-src/streamdeckcodex-plus/Profiles/95B6205B-6011-4D73-8C91-B78957110300/manifest.json",
    ),
    "utf8",
  ),
) as typeof agentPage;

describe("Stream Deck manifest", () => {
  it("targets SDK 3, Node 24, and every supported Stream Deck family", () => {
    expect(manifest.SDKVersion).toBe(3);
    expect(manifest.Nodejs.Version).toBe("24");
    expect(
      manifest.Profiles.map((profile) => profile.DeviceType).sort(
        (left, right) => left - right,
      ),
    ).toEqual([0, 1, 2, 7, 9]);
  });

  it("declares the complete companion surface", () => {
    const ids = manifest.Actions.map((action) => action.UUID);
    expect(ids).toEqual(
      expect.arrayContaining([
        "com.todd.streamdeckcodex.agent-status",
        "com.todd.streamdeckcodex.approval-mode",
        "com.todd.streamdeckcodex.command",
        "com.todd.streamdeckcodex.workflow",
        "com.todd.streamdeckcodex.model",
        "com.todd.streamdeckcodex.reasoning",
        "com.todd.streamdeckcodex.agent-navigator",
        "com.todd.streamdeckcodex.usage",
        "com.todd.streamdeckcodex.context",
        "com.todd.streamdeckcodex.health",
      ]),
    );
    expect(ids).not.toContain("com.todd.streamdeckcodex.session-navigation");
    expect(
      manifest.Actions.find(
        ({ UUID }) => UUID === "com.todd.streamdeckcodex.keycap",
      )?.VisibleInActionsList,
    ).toBe(false);
  });

  it("ships Marketplace-compliant metadata and action-list artwork", () => {
    expect(manifest.Author).toBe("Todd Dailey");
    expect(manifest.Category).toBe("Codex Companion");
    expect(manifest.SupportURL).toBe(
      "https://github.com/twidtwid/streamdeckcodex/issues",
    );
    expect(manifest.URL).toBe("https://github.com/twidtwid/streamdeckcodex");

    const pluginIcon = readFileSync(
      resolve(`com.todd.streamdeckcodex.sdPlugin/${manifest.Icon}.png`),
    );
    const pluginIcon2x = readFileSync(
      resolve(`com.todd.streamdeckcodex.sdPlugin/${manifest.Icon}@2x.png`),
    );
    expect([pluginIcon.readUInt32BE(16), pluginIcon.readUInt32BE(20)]).toEqual([
      256, 256,
    ]);
    expect([
      pluginIcon2x.readUInt32BE(16),
      pluginIcon2x.readUInt32BE(20),
    ]).toEqual([512, 512]);

    const listIcons = [
      manifest.CategoryIcon,
      ...new Set(manifest.Actions.map((entry) => entry.Icon)),
    ];
    for (const icon of listIcons) {
      const svg = readFileSync(
        resolve(`com.todd.streamdeckcodex.sdPlugin/${icon}.svg`),
        "utf8",
      );
      expect(svg, icon).toContain('stroke="#FFFFFF"');
      expect(svg, icon).not.toContain('fill="#07090C"');
      expect(svg, icon).not.toContain("<linearGradient");
    }
  });

  it("uses a full-width fixed-size Action dial layout", () => {
    const command = manifest.Actions.find(
      ({ UUID }) => UUID === "com.todd.streamdeckcodex.command",
    );
    expect(command?.Encoder?.layout).toBe("layouts/command.json");
    const layout = JSON.parse(
      readFileSync(
        resolve("com.todd.streamdeckcodex.sdPlugin/layouts/command.json"),
        "utf8",
      ),
    );
    expect(
      layout.items.find(({ key }: { key: string }) => key === "title"),
    ).toMatchObject({
      rect: [16, 10, 136, 24],
      alignment: "left",
      font: { size: 16, weight: 600 },
    });
    expect(
      layout.items.find(({ key }: { key: string }) => key === "value"),
    ).toMatchObject({
      rect: [8, 36, 184, 36],
      font: { size: 20, weight: 750 },
      "text-overflow": "fade",
    });
  });

  it("ships an editable Stream Deck Plus profile source", () => {
    expect(profile.Device.Model).toBe("20GBD9901");
    expect(profile.InstalledByPluginUUID).toBe("com.todd.streamdeckcodex");
    expect(profile.Pages.Pages).toHaveLength(7);
    expect(profile.Pages.Current).toBe(profile.Pages.Pages[0]);
    expect(profile.Pages.Pages).not.toContain(profile.Pages.Default);
    expect(
      existsSync(
        resolve(
          `profile-src/streamdeckcodex-plus/Profiles/${profile.Pages.Default}`,
        ),
      ),
    ).toBe(true);
    expect(profile.Pages.Pages).toEqual(
      profileContract.pages.map((page) => page.id),
    );
  });

  it("ships every functional key across five coherent pages", () => {
    const keycapLabels = curatedPageIds.flatMap((pageId) => {
      const page = JSON.parse(
        readFileSync(
          resolve(
            `profile-src/streamdeckcodex-plus/Profiles/${pageId}/manifest.json`,
          ),
          "utf8",
        ),
      ) as typeof agentPage;
      return Object.values(
        page.Controllers.find((controller) => controller.Type === "Keypad")!
          .Actions,
      );
    });
    expect(keycapLabels).toHaveLength(curatedKeyCount);
    expect(
      keycapLabels.every(
        (key) => key.UUID === "com.todd.streamdeckcodex.keycap",
      ),
    ).toBe(true);
    expect(keycapLabels.map((key) => key.Settings.label)).toEqual(
      expect.arrayContaining(["Branch info", "Run shell", "Skills", "Fix CI"]),
    );
    expect(keycapLabels.map((key) => key.Settings.icon)).not.toEqual(
      expect.arrayContaining(["context", "usage", "openai"]),
    );
    expect(
      keycapLabels.filter((key) => key.Settings.label === "Skills"),
    ).toHaveLength(1);
    expect(keycapLabels.some((key) => key.Settings.action === "info")).toBe(
      false,
    );
    expect(
      keycapLabels.every(
        (key) =>
          key.Name ===
          (key.Settings.description
            ? `${key.Settings.label} — ${key.Settings.description}`
            : key.Settings.label),
      ),
    ).toBe(true);
  });

  it("maps keycaps with established Codex semantics to the shared command path", () => {
    const keycaps = curatedPageIds.flatMap((pageId) => {
      const page = JSON.parse(
        readFileSync(
          resolve(
            `profile-src/streamdeckcodex-plus/Profiles/${pageId}/manifest.json`,
          ),
          "utf8",
        ),
      ) as typeof agentPage;
      return Object.values(
        page.Controllers.find((controller) => controller.Type === "Keypad")!
          .Actions,
      );
    });
    const actionFor = (label: string) =>
      keycaps.find((key) => key.Settings.label === label)?.Settings.action;

    expect(actionFor("Fast")).toBeUndefined();
    expect(actionFor("PR Review")).toBe("workflow:pr-review");
    expect(actionFor("Debug")).toBe("workflow:debug");
    expect(actionFor("Accept")).toBe("command:accept");
    expect(actionFor("Reject")).toBe("command:reject");
    expect(actionFor("Send")).toBe("command:send");
    expect(actionFor("Fix CI")).toBe("workflow:fix-ci");
    expect(actionFor("Explore")).toBe("workflow:explore");
    expect(actionFor("Analyze")).toBe("workflow:analyze");
    expect(actionFor("Browser")).toBe("command:browser");
    expect(actionFor("Files")).toBe("command:files");
    expect(actionFor("Side chat")).toBe("command:side-chat");
  });

  it("resolves every workflow and command key through an exact registry ID", () => {
    const workflowIds = new Set(
      KEYCAP_WORKFLOWS.map((workflow) => workflow.id),
    );
    const commandIds = new Set(COMMANDS.map((command) => command.id));
    const allKeycaps = [
      ...Object.values(
        agentPage.Controllers.find(
          (controller) => controller.Type === "Keypad",
        )!.Actions,
      ),
      ...curatedPageIds.flatMap((pageId) => {
        const page = JSON.parse(
          readFileSync(
            resolve(
              `profile-src/streamdeckcodex-plus/Profiles/${pageId}/manifest.json`,
            ),
            "utf8",
          ),
        ) as typeof agentPage;
        return Object.values(
          page.Controllers.find((controller) => controller.Type === "Keypad")!
            .Actions,
        );
      }),
    ].filter((key) => key.UUID === "com.todd.streamdeckcodex.keycap");

    for (const key of allKeycaps) {
      const action = String(key.Settings.action ?? "");
      if (action.startsWith("workflow:")) {
        expect(
          workflowIds.has(action.slice("workflow:".length)),
          key.Name,
        ).toBe(true);
      } else if (action.startsWith("command:")) {
        expect(commandIds.has(action.slice("command:".length)), key.Name).toBe(
          true,
        );
      } else {
        expect(action, key.Name).toBe("skills");
      }
    }
  });

  it("maps the primary page to six agents plus New Chat and Plan", () => {
    const actions = agentPage.Controllers.find(
      (controller) => controller.Type === "Keypad",
    )!.Actions;
    const values = Object.values(actions);

    expect(
      values.filter(
        (item) => item.UUID === "com.todd.streamdeckcodex.agent-status",
      ),
    ).toHaveLength(6);
    expect(actions["2,1"]).toMatchObject({
      Name: "New Chat",
      UUID: "com.todd.streamdeckcodex.command",
      Settings: {
        commandId: "new-chat",
      },
    });
    expect(actions["3,1"]).toMatchObject({
      Name: "Plan Mode",
      UUID: "com.todd.streamdeckcodex.command",
      Settings: {
        commandId: "plan",
      },
    });
    expect(agentPage.Name).toBe("Agents & Sessions");
    expect(values.map((item) => item.UUID)).not.toContain(
      "com.todd.streamdeckcodex.session-navigation",
    );
    expect(values.map((item) => item.Settings.commandId)).not.toContain(
      "accept",
    );
    expect(values.map((item) => item.Settings.commandId)).not.toContain(
      "reject",
    );
  });

  it("maps page 2 to the requested live-control order", () => {
    const actions = commandPage.Controllers.find(
      (controller) => controller.Type === "Keypad",
    )!.Actions;
    const values = Object.values(actions);
    const settings = Object.values(actions).map((item) => item.Settings);

    expect(actions["0,0"]?.Settings).toEqual({ commandId: "fast" });
    expect(actions["1,0"]).toMatchObject({
      UUID: "com.todd.streamdeckcodex.approval-mode",
      Settings: { mode: "yolo" },
    });
    expect(actions["2,0"]?.Settings).toEqual({ commandId: "dictate" });
    expect(actions["3,0"]?.UUID).toBe("com.todd.streamdeckcodex.usage");
    expect(actions["0,1"]).toMatchObject({
      UUID: "com.todd.streamdeckcodex.keycap",
      Settings: {
        action: "workflow:publish",
        icon: "yeet",
        label: "YEET",
      },
    });
    expect(actions["1,1"]).toMatchObject({
      UUID: "com.todd.streamdeckcodex.keycap",
      Settings: {
        action: "new-project",
        icon: "folder-plus",
        label: "New project",
      },
    });
    expect(actions["2,1"]?.Settings).toEqual({ commandId: "compact" });
    expect(actions["3,1"]?.UUID).toBe("com.todd.streamdeckcodex.context");
    expect(settings.map((item) => item.commandId)).not.toContain("accept");
    expect(settings.map((item) => item.commandId)).not.toContain("reject");
    expect(values.map((item) => item.UUID)).toContain(
      "com.todd.streamdeckcodex.usage",
    );
    expect(actions["3,1"]?.UUID).toBe("com.todd.streamdeckcodex.context");
    expect(actions["3,1"]?.Settings).toEqual({});
    expect(settings.map((item) => item.commandId)).not.toContain("skills");
    expect(commandPage.Name).toBe("Live Controls");
  });

  it("maps both encoder pages to Agent, Action, Model, and Reasoning", () => {
    for (const page of [agentPage, commandPage]) {
      const actions = page.Controllers.find(
        (controller) => controller.Type === "Encoder",
      )!.Actions;
      expect(Object.values(actions).map((item) => item.UUID)).toEqual([
        "com.todd.streamdeckcodex.agent-navigator",
        "com.todd.streamdeckcodex.command",
        "com.todd.streamdeckcodex.model",
        "com.todd.streamdeckcodex.reasoning",
      ]);
    }
  });

  it("starts Dial 2 on FAST on all seven visible pages", () => {
    for (const pageId of profile.Pages.Pages) {
      const page = JSON.parse(
        readFileSync(
          resolve(
            `profile-src/streamdeckcodex-plus/Profiles/${pageId}/manifest.json`,
          ),
          "utf8",
        ),
      ) as typeof agentPage;
      const dial = page.Controllers.find(
        (controller) => controller.Type === "Encoder",
      )!.Actions["1,0"];
      expect(dial?.Settings).toEqual({ commandIndex: 0 });
    }
  });
});
