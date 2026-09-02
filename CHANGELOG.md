# Changelog

All notable changes to this project are documented here.

## 0.2.2 — 2026-09-02

Updated for the new Codex model navigation: Codex 26.818 replaced the
Model/Effort menus with a **Select model** submenu and a five-segment
**Power** control, and the model and reasoning dials, Ultra included, follow
it again. Also a simplification pass: smaller public tree, behavioral tests,
and no native spawns while Codex is unreachable.

### Fixed

- Model and reasoning dials work again with the current Codex picker: the
  live state is read from the picker title, models are chosen from **Select
  model**, and effort is stepped through the five-segment **Power** control
  one segment at a time with the readout verified after every click, so
  ladders that skip rungs (Sol ends at Ultra) still reach every level the
  catalog offers. Picker transactions get the same 12-second budget as the
  verified mode toggle.
- Permissions cycle only through the modes Codex offers, so Full Access cycles
  back to Ask when no Custom mode exists, and the one-time Full Access
  confirmation is optional.
- `qa:store` could not start on any Node version; it now runs through the
  same bundler as the doctor.
- The build-pipeline test skipped the keypad-profile generator check and
  overwrote the shipped bundle with a fixture commit.
- Manifest and property-inspector copy: the Reasoning dial previews on
  rotate, the Usage and Context action-list icons were swapped, and the
  navigator no longer claims touch-strip gestures.

### Changed

- A failed native composer observation now counts toward the same 2.5-second
  cadence as a successful one, so an unreachable or backgrounded Codex no
  longer spawns the helper on every tick.
- The account-usage fetch runs off the refresh tick's critical path; keys
  render the last cached value. After plugin start the Quota key shows
  `NO DATA` until the first app-server usage read completes (bounded by its
  five-second timeout) instead of delaying the first tick.
- Health collection summarizes cached state on the tick; `npm run doctor`
  still observes the composer and usage live before summarizing.
- The app server now receives the real plugin version in `clientInfo`.

### Removed

- Unreachable control paths (AppleScript menu shortcuts, unused picker and
  mode readers, the `deep-links` module), the `input-dump` native
  diagnostic, a duplicate QA harness and log parser, the internal progress
  dashboard, `PROGRESS.md`, the `marketplace/submission` copy, and the
  one-off app-icon extractor with its two dependencies.

## 0.2.1 — 2026-09-02

### Fixed

- Repair the bundled native helper's executable permission before spawning it;
  Elgato's plugin packer stores the helper as `0644` in fresh installs.
- Document the separate `trampoline_handler` Accessibility grant used by
  Stream Deck 7.5 to launch plugin processes.

## 0.2 — 2026-09-01

First public beta.

### Changed

- Generated model-specific profiles for Stream Deck, Mini, Neo, and XL from
  the same 50-key contract as Stream Deck +, with Live Controls first on
  button-only devices.
- Bounded every child process: app-server and native output caps, request
  timeouts, and TERM/KILL escalation with confirmed reaping.
- Split the native helper into targeting, Accessibility, composer-control,
  model, fixture, and dispatch modules.
- Cached live composer observations for 2.5 seconds with incremental
  desktop-log witness reads.
- Consolidated the connected dial and mode QA transport and moved runtime
  activity under the ignored `.cache/` directory.
- Reason-coded Permissions, Usage, and Context failures replaced the
  ambiguous `Unknown` state, and the doctor reports the same codes.

### Fixed

- The verified FAST transaction uses a 12-second bridge timeout.
- The mode-QA proxy uses Stream Deck's embedded Node runtime.

## 0.1.0-beta.1 — 2026-07-26

First friend-test beta.

### Included

- Generated model-specific profiles for Stream Deck, Mini, Neo, XL, and Stream
  Deck +, all sourced from the same 50-key contract
- Live Codex chat status, usage, context, and permission mode
- FAST, Plan, push-to-talk, Compact, New Chat, New Project, and YEET controls
- Agent, Action, Model, and Reasoning dials on Stream Deck +
- Automatic button-only layouts that place Live Controls first, Agents &
  Sessions second, and preserve every workflow key
- Local-only architecture with no separate credentials or telemetry

### Compatibility

- macOS 13 or newer
- Stream Deck 7.1 or newer
- Codex desktop
- Stream Deck + hardware-tested
- Button-only profiles pass automated and Elgato validation and await their
  first independent hardware test
