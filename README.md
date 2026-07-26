# Stream Deck Codex Companion

[![CI](https://github.com/twidtwid/streamdeckcodex/actions/workflows/ci.yml/badge.svg)](https://github.com/twidtwid/streamdeckcodex/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An independent, local Stream Deck Plus companion for the Codex desktop app.
It follows the official OpenAI × Work Louder Codex Micro control model without
including proprietary source or artwork.

This is an unofficial community project and is not affiliated with, endorsed
by, or sponsored by OpenAI, Work Louder, or Elgato.

## What is working

- Six recent Codex sessions with live status and the same compact labels used
  by Dial 1.
- Official status vocabulary:
  - `#FFFFFF` white — idle
  - `#9BF396` light green — unread completion
  - `#9CD5FE` light blue — thinking or running
  - `#FFD0B8` peach — approval or answer required
  - `#FF7373` light red — error
  - off — no assigned chat
- Primary YOLO and YEET workflow keys on Page 1.
- PR Review, Debug, Refactor, and Tests skill/workflow launchers.
- Four Stream Deck Plus encoders with live touch-strip feedback.
- A Luna/Terra/Sol model dial that previews on turn and applies on press.
- Model-aware reasoning control, including Ultra only when the active model
  advertises it.
- A live Usage key showing weekly capacity left and banked resets.
- A live, read-only Context key scoped to the focused primary chat.
- A bundled, editable six-page Stream Deck Plus profile: two live-control pages
  and four curated Lucide keycap pages.
- A local newest-first build activity feed at `http://127.0.0.1:4317/`.

## Stream Deck Plus layout

### Page 1 — agents

| Session 1 | Session 2 | Session 3 | Session 4 |
| --------- | --------- | --------- | --------- |
| Session 5 | Session 6 | YOLO      | YEET      |

Keys 1–6 and Dial 1 share one ordered eight-session projection. A page key's
number and compact label identify the exact same session as the corresponding
dial slot. The focused key is marked `NOW`; color and footer retain idle,
unread, running, needs-input, and error state. An empty slot becomes a clearly
labeled New Chat key. YOLO launches an autonomous completion workflow; YEET
reviews, checks, commits, pushes, and prepares a draft pull request.

### Page 2 — commands and context

| New Chat  | Plan Mode | Push to Talk | Usage   |
| --------- | --------- | ------------ | ------- |
| PR Review | Debug     | Compact      | Context |

The Usage key defaults to weekly capacity left. Press it to show the
authoritative number of available rate-limit resets; press again to return to
weekly usage. Its footer shows compact time until the natural weekly reset,
such as `RESET 3D` or `RESET 5H`.

The Context key defaults to the focused chat's verified percentage left. Its
meter fills by percentage used. Press once for two compact lines—used tokens
and maximum tokens—and press again to return. Unknown or stale data is
`NO DATA` in both views; the key never substitutes another chat or a sample value. Usage and Context
appear exactly once in the bundled profile; the four curated keycap pages do
not duplicate either live display.

### Pages 3–6 — task workflows

| Git & Delivery | Code Quality | Decisions   | Workspace   |
| -------------- | ------------ | ----------- | ----------- |
| Branch info    | Refactor     | Fast        | Run shell   |
| New branch     | Add tests    | Accept      | Edit code   |
| Merge          | Search       | Reject      | New project |
| Diff           | Explain      | Send        | Upload      |
| Commit         | Document     | Explore     | Skills      |
| Push           | Optimize     | Analyze     | Chat audit  |
| Ship prep      | Audit        | Summarize   | Sidebar     |
| Deploy         | Fix CI       | Define goal | Tune setup  |

Every key dispatches a real command or named workflow. Ordinary keys use one
label; only the primary wordmarks use a second explanatory line.

### Dials and touch strip

| Dial      | Turn                                | Press                                     | Touch/hold                                                |
| --------- | ----------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| Agent     | Browse recent chats                 | Open selected chat                        | Tap opens; hold starts a new chat                         |
| Action    | Select a core Codex action          | Run it; push-to-talk follows dial-down/up | Tap runs non-voice actions; hold opens Keyboard Shortcuts |
| Model     | Preview Luna, Terra, or Sol locally | Apply exactly the displayed model         | Tap applies; hold opens the model picker                  |
| Reasoning | Preview one supported level locally | Apply exactly the displayed level         | Tap applies; hold opens the reasoning picker              |

The Agent Navigator and Page 1 use one deterministic session-label algorithm:

1. Prefer meaningful title words after removing markup and conversational
   filler.
2. Use compact project identity for delegation wrappers, untitled sessions,
   raw IDs, or empty subjects.
3. Fit to seven characters without ellipses.
4. Disambiguate collisions in list order with numeric suffixes.

Turning Dial 1 selects only within that same list, its strip shows
`SESSION n/8` plus the exact shared label, and pressing opens that exact
session. The Action dial uses fixed width-safe labels such as `PTT`, `FAST`,
and `PLAN`. Model and Reasoning use amber `PENDING` before press and green
`ACTIVE` after a successful apply.

## Install and run

Requirements:

- macOS 13 or newer
- Codex desktop app
- Stream Deck 7.1 or newer
- Stream Deck Plus
- Node.js 24 for development

```sh
npm install
npm run check
npm run link
```

Open the bundled profile if Stream Deck does not install it automatically:

```sh
open com.todd.streamdeckcodex.sdPlugin/streamdeckcodex-plus.streamDeckProfile
```

The development plugin is already linked and the two-page profile has been
installed on the Mac used to build this project.

### macOS permission

Accept, Reject, push-to-talk, Send, and navigation use a small, allow-listed
AppleScript helper to operate documented Codex shortcuts. Plan uses a compiled
visible-composer helper and never opens the global command chooser. Give
**Stream Deck** Accessibility permission in:

**System Settings → Privacy & Security → Accessibility**

The helper accepts only fixed command names. It does not run arbitrary shell
commands. Model and Reasoning also require Accessibility: a small compiled
helper uses the visible Codex composer and Model/Effort picker, pairs every synthesized
mouse/key down with an unconditional up, and rereads the picker before showing
`ACTIVE`. Plan refuses to run if the visible composer contains a draft, then
requires the visible `Plan` state to change before showing `ACTIVE` or `OFF`.
Fast uses the same safe adapter, but this Codex desktop build does not expose a
verifiable Fast composer control; it therefore reports `UNSUPPORTED` without
typing, changing the chat, or opening a chooser. Model/Reasoning do not type
slash commands, write Codex's database, or treat a background saved-state
change as success.

Push-to-talk is guarded by a short-lived watchdog process. Releasing the key,
leaving the page, stopping the plugin, losing the parent process, encountering
a partial key-down failure, or reaching the 60-second maximum hold all release
`D`, Shift, and Control. The plugin also performs a defensive release at
startup and process exit.

## Reasoning dial

The dial reads the active chat's model and effort from Codex's read-only local
state, then reads that exact model's `supported_reasoning_levels` from
`~/.codex/models_cache.json`.

- Turning never sends a Codex command.
- Turning one detent previews one discrete supported level.
- Pressing selects the exact visible Effort menu item once and verifies the
  displayed value before showing `ACTIVE`.
- Unsupported stale selections are reset and blocked after a model change.
- Ultra appears only for models that advertise it. On this Mac, GPT-5.6 Sol
  and Terra advertise Ultra; GPT-5.6 Luna does not.

The official Codex manual describes `/reasoning` as the current-chat effort
picker and states that Ultra is available only when the selected model supports
it.

## Model dial

The dial reads the current Codex model menu from `~/.codex/models_cache.json`
and offers the latest Luna, Terra, and Sol entries in that order.

- Turning changes only the pending local selection.
- Pressing selects the exact visible Model menu item once and verifies the
  displayed value before showing `ACTIVE`.
- The display stays amber `PENDING` until press, then becomes green `ACTIVE`.
- If the cache has no matching models, the dial shows `NO MODEL` and refuses
  to dispatch.
- If Codex is running, busy, missing Accessibility permission, or does not
  offer the requested value, the dial shows a specific red failure state.

## Live usage key

The key reads `account/rateLimits/read` through the installed Codex CLI's
official local app-server interface. It selects the longest reported quota
window as weekly usage and displays percentage remaining. A key press toggles
to `rateLimitResetCredits.availableCount`, the authoritative banked-reset
total. It never calls the reset-consumption endpoint.

If the account endpoint is temporarily unavailable, weekly usage falls back to
the newest rate-limit snapshot in bounded local rollout tails; the resets view
shows `--` rather than inventing a count.

## Live context key

The Context key reads only the newest verified `token_count` record in the
focused primary Codex chat's bounded rollout tail. The percentage view shows
context remaining; its horizontal meter represents context used. The exact
view places the compact used and maximum counts on separate lines so neither is
clipped.

The reader rejects missing, malformed, future-dated, and stale snapshots.
Pressing the key changes only its local display mode; it cannot change the
composer, task, model, reasoning, modes, usage, or account state.

## Local activity feed

```sh
npm run progress
```

Then open [http://127.0.0.1:4317/](http://127.0.0.1:4317/). The server:

- binds only to loopback;
- serves a reverse-chronological one-line activity log;
- accepts local-only activity updates;
- appends a persisted heartbeat every 25 seconds while work is active;
- makes no external requests.

Add an activity line with:

```sh
npm run progress:log -- "Plain-language update"
```

## Privacy and architecture

The plugin:

- opens `~/.codex/state_5.sqlite` read-only with `PRAGMA query_only`;
- reads bounded tails of recent rollout JSONL files;
- reads bounded tails of the current Codex desktop log to identify the task
  shown in the focused primary window;
- reads `models_cache.json` for the current model's effort levels;
- asks the installed Codex app-server for current account limits and banked
  reset count, using the account already signed into Codex;
- reads the local model cache to resolve the currently available
  Luna/Terra/Sol model slugs;
- uses documented `codex://` links to open chats, new chats, and Skills;
- has no analytics, telemetry, direct credential access, or independent network
  service.

Rollouts, config, and application files are never modified. Model and reasoning
presses operate Codex's own visible picker and let Codex persist its setting;
the plugin never writes the SQLite database directly.

## Verification

```sh
npm run check
npm run qa:dials
npm run qa:modes
npm run qa:design
```

Current gate:

- All automated state, input, profile, context, usage, mode,
  reasoning, palette, visual-source, and PTT-safety tests pass.
- TypeScript typecheck passes.
- The plugin builds for Stream Deck's Node 24 runtime.
- Elgato manifest validation passes.
- AppleScript compiles.
- Production dependency audit reports zero vulnerabilities.
- `npm run qa:dials` sends official Stream Deck Plus `dialRotate` and `dialUp`
  event shapes through the production action bundle, then proves both green
  feedback and the visible Codex Model/Effort values.
- `npm run qa:modes` sends production Action-dial events, proves Plan toggles
  `ACTIVE` then `OFF` with one native dispatch per press, and proves unsupported
  Fast sends no command and changes no visible mode.
- `npm run qa:design` renders all six pages at 144px and physical 72px, then
  enforces copy, action-registry, page-membership, safe-area, glyph-mass,
  Lucide-path uniqueness, and source-profile contracts.
- The installed Stream Deck process independently passed live permission and
  visible-picker checks for both Model and Reasoning.
- Live focused-chat Context QA resolves the current UTC-partitioned Codex
  desktop log and reads only that task's latest verified token snapshot.
- Release QA additionally compares every installed page name and key mapping
  with source, captures all six live Stream Deck editor pages, OCRs
  page-specific labels, and rejects stale or mismatched pages.

See [QA.md](QA.md) for the physical-input acceptance matrix.

## Real limitations

- OpenAI does not publish a stable public Codex desktop command API for all
  Codex Micro actions. This project deliberately avoids the private renderer
  event bus and operates documented deep links, shortcuts, and command UI.
- Plan is intentionally refused when the visible composer contains a draft.
  This avoids replacing or accidentally sending user text; clear or send the
  draft before applying Plan.
- Fast is intentionally unavailable on the current Codex desktop build because
  Accessibility exposes no focused-composer Fast state/control to verify.
  `/fast on` is treated as ordinary chat text in this UI. The companion refuses
  with `UNSUPPORTED` instead of typing it or opening a global chooser.
- Model/Reasoning control depends on the current Codex desktop accessibility
  labels for its public UI. A Codex UI redesign can require updating the native
  picker adapter; failures are explicit and never reported as `ACTIVE`.
- Accept and Reject act on the currently active Codex approval/question. The
  Stream Deck cannot prove that the active dialog belongs to the illuminated
  agent key, so read the Codex request before accepting.
- Agent assignment follows recent local user-facing chats rather than Codex
  Micro's private assignment configuration.
- Status inference depends on local Codex SQLite and rollout schemas and may
  need an update after a Codex desktop release.
- A single press opens the assigned chat. The official Micro's distinct
  single-tap background focus and double-tap foreground behavior is not exposed
  through the documented Codex deep-link API.
- Codex does not expose the desktop's selected task through a stable public
  plugin API. The companion parses the app's local primary-window activity
  events and refuses focused-task-only displays when that signal is missing; it
  never substitutes the newest task. A Codex desktop logging change may
  require an update.
- Unread acknowledgement is companion-local and resets when the plugin process
  is replaced.
- Banked resets require the installed Codex CLI's stable
  `account/rateLimits/read` app-server method. The key shows `--` if the backend
  does not provide a count; it never guesses or consumes a reset.
- Context usage depends on a fresh `token_count` record in the focused task's
  local rollout. Before Codex emits one, or after it becomes stale, the key
  shows `--`.
- Stream Deck preserves user-customized profiles during plugin upgrades.
  Re-importing creates another profile instead of replacing an old copy.
  This Mac currently has two stale one-page Codex profiles plus the active
  two-page `Codex Companion copy 1`; they were left untouched to avoid deleting
  user profile data without explicit approval.
- `npm audit` reports advisories in the official Elgato CLI's development-only
  dependency tree; `npm audit --omit=dev` is clean and the CLI is not bundled
  into the runtime plugin.

## Research and attribution

Behavior and layout were checked against:

- [Official Codex Micro product page](https://openai.com/supply/co-lab/work-louder/)
- [Official Work Louder Codex Micro setup and RGB legend](https://worklouder.cc/openai-micro-setup)
- [Elgato Stream Deck dial and touch-strip SDK guide](https://docs.elgato.com/streamdeck/sdk/guides/dials/)
- [Elgato plugin samples](https://github.com/elgatosf/streamdeck-plugin-samples)
- [Codex Deck](https://github.com/dazer1234/codex-stream-deck)
- [ThreadDeck for Codex](https://github.com/y5862000/threaddeck-for-codex)
- [ChatGato](https://github.com/marcoieni/chatgato)
- [AgentDeck](https://github.com/puritysb/AgentDeck)
- [Codex Usage for Stream Deck Plus](https://github.com/Lucxar/elgato-streamdeck-codex-usage)

Public projects were used only to compare architecture, compatibility, security,
and interaction patterns. No third-party source or protected keycap artwork is
vendored. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Development

```sh
npm run typecheck
npm test
npm run build
npm run validate
npm run pack
```

The editable profile source is in `profile-src/streamdeckcodex-plus`. Generated
plugin JavaScript and logs are ignored by Git.

Every profile pictogram is Lucide-based. YEET and YOLO are original outlined
vector graphics generated from the open-licensed Barlow Condensed Black Italic
face; they do not depend on a locally installed font. No installed
ChatGPT/Codex artwork is embedded in the profile.

The profile uses full-bleed dark key faces with deliberately empty edge space,
so its artwork cannot collide with Stream Deck's own rounded bezel. Icon and
label zones are disjoint; supporting copy is reserved for the two wordmarks.
Regenerate and inspect both design-size and physical-size contact sheets with:

```sh
npm run qa:visuals
npm run qa:design
```

To replace all six pages in an existing Stream Deck profile with the verified
source layout, pass that profile explicitly while Stream Deck is closed:

```sh
npm run profile:keycaps:install -- "/path/to/Your Profile.sdProfile"
```

For local visual comparison, the repository includes an extractor for the
small, static SVG glyphs embedded in an installed ChatGPT/Codex app. Extracted
OpenAI artwork is deliberately written to the Git-ignored
`extracted-app-icons/` directory and is not part of this project's licensed
source:

```sh
npm run icons:extract-app
```

Pass `--asar` or `--output` to override the installed app archive and output
directory. The extractor produces clean source SVGs, 144×144 Stream Deck
variants, a searchable contact sheet, and a provenance manifest.

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before
opening a pull request. Please report security-sensitive issues through the
private process in [SECURITY.md](SECURITY.md).
