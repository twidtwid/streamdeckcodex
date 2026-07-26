(() => {
  let socket;
  let context;
  let actionId = "";
  let settings = {};

  const app = document.getElementById("app");

  window.connectElgatoStreamDeckSocket = (
    port,
    uuid,
    registerEvent,
    _info,
    actionInfo,
  ) => {
    context = uuid;
    const info = JSON.parse(actionInfo);
    actionId = info.action;
    settings = info.payload?.settings || {};
    socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ event: registerEvent, uuid }));
      render();
    });
  };

  const commandOptions = [
    ["accept", "Accept current request"],
    ["reject", "Reject current request"],
    ["dictate", "Push to talk"],
    ["send", "Send composer"],
    ["new-chat", "New chat"],
    ["fast", "Toggle Fast mode"],
    ["plan", "Enable Plan mode"],
    ["review", "Start review"],
    ["skills", "Open Skills"],
    ["sidebar", "Toggle sidebar"],
  ];

  const workflowOptions = [
    ["pr-review", "PR review"],
    ["debug", "Debug and fix"],
    ["refactor", "Refactor"],
    ["tests", "Add tests"],
  ];

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  }

  function select(name, label, values, fallback) {
    const current = settings[name] || fallback;
    return `<label>${label}<select data-setting="${name}">${values
      .map(
        ([value, title]) =>
          `<option value="${value}" ${current === value ? "selected" : ""}>${title}</option>`,
      )
      .join("")}</select></label>`;
  }

  function text(name, label, placeholder = "") {
    return `<label>${label}<input data-setting="${name}" value="${esc(settings[name])}" placeholder="${esc(placeholder)}"></label>`;
  }

  function number(name, label, fallback, min, max) {
    return `<label>${label}<input type="number" min="${min}" max="${max}" data-setting="${name}" value="${esc(settings[name] ?? fallback)}"></label>`;
  }

  function checkbox(name, label, fallback = false) {
    const checked = settings[name] ?? fallback;
    return `<label class="check"><input type="checkbox" data-setting="${name}" ${checked ? "checked" : ""}>${label}</label>`;
  }

  function render() {
    let html = "";
    if (actionId.endsWith(".agent-status")) {
      html =
        number("slot", "Agent slot", 1, 1, 8) +
        `<p class="muted note">Slots follow Codex chat recency. Press a key to open and acknowledge that chat.</p>`;
    } else if (actionId.endsWith(".command")) {
      html =
        select("commandId", "Command", commandOptions, "new-chat") +
        `<p class="muted note">Plan applies only to the visible active chat and refuses safely when the composer contains a draft.</p>`;
    } else if (actionId.endsWith(".workflow")) {
      html =
        select("workflowId", "Workflow", workflowOptions, "pr-review") +
        text("path", "Workspace path", "Latest Codex workspace when empty");
    } else if (actionId.endsWith(".reasoning")) {
      html = `<p class="muted note">The dial reads the model's supported levels from Codex and applies changes to the active chat.</p>`;
    } else if (actionId.endsWith(".agent-navigator")) {
      html = `<p class="muted note">Rotate to browse recent chats, press or tap to open, and hold the touch strip to start a new chat.</p>`;
    } else {
      html = `<p class="muted note">No settings are required for this action.</p>`;
    }
    app.innerHTML = html;
    app.querySelectorAll("[data-setting]").forEach((element) => {
      element.addEventListener("change", save);
      if (element.tagName === "TEXTAREA" || element.type === "text") {
        element.addEventListener("input", save);
      }
    });
  }

  function save(event) {
    const element = event.currentTarget;
    let value = element.value;
    if (element.type === "checkbox") value = element.checked;
    if (element.type === "number") value = Number(element.value);
    settings = { ...settings, [element.dataset.setting]: value };
    socket.send(
      JSON.stringify({ event: "setSettings", context, payload: settings }),
    );
  }
})();
