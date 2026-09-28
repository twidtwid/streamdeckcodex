# Claude Code Desktop integration research

Reviewed 2026-09-05. Baseline: plugin v0.2.4; installed Claude Desktop
1.46388.4 on macOS. This document distinguishes source inspection, synthetic
tests, and live acceptance. A passing fixture is not evidence of hardware acceptance.

## Decision and reuse audit

One plugin with application adapters shares SDK actions, images, profile generation,
packaging, and the existing bounded native process transport. The Codex adapter
retains its existing store, controls, targeting, and PTT guard. Claude has an
independent native target contract. No external project code or runtime is bundled.

| Project / reviewed revision                                                                                                     | Source and license evidence                                                                                                                                                                  | Decision                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [agentsd](https://github.com/paultyng/agentsd/tree/1621f2448662b9c2330df351b2f67a7d1375ef09)                                    | MIT; `src/state-machine.ts`, `src/util/applescript.ts`, hook server/session manager. macOS; HTTP hooks drive state. Desktop focus is application activation; stop targets frontmost Ghostty. | Useful event-state reference for optional hooks. Its focus/stop implementation cannot prove the current Desktop session. No code copied.                                                                                      |
| [AgentDeck](https://github.com/puritysb/AgentDeck/tree/1d75b78b44d093fc13ec17b9363ab88fcf66b8c6)                                | MIT; architecture, bridge state machine/hook server, shared model-provider types reviewed. A daemon coordinates clients; Claude adapter uses hooks and terminal UI observation.              | Reuse the architectural principle of isolated app adapters and explicit unknown states. Existing local helpers already cover transport/rendering. A required daemon or terminal observer conflicts with this release's scope. |
| [streamdeck-claude-answer](https://github.com/hardkoded/streamdeck-claude-answer/tree/39ccfe2972ae7112b5827b284711e8d7e9960d61) | MIT; plugin, CLI and bundled-profile workflow. Explicit question files and answer files implement requested Q&A.                                                                             | Different workflow and profile assumptions; does not provide arbitrary Desktop approval or session control. No runtime dependency.                                                                                            |
| [alejandrosnz/claude-deck](https://github.com/alejandrosnz/claude-deck/tree/0b50c6b6d20ae6e66af835d4bd5c3b29dae60457)           | Usage client and tests reviewed. Client reads CLI credentials and calls an OAuth usage endpoint. No root license file found in the reviewed checkout.                                        | No code adoption. Credential extraction and private account API calls are outside this design.                                                                                                                                |
| [Alish3r/claude-deck](https://github.com/Alish3r/claude-deck/tree/9d6b7f46f7367d27265650d1aa5f9f148d1891a6)                     | Companion installer/extension reviewed. Root license includes Commons Clause conditions. VS Code companion reapplies a patch to the Claude extension.                                        | Wrong target surface, app patching, and incompatible reuse assumptions. No code copied.                                                                                                                                       |

The search also covered [Agent Vitals](https://github.com/tapparello/agent-vitals),
[deck-threads](https://github.com/rschwabco/deck-threads),
[StreamDeck-Claude](https://github.com/Corrugator/StreamDeck-Claude), and
[yolodeck](https://github.com/cruftbox/yolodeck). Their published designs focus on
CLI hooks, account-token usage reads, Windows terminal control, or a companion
application. README review does not establish exact Claude Desktop Code control.

Maintenance dates and source revisions are recorded for reproducibility, not as
endorsements. License review must be repeated before adopting any code. AgentDeck's
initial full clone timed out; the relevant files were subsequently read at the
pinned revision through GitHub's contents API.

## Anthropic and platform guidance

- [Desktop reference](https://code.claude.com/docs/en/desktop#keyboard-shortcuts):
  Code has its own keyboard shortcuts and a shortcut panel (`Cmd+/`). Model,
  effort and permissions menus have dedicated entry points. CLI shortcuts such as
  `Shift+Tab` do not apply to Desktop. Installed menu semantics take priority over
  a copied list of positional shortcuts.
- [Keybinding customization](https://code.claude.com/docs/en/keybindings) and
  [interactive mode](https://code.claude.com/docs/en/interactive-mode): terminal
  configuration must not be mistaken for Desktop automation settings.
- [Hooks guide](https://code.claude.com/docs/en/hooks-guide) and
  [reference](https://code.claude.com/docs/en/hooks): hooks provide lifecycle
  events with session IDs and bounded responses. An optional future integration
  must correlate request/session identity, preserve unrelated hook configuration,
  handle cancellation and timeouts, and distinguish local from remote hook hosts.
  This release does not install hooks or expose a listener.
- [Agent SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions) concern
  running/resuming an agent. They do not by themselves prove control of the current
  visible Desktop composer.
- [Computer use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
  uses an agent/tool execution loop. Button operations should not require a model
  call, additional API credentials, or screenshot-driven inference.
- [Elgato profiles](https://docs.elgato.com/stream-deck/profiles/getting-started/)
  are device-specific. Shared profiles remain separate opt-in archives; existing
  and hand-built profiles retain their application binding.

Our implementation policy, rather than an Anthropic guarantee: prefer semantic
Accessibility actions, use documented shortcuts only with foreground/target proof,
inspect offered options, and verify the observed result. Never infer success from
successful input delivery. Do not click absolute screen coordinates in production.

## Feature evidence and acceptance matrix

Every Claude operation requires foreground Code, one focused window, one composer,
a content-root Code session URL, and unique matching Desktop metadata. Titles and
focus timestamps do not establish identity. Session IDs are namespaced by app,
window/process and environment. An unrecognized route or environment fails closed.

| Feature                              | Verified mechanism and postcondition                                                           | Accepted environment / limitation                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Provider routing                     | Foreground bundle ID; per-action provider; namespaced window/session/environment identity      | Native wrong-provider, window, session, environment and background rejections; automated mixed-profile tests |
| Model                                | Unique Model picker and offered menu rows; unchanged draft and verified selection              | Local + SSH; primary menu choices                                                                            |
| Effort                               | Actual accessible integer slider range; Increment/Decrement; verified position and description | Local + SSH; Low, Medium, High, Extra, Max and Ultracode names                                               |
| Permission cycle / Plan              | Exact offered mode rows; verify selection; restore prior non-Plan mode                         | Local + SSH; full offered cycle including Bypass; first-use workspace confirmation handled                   |
| Context / weekly usage               | Unique Usage picker in exact correlated Code session; parse displayed percentages and bucket   | Local + SSH; no zero for missing data; model-family quota is labeled                                         |
| Fast                                 | Opus 5 model-menu checkbox; verify model label Fast suffix and restoration                     | Local + SSH, Opus 5 only; no Fable substitute                                                                |
| Sidebar / Changes                    | Unique named button or numeric toggle; verify changed state and unchanged draft                | Local + SSH                                                                                                  |
| Browser pane                         | Unique Browser toggle; verify changed state and unchanged draft                                | Local only; SSH control unavailable in tested session                                                        |
| Send / stop                          | Guarded implementation exists but is not in the release capability allowlist                   | Unsupported until separately accepted                                                                        |
| Session discovery / navigation       | Bounded metadata plus exact visible session correlation                                        | Metadata supports identity; navigation unsupported                                                           |
| Approvals                            | Requires unique approval request/card identity and verified dismissal                          | Unsupported                                                                                                  |
| New session / workflows              | Requires verified destination identity/project/environment and draft preservation              | Unsupported                                                                                                  |
| Compact / Files / side chat / skills | Requires feature-specific surface and result proof                                             | Unsupported                                                                                                  |
| PTT                                  | Visible recording control; hold/release equivalent not yet validated                           | Unsupported; no global dictation fallback                                                                    |

Cloud remains unsupported. Local and SSH native transactions passed separately;
physical hardware acceptance is pending for this prerelease.

### Live observations after the approved reload

On 2026-09-05, the installed Claude 1.46388.4 exposed its Code accessibility tree
and a Local session. These observations supersede the initial blank-window blocker:

- The focused window is identified by the application's `AXFocusedWindow` reference.
  Its own `AXFocused` flag was false. The helper now uses the reference and verifies
  it belongs to the current window list.
- `AXEnhancedUserInterface=true` did not mean Electron manual accessibility had
  been requested. Claude now requests `AXManualAccessibility` explicitly once per
  native transaction. The setting's readback remained false after successful
  activation, so repeated verification does not repeat the activation delay.
- A Code content-root URL used `/epitaxy/local_<UUID>`, matching the `sessionId`
  in Desktop metadata. `cliSessionId` was a different UUID. The parser preserves
  the prefix; it does not collapse these two namespaces.
- The installed shortcut panel confirmed Cmd-Shift-I for model, Cmd-Shift-E for
  effort, Cmd-Shift-M for permissions, and Cmd-Option-F for Fast mode.
- Model controls expose descriptions such as `Model: Fable 5.1`. Their menus use
  `AXMenuItem` rows. A UI test selected Opus 5 and restored Fable 5.1.
- Effort is an `AXSlider`, with observed minimum 0, maximum 5, value 2 and value
  description High. Increment produced Extra (3); decrement restored High (2).
  The helper derives offered numeric positions from the accessible range, uses
  Increment/Decrement, and verifies both position and selected description.
  Beta 1 used ordinal previews. Beta 2 verifies and displays the six named levels.
- Permission menu rows contain a primary mode label and descriptive text. The
  helper reads exact mode labels from each row's child text. Visible Local choices
  were Auto, Manual, Accept edits, Plan and Bypass permissions. Native cycling
  verified Auto → Manual → Accept edits → Plan → Auto. Bypass opened an additional
  confirmation, which was cancelled during beta 1. Beta 2 handles that exact dialog
  after an explicit Bypass selection, with target and draft checks.
- Opus 5 exposed an Enable fast mode checkbox in its model menu. A UI test turned
  it on and off and verified both the checkbox and Fast mode status. Fable 5.1 did
  not expose it. Native toggling and restoration subsequently passed separately
  on Local and SSH with Opus 5.
- A Usage picker exposed a model-family weekly percentage and active-session
  context usage. Parsing and rendering now use these fields, with the bucket
  explicitly labeled. The PTT control is visible but hold/release is unvalidated.

The shell sandbox can hide running applications. Preflight reports an unobserved
foreground without calling it locked; live probes require normal desktop process
access. Native tests brought Claude forward explicitly and verified Local and SSH
model/effort selection and restoration, Plan restoration, full non-Bypass permission
cycling, Fast restoration, pane toggles and visible telemetry. Local additionally
passed an actual unsent-draft test with focus on the Code mode selector rather than
the composer; the exact test draft survived and was removed afterward without sending.

Negative native tests rejected changed window, session, provider and environment
identities; a Claude operation while Codex was foreground; ordinary Claude Chat;
and an actual split with two Prompt composers. The empty split was closed afterward.
The compiled per-environment capability allowlists contain only these accepted
operations; send/stop remain disabled despite guarded source implementations.

## Privacy and release gates

Only known local session metadata is read; no credential files, Keychain access,
private API calls, application patches, transcript writes, or hooks are installed.
Diagnostics must exclude prompts, account IDs, and local paths from public artifacts.

Before stable release: qualify physical Mini and Plus controls and all generated
layouts, including legacy and mixed hand-built profiles. Native Local/SSH acceptance
is recorded above; Cloud and other unproven combinations stay disabled. Wrong-target
mutations and Codex regressions block publishing. The stable installed plugin remains
unchanged while this prerelease is offered for hardware acceptance.

### Repeatable native acceptance

Run `node scripts/qa-claude-controls.mjs --environment=local --activate` with an
existing Local Code session selected (use `ssh` for SSH). This reads options and
checks invalid-target rejection without selecting new settings. Add `--exercise`
to change and restore model, effort, Plan, permissions, available Fast and panes.
Use an idle test session. Logs omit identifiers, drafts and private paths. If the
target changes, restoration fails closed rather than editing the new session.

`STREAMDECK_CLAUDE_ACCEPTANCE_ENVIRONMENT` is a developer-process override used by
the acceptance runner to exercise guarded, not-yet-qualified native transactions.
It is not a user setup requirement, persisted preference, or packaged default.
Normal operation uses `verifiedClaudeCapabilities`, separately for Local and SSH.

### Final qualification replay

On 2026-09-06, the unlocked Local replay exposed an independent metadata bug:
Desktop's valid session JSON had grown to 321,001 bytes because it also contains
prompt snapshots. The old 256 KiB limit silently excluded it. The metadata reader
now accepts up to 4 MiB and bounds the read itself, including concurrent file growth.
Regression tests cover the observed size, the limit, and an oversized file.
Optional diagnostics expose only counts for Code roots, matching metadata and
matching windows; they do not print session identities or content.

After this fix, the complete Local replay passed model/effort discovery and
selection, Fast, Plan, a full permission cycle, sidebar, Changes, Browser and
wrong-target rejection. Original settings were restored and both telemetry fields
were observed. The complete SSH replay subsequently passed the same supported
operations independently, including restoration and both telemetry fields. The earlier unavailable/inconsistent menu state did not recur in
this complete replay; locking has not been established as its cause.

The console-session guard rejects locked, off-console and unavailable desktop
states before provider targeting or input. It was verified against a locked desktop,
which returned `LOCKED` without a target. Automatic unlock is not part of the plugin.

### Beta 2 effort and permission follow-up

Reviewed 2026-09-06 against the same installed Desktop version. The numeric menu
shortcuts in the [Desktop reference](https://code.claude.com/docs/en/desktop#keyboard-shortcuts)
were verified live: 4 selected Plan and 5 selected Bypass in the offered five-mode
menu. Production presses the exact semantic row rather than relying on its position.

All six effort descriptions were observed: Low, Medium, High, Extra, Max and
Ultracode. Fable and Opus exposed the same six names; Sonnet exposed the same slider
range. Haiku did not offer an enabled effort control. Named choices are validated
against the actual range and current description; changed semantics are rejected.
The missing Ultracode picker label was also corrected and selection/restoration tested.

Permission cycling now includes every offered mode. Plan restores a remembered
non-Plan mode, including Bypass. With no history it selects the unique Default marked
in Claude's menu, or Manual if none is marked; it never remains stuck in Plan for
lack of plugin history. Local's full five-mode cycle and history-free return to its
marked Bypass default passed native testing.

SSH displayed “Bypass all permissions?” on its first Bypass selection. The user
authorized that workspace confirmation, and the native helper selected Bypass.
The initial postcheck rejected the result despite the visible Bypass selection;
it required the original composer Accessibility object to survive the modal. The
postcheck now allows a composer remount only after this operation confirmed the exact
dialog, and only with the captured Code session, window, unique composer and draft
unchanged. Tests reject changed session URLs, ambiguous dialogs, outside buttons,
and changed drafts. The repeated full SSH cycle and Plan restoration passed;
SSH Auto mode was restored after acceptance testing.

Fast remains unchanged following the user's clarification. Anthropic's
[Fast documentation](https://code.claude.com/docs/en/fast-mode) distinguishes supported
Opus models from other models; this preview retains its verified Opus 5 control.
