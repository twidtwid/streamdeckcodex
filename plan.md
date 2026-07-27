# Stream Deck Codex Companion — Implementation Plan

## Goal

Build an independent Stream Deck Plus plugin that mirrors the useful behavior of
OpenAI's Codex Micro integration without using its source or private device APIs.

## Observed reference behavior

- Six agent controls follow recent chats and use the official Codex Micro live
  palette:
  - white (`#FFFFFF`): idle
  - light blue (`#9CD5FE`): thinking/running
  - light green (`#9BF396`): complete with unread output
  - peach (`#FFD0B8`): approval or answer required
  - light red (`#FF7373`): error
  - off: no chat
- Agent controls open their assigned chat.
- Command controls include approve, decline, continue in a new chat,
  push-to-talk, send, and new chat.
- Workflow controls can launch review, debugging, and refactoring prompts.
- A dial changes reasoning effort.

## Independent integration boundaries

1. Read Codex's user-owned rollout JSONL files under `~/.codex/sessions`
   read-only. Infer activity from documented/persisted event types and use
   `~/.codex/session_index.jsonl` for display names.
2. Open chats and prefilled workflow composers with documented `codex://` deep
   links.
3. Invoke documented Codex keyboard shortcuts through a small macOS automation
   helper. Actions that lack a fixed public shortcut use the documented command
   menu, with configurable command labels in the property inspector.
4. Store the selected reasoning effort in the companion's settings and apply it
   to Codex through the command menu. Never edit the user's Codex config file.

## Public prior-art research

- Use the official Elgato SDK 2.1.0 and CLI 1.7.4, following the official
  TypeScript samples for action lifecycles, encoder feedback, profiles, and
  validation.
- Use the public MIT-licensed ChatGato project as a compatibility reference for
  read-only `state_5.sqlite` access, rollout-tail status inference, Codex deep
  links, and accessibility-driven controls. Reimplement these pieces in this
  repository and retain attribution.
- Use the public MIT-licensed AgentDeck project as a design reference for a thin
  Stream Deck client, full-canvas encoder feedback, robust empty/offline states,
  and an auto-installed Stream Deck Plus profile. Do not import its daemon or
  renderer code.
- Use the public MIT-licensed Codex Usage for Stream Deck Plus project as a
  security reference: no credential reads, no token forwarding, no analytics,
  and clear version-sensitive integration notes.

## Plugin surface

- **Agent Status** (key)
  - Select slot 1–8 and ordering: recent or priority.
  - Dynamic SVG title/status visualization.
  - Single press opens the assigned chat and clears companion unread state.
  - Empty slot opens a new chat.
- **Codex Command** (key)
  - Approve, decline, push-to-talk, send, new chat, continue in new chat,
    open skills, or configurable command-menu action.
- **Workflow Launcher** (key)
  - PR review, debug, refactor, or a custom prompt.
  - Uses the selected/recent chat's workspace unless a path is configured.
- **Reasoning Effort** (encoder + touch strip)
  - Rotate through low, medium, high, xhigh, max, and ultra.
  - Press applies the displayed level through Codex's command menu.
  - Touch applies; long touch opens Codex keyboard-shortcut settings.

## Implementation phases

1. Scaffold a TypeScript Stream Deck SDK v2 plugin with manifest, icons,
   property inspectors, build scripts, and local install/link scripts.
2. Implement and unit-test:
   - rollout discovery/parsing and state reduction
   - recent/priority slot selection
   - unread tracking
   - SVG rendering
   - deep links and safe macOS command execution
3. Implement the four actions and shared live refresh coordinator.
4. Package and validate with Elgato's CLI, run tests/typecheck/lint, install the
   development plugin, and inspect Stream Deck logs.
5. Document setup, suggested Stream Deck Plus layout, permissions, behavior,
   troubleshooting, architecture, and unavoidable limitations.

## Acceptance checks

