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

| Feature                        | Mechanism / postcondition                                                                                      | Current limitation                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Provider routing and display   | Foreground bundle ID; per-action setting; badges; legacy default is Codex                                      | Automated tests cover mixed profiles, focus changes and invalid settings                       |
| Model / effort                 | Unique semantic picker; observed menu options; same target and unchanged draft; selected picker value verified | Guarded implementation; Local/SSH/Cloud live acceptance pending                                |
| Permission cycle / Plan        | Only offered modes; verified selection; prior non-Plan mode scoped to target                                   | No guessed prior mode after restart; live acceptance pending                                   |
| Send / stop                    | Unique composer control; target checks; empty draft after send or stop control disappearance                   | Live acceptance pending; existing unrelated drafts never replaced                              |
| Session discovery / navigation | Read bounded Desktop session metadata; exact visible session correlation                                       | Recent metadata alone cannot prove a navigable target; navigation unsupported                  |
| Approval requests              | Requires unique approval card/request identity and verified dismissal                                          | Unsupported until live card selectors and target correlation are established                   |
| New session / workflow launch  | Requires new identity, exact project/environment, preserved source draft and verified destination draft        | Unsupported; no insertion into a guessed conversation                                          |
| Compact / panes / skills       | Documented entry points plus feature-specific postconditions                                                   | Unsupported until observed in the installed Code surface                                       |
| Context                        | Session-specific UI usage evidence                                                                             | Unsupported; no guessed token count                                                            |
| Plan quota                     | Local `plan-usage-history.json` inspected: version, timestamped samples, organization and usage fields         | Source observed, but active-account attribution/freshness not verified against UI; unsupported |
| Fast / PTT                     | Must have a verified Desktop equivalent and captured-session release                                           | Unsupported; never substituted with a terminal hotkey or global dictation                      |

Local, SSH and Cloud each require separate live acceptance. None has completed live
acceptance in this worktree yet. The development session exposed a visible Claude
window but no usable composer tree; later both the native API and desktop automation
service reported the login/locked surface. A subsequent automation connection returned
a blank Claude content window with native menus but no Code controls. Reloading that
window was blocked by automatic approval review because it could disrupt session
state; live acceptance is still pending. Do not label these controls hardware-tested
or publish the prerelease as validated on the strength of synthetic fixtures.

## Privacy and release gates

Only known local session metadata is read; no credential files, Keychain access,
private API calls, application patches, transcript writes, or hooks are installed.
Diagnostics must exclude prompts, account IDs, and local paths from public artifacts.

Before release: verify exact targeting and restoration on a disposable Claude Code
session; exercise Local, SSH, Cloud separately; keep unverified combinations disabled;
validate Mini and Plus, all ten profile archives, and legacy profile compatibility.
Wrong-target mutations and Codex regressions block publishing. The stable installed
plugin remains unchanged during this work.

### Development acceptance switch

The compiled environment allowlist is empty until live acceptance succeeds.
`STREAMDECK_CLAUDE_ACCEPTANCE_ENVIRONMENT` may name exactly `local`, `ssh`, or
`cloud` in a developer probe process to exercise that environment's guarded
transactions. It is not a user setup requirement or a default in the packaged
plugin. Promote an environment to the compiled allowlist only with recorded live
proof; remove any probe override from the test process afterward.
