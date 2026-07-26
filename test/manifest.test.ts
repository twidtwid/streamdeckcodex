import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(
    resolve("com.todd.streamdeckcodex.sdPlugin/manifest.json"),
    "utf8",
  ),
) as {
  Actions: Array<{ UUID: string; Controllers?: string[] }>;
  Nodejs: { Version: string };
  Profiles: Array<{ DeviceType: number }>;
  SDKVersion: number;
};
const profile = JSON.parse(
  readFileSync(
    resolve("profile-src/streamdeckcodex-plus/manifest.json"),
    "utf8",
  ),
) as {
  Device: { Model: string };
  InstalledByPluginUUID: string;
  Pages: { Pages: string[] };
};
const agentPage = JSON.parse(
  readFileSync(
    resolve(
      "profile-src/streamdeckcodex-plus/Profiles/0D4C7F4C-666D-46B1-A787-7F2ABE2E12F0/manifest.json",
    ),
    "utf8",
  ),
) as {
  Controllers: Array<{
    Type: string;
    Actions: Record<
      string,
      { Settings: Record<string, unknown>; UUID: string }
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
  it("targets SDK 3, Node 24, and Stream Deck Plus", () => {
    expect(manifest.SDKVersion).toBe(3);
    expect(manifest.Nodejs.Version).toBe("24");
    expect(manifest.Profiles.some((profile) => profile.DeviceType === 7)).toBe(
      true,
    );
  });

  it("declares the complete companion surface", () => {
    const ids = manifest.Actions.map((action) => action.UUID);
    expect(ids).toEqual(
      expect.arrayContaining([
        "com.todd.streamdeckcodex.agent-status",
        "com.todd.streamdeckcodex.command",
        "com.todd.streamdeckcodex.workflow",
        "com.todd.streamdeckcodex.model",
        "com.todd.streamdeckcodex.reasoning",
        "com.todd.streamdeckcodex.agent-navigator",
        "com.todd.streamdeckcodex.usage",
        "com.todd.streamdeckcodex.context",
        "com.todd.streamdeckcodex.session-navigation",
      ]),
    );
  });

  it("ships an editable Stream Deck Plus profile source", () => {
    expect(profile.Device.Model).toBe("20GBD9901");
    expect(profile.InstalledByPluginUUID).toBe("com.todd.streamdeckcodex");
    expect(profile.Pages.Pages).toHaveLength(6);
    expect(profile.Pages.Pages).toEqual(
      expect.arrayContaining([
        "KEYCAPS-1",
        "KEYCAPS-2",
        "KEYCAPS-3",
        "KEYCAPS-4",
      ]),
    );
  });

  it("ships all 32 labeled Codex Micro keycap references across four pages", () => {
    const keycapLabels = [
      "KEYCAPS-1",
      "KEYCAPS-2",
      "KEYCAPS-3",
      "KEYCAPS-4",
    ].flatMap((pageId) => {
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
    expect(keycapLabels).toHaveLength(32);
    expect(
      keycapLabels.every(
        (key) => key.UUID === "com.todd.streamdeckcodex.keycap",
      ),
    ).toBe(true);
    expect(keycapLabels.map((key) => key.Settings.label)).toEqual(
      expect.arrayContaining(["YOLO", "YEET", "Terminal", "Codex"]),
    );
  });

  it("maps keycaps with established Codex semantics to the shared command path", () => {
    const keycaps = [
      "KEYCAPS-1",
      "KEYCAPS-2",
      "KEYCAPS-3",
      "KEYCAPS-4",
    ].flatMap((pageId) => {
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

    expect(actionFor("Fast")).toBe("command:fast");
    expect(actionFor("Accept")).toBe("command:accept");
    expect(actionFor("Reject")).toBe("command:reject");
    expect(actionFor("Send")).toBe("command:send");
    expect(actionFor("Voice")).toBe("info");
  });

  it("maps the primary page to six agents plus bounded session navigation", () => {
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
      UUID: "com.todd.streamdeckcodex.session-navigation",
      Settings: { direction: "older" },
    });
    expect(actions["3,1"]).toMatchObject({
      UUID: "com.todd.streamdeckcodex.session-navigation",
      Settings: { direction: "newer" },
    });
    expect(values.map((item) => item.Settings.commandId)).not.toContain(
      "accept",
    );
    expect(values.map((item) => item.Settings.commandId)).not.toContain(
      "reject",
    );
  });

  it("maps the command page to Codex Micro controls, usage, and context", () => {
    const actions = commandPage.Controllers.find(
      (controller) => controller.Type === "Keypad",
    )!.Actions;
    const values = Object.values(actions);
    const settings = Object.values(actions).map((item) => item.Settings);

    expect(settings.map((item) => item.commandId)).toEqual(
      expect.arrayContaining(["new-chat", "plan", "dictate", "compact"]),
    );
    expect(settings.map((item) => item.commandId)).not.toContain("accept");
    expect(settings.map((item) => item.commandId)).not.toContain("reject");
    expect(values.map((item) => item.UUID)).toContain(
      "com.todd.streamdeckcodex.usage",
    );
    expect(actions["3,1"]?.UUID).toBe("com.todd.streamdeckcodex.context");
    expect(actions["3,1"]?.Settings).toEqual({});
    expect(settings.map((item) => item.commandId)).not.toContain("skills");
    expect(actions["2,1"]?.Settings).toEqual({ commandId: "compact" });
    expect(settings.map((item) => item.workflowId)).toEqual(
      expect.arrayContaining(["pr-review", "debug"]),
    );
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
});