- Build, typecheck, tests, and Elgato validation pass.
- Installed plugin launches under Stream Deck 7.5 with no runtime errors.
- Agent parser correctly distinguishes empty, idle, unread, thinking/running,
  needs-input, and error fixtures.
- Workflow/new-chat actions generate documented `codex://` URLs with encoded
  prompts and workspace paths.
- Reasoning encoder feedback updates on rotation and its action path is covered
  by tests.
- No code or assets are copied from the installed Codex application.

## Corrective hardware QA gate

The first acceptance pass was too shallow: it treated a zero exit status from
the automation helper as proof that Codex changed state. The installed model
dial disproved that assumption by submitting `/model` as a new prompt while
reporting success.

No physical control is now considered passed unless all applicable layers are
verified:

1. the installed profile maps the expected physical surface to the expected
   action and settings;
2. turn, press, release, tap, and hold events remain separate and dispatch at
   most once;
3. the exact external payload is captured;
4. the intended visible feedback is rendered without truncation; and
5. the observable Codex postcondition is checked. A helper exit status alone
   is never a postcondition.

The QA report must distinguish live end-to-end results from deterministic
handler tests and document controls that cannot be safely exercised against an
active user task. A failed or unproved postcondition remains failed.

## Plan/Fast active-chat toggle remediation

The approved remediation replaces both mode-specific one-offs with one native
visible-composer adapter:

1. Discover only the focused Codex composer's accessibility subtree.
2. Read Plan and Fast state from visible badges/prompts or controls.
3. Refuse before typing when the visible composer contains a user draft.
4. Toggle with the documented active-chat slash command only when the requested
   state differs from the visible state.
5. Re-read the visible composer and return success only when the requested
   postcondition is observed.
6. Return symmetric `ACTIVE` or `OFF` feedback for key and Action-dial presses;
   rotation remains selection-only.
7. Remove Fast's generic command-palette route completely. There is no fallback
   to a global chooser, persisted task mutation, or background task state.

Release requires bidirectional official event-path tests for both modes, draft
preservation, no-command-palette assertions, Model/Reasoning/PTT regression
checks, a linked-plugin reload, and connected Stream Deck Plus visual QA.

## Focused-chat Context key

Page 2's bottom-right direct Skills key becomes a strictly read-only Context
key. Skills remains available through the Action dial.

1. Resolve the focused primary Codex task with the same bounded desktop-state
   resolver used by chat-targeted controls, with no fallback to another task.
2. Read the newest verified `token_count` snapshot from only that task's rollout
   and reject missing, malformed, unrelated, or stale snapshots.
3. Render remaining context by default (`CONTEXT LEFT` / `68%`), with the meter
   filled by context used. Toggle on press to separate compact used and maximum
   lines, and render `NO DATA` in both views when unknown. Do not add a textual
   meter caption.
4. Keep the action mutation-free: a press changes only the key's local view.
5. Reuse the Usage key's refresh behavior and verify the compact face fits
   without clipping or ellipsis.
6. Replace only Page 2 position `3,1`; retain Skills in the Action dial and
   assert that no direct Skills key remains.

Release requires focused-task selection, stale/missing/unrelated-data,
percent/exact rendering, toggle/no-mutation, label-fit, and profile-mapping
tests, plus installed-profile verification against live data or an explicit
unknown state.

## Page 1 autonomy workflows

Page 1 uses six live session keys plus primary YOLO and YEET wordmarks.

1. YOLO launches a bounded autonomous-completion workflow with explicit
   verification and safety constraints.
2. YEET launches review, checks, intentional commit, push, and draft-PR
   preparation.
3. Both keys dispatch exact registered workflow IDs and use one additive
   explanatory word.
4. Empty agent slots render `New chat / EMPTY SLOT` and create a new chat.
5. Previous/Next session keys and their plugin action are not shipped.

