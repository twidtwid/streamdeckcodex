# Architecture

Stream Deck Codex Companion is a local macOS plugin with three runtime layers:

1. The TypeScript plugin registers Stream Deck actions, maintains a read-only
   view of recent Codex tasks, renders keys and dials, and serializes refreshes.
2. The Swift helper reads and operates only the frontmost Codex window through
   macOS Accessibility. Mutations require an exact task/window witness and a
   visible postcondition.
3. Codex's bundled local app-server supplies account limits, model metadata,
   and task-setting updates through a bounded JSON-line client.

There is no companion cloud service, API key, telemetry, or direct write to
Codex's databases, rollout files, or configuration.

## Source layout

| Path                            | Responsibility                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `src/plugin.ts`                 | Action registration, profile activation, serialized refresh lifecycle, cleanup         |
| `src/actions/`                  | Stream Deck key and dial event handlers                                                |
| `src/lib/codex-store.ts`        | Shared read model for tasks, live composer state, context, model, reasoning, and usage |
| `src/lib/codex-ui-control.ts`   | Typed bridge to the native Accessibility helper                                        |
| `src/lib/app-server*.ts`        | Bounded Codex app-server transport and allowed operations                              |
| `src/lib/bounded-process.ts`    | Output caps and TERM/KILL/reap lifecycle shared by child processes                     |
| `native/Accessibility.swift`    | Accessibility traversal and element helpers                                            |
| `native/Targeting.swift`        | Exact frontmost task/window witnesses and incremental continuity checks                |
| `native/ComposerControls.swift` | Picker, composer, mode, permission, PTT, and workflow operations                       |
| `native/Models.swift`           | Native request, response, snapshot, and error types                                    |
| `native/Fixtures.swift`         | Compiled native fixture entry points used by acceptance tests                          |
| `native/main.swift`             | Native command allow-list and CLI dispatch                                             |
| `scripts/`                      | Generated assets/profiles, packaging, release validation, and connected QA             |
| `test/`                         | Unit, compiled-native, event-path, profile, visual, and safety regression tests        |

## Runtime flow

The refresh coordinator runs every 1.25 seconds and collapses overlapping ticks
into one queued refresh. Cheap task/status data can update every tick. The more
expensive live-composer Accessibility observation is cached for 2.5 seconds.
Its first read captures a witness across the bounded local activity sources;
subsequent reads inspect only bytes appended since those saved cursors. A focus
or file-continuity change invalidates the witness and forces one full recapture.
A failed observation counts toward the same cadence as a successful one, so an
unreachable Codex never raises the spawn rate. The 30-second account-usage
fetch runs off the tick's critical path; keys render the last cached value.

User actions do not rely on that background cache as proof of a mutation. Each
chat-targeted action captures or verifies the exact visible task/window, refuses
unsafe drafts where required, performs one bounded operation, and rereads the
visible UI before displaying success.

## Safety invariants

- Native commands are a fixed allow-list; action payloads cannot execute shell
  commands.
- Model, Reasoning, Plan, FAST, Permissions, PTT, and workflow operations are
  scoped to the frontmost primary Codex chat.
- Dial rotation changes only local preview state. A press performs at most one
  apply transaction.
- Synthesized key or mouse input is not used for PTT. Legacy key-up cleanup is
  release-only and idempotent.
- Child stdout and JSON-line responses have hard caps. stderr is retained only
  as a bounded tail. Timeout and shutdown paths close stdin, escalate from TERM
  to KILL, and confirm process exit.
- Expected unavailability is rendered as an explicit reason; it is never
  converted into a success state or borrowed from another chat.
- Runtime activity belongs under `.cache/` and is never committed.

## Build and verification

`npm run check` regenerates and verifies assets/profiles, compiles every Swift
source, checks formatting and types, runs the automated suite and visual atlas,
builds the plugin bundle, and invokes Elgato's validator. `npm run
release:verify` adds dependency audits, documentation checks, packaging, and a
read-only doctor report. Connected mutation QA is deliberately separate; see
[QA.md](QA.md).