Release requires exact action-contract tests, source/generated/installed
profile parity, and live Page 1 OCR evidence for both wordmarks.

## Unified session labels

Page 1 keys and Dial 1 share one `sessions(8)` projection.

1. Order once by Codex's descending visible-session recency and preserve that
   order everywhere.
2. Prefer meaningful title words after removing markup and conversational
   filler. For delegation boilerplate, untitled chats, raw IDs, or empty
   subjects, derive a compact project label from the working directory.
3. Fit every label to seven characters without ellipses. Resolve collisions in
   list order with deterministic numeric suffixes (`Label`, `Label2`, ...).
4. Mark the focused session as active; preserve its live unread/running/input/
   error state. Page keys use the same exact label as the corresponding dial
   slot, with denser key-only status and `NOW` treatment.
5. Dial rotation changes only its pending list index; press opens the exact
   session currently named on the strip.
6. Never expose raw thread IDs or the outer delegated-task markup.

## Native approval-state remediation

Rollout JSONL does not emit a pending-start event for every native MCP
permission elicitation: the outer tool call may already be recorded as
completed while Codex still displays the permission sheet. Session status
therefore combines persisted rollout state with one fail-closed live signal:

1. Probe only the frontmost Codex window through Accessibility, without
   focusing, navigating, clicking, or typing.
2. Recognize a visible actionable approval/permission sheet from its bounded
   button-and-prompt accessibility subtree; ordinary tool activity and
   background tasks do not qualify.
3. Override only the focused task to `needs-input` while the sheet exists.
   When it disappears, immediately resume the rollout-derived status.
4. Treat unavailable Accessibility, an unfocused Codex app, malformed native
   output, and timeouts as unknown rather than fabricating peach.
5. Keep persisted question detection and every existing session color intact.

Release requires unit coverage for focused/nonfocused and pending/cleared
states, native detector fixtures, a linked-plugin reload, and a genuine
permission prompt observed as `#FFD0B8` on the connected Stream Deck Plus
followed by verified status restoration after reject/cancel.

## Lucide-only profile visual polish

The profile must remain cleanly redistributable. Extracted application artwork
is a local research artifact only and is never embedded in profile keys.

1. Keep every functional control on a single Lucide icon system;
   no hand-drawn or OpenAI-proprietary glyphs may be used by the profile.
2. Render YEET and YOLO as sharp original vector wordmarks outlined from the
   open-licensed Barlow Condensed Black Italic face. Do not depend on a system
   font and do not copy installed application artwork.
3. Reserve fixed, disjoint zones for icon, primary label, and supporting label.
4. Render every functional key at 144×144 and physical 72×72
   resolution, create page contact sheets, and visually inspect every result.
5. Verify the generated, bundled, and installed profiles use the same mappings.
6. Keep Usage and Context exclusively as the live Page 2 pair; do not duplicate
   them on the curated keycap pages.

Release requires a Lucide mapping for every profile icon, no icon/text overlap,
successful rasterization of every key, contact-sheet review, automated tests,
build/typecheck, Elgato validation, and final inspection in Stream Deck.

## Workspace surface keys

Pages 1 and 2 remain unchanged. Pages 3–7 preserve every existing functional
key while grouping the three new Codex surfaces coherently.

1. Keep Git & Delivery, Code Quality, and Decisions as Pages 3–5.
2. Keep Run shell, Edit code, Debug, Skills, and Chat audit
   together on the Page 6 Workspace workflow page.
3. Put Browser, Files, Side chat, Sidebar, and Settings on the new Page 7 Codex
   Panels page.
4. Leave unused positions empty instead of removing an existing key or adding
   filler.
5. Dispatch the three new keys through their exact registered command IDs and
   focused-task boundary.

Release requires literal 50-key contract coverage, explicit command mapping
assertions, per-key render checks, design evaluation, installed-profile parity,
build/typecheck, Elgato validation, and a clean live plugin restart.
