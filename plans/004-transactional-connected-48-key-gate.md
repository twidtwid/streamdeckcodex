# Plan 004: Make the connected 48-key release gate transactional

> **Execution status: BLOCKED (fail closed).** Reusable SDK Keypad transport,
> fixture validation, report validation, and state-journal scaffolding exist,
> but no connected PASS evidence is emitted. The current production paths do
> not provide reversible, independently witnessed cleanup for every key:
> workflow launch witnesses are discarded by TypeScript; New Chat provides no
> task identity/cleanup; Send and Compact have no inverse; New Project has no
> verified dismiss; and zero-mutation preflight cannot prove the exact
> foreground fixture task and empty composer. `qa:keys:*` therefore returns
> STOP until these gaps are closed.

> **Executor instructions**: This plan creates the final hardware-equivalent
> release gate. It must exercise every key through `Keypad` events, preserve user
> state, and leave no temporary drafts/tasks/windows behind. Do not run the
> connected gate against the user's active project while developing it; use a
> dedicated disposable fixture project.
>
> **Drift check (run first)**:
> `git diff --stat aacdbf2..HEAD -- scripts package.json QA.md README.md test`
> and `git status --short`.
> Preserve all pre-existing changes. Stop if Plans 001–003 are not complete.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/001-executable-48-key-contract.md`,
  `plans/002-exact-focused-window-targeting.md`,
  `plans/003-truthful-live-postconditions.md`
- **Category**: tests, dx, docs
- **Planned at**: commit `aacdbf2`, 2026-07-26

## Why this matters

The current connected QA verifies selected dial paths, not all physical keys,
and can leave Model, Reasoning, Plan, or FAST changed after success or failure.
A polished control surface needs a release artifact proving every key's actual
handler, visual, target, postcondition, and cleanup. This plan turns “tested”
into an auditable 48/48 result.

## Current state

- `scripts/qa-mode-events.mjs:151-187` dispatches Encoder `dialUp` events.
- `scripts/qa-mode-events.mjs:216-239` restores Plan/FAST only by making the
  second happy-path press; its `finally` at lines 296-300 performs no state
  restoration.
- `scripts/qa-dial-events.mjs:61-69` records only Plan, then forces Sol and
  Medium. Its `finally` at lines 320-328 restores only Plan.
- `package.json:58` runs deterministic checks but no connected test.
- `QA.md:32-35` still documents an obsolete page layout and lines 64-66 require
  YOLO/YEET OCR on the wrong page.
- Plan 001's explicit matrix is the sole expected-key source for this gate.
  Do not create a second hand-maintained list.

## Commands you will need

| Purpose             | Command                                                                 | Expected on success                                        |
| ------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| Deterministic gate  | `npm run check`                                                         | exit 0                                                     |
| Connected preflight | `npm run qa:keys:preflight -- --fixture <path>`                         | reports safe fixture, permissions, 48 keys, zero mutations |
| Connected gate      | `npm run qa:keys:connected -- --fixture <path>`                         | 48/48 pass, cleanup pass, evidence path                    |
| Release evaluator   | `npm run qa:design:release -- --installed <profile> --live-pages <dir>` | six pages, 48 keys, OCR/layout pass                        |

## Scope

**In scope**:

- `scripts/qa-profile-keys.mjs` (create)
- `scripts/qa-mode-events.mjs`
- `scripts/qa-dial-events.mjs`
- shared connected-QA helpers under `scripts/lib/` (create)
- `package.json`
- `QA.md`
- `README.md`
- `CONTRIBUTING.md`
- `src/lib/keycap-workflows.ts` formatting only, to clear the inherited
  pre-plan Prettier drift and make the final deterministic gate truthful
- tests for harness state restoration and report completeness

**Out of scope**:

- Further production behavior changes; those belong in Plans 002–003.
- Running destructive workflows in a real repository.
- Auto-submitting workflow prompts.
- Consuming quota resets.
- Committing, pushing, deploying, uploading, merging, accepting a real
  permission, or otherwise performing the semantic work named by a workflow.
- Making foreground-dependent connected QA mandatory in GitHub-hosted CI.

## Git workflow

- Branch: `codex/004-transactional-connected-48-key-gate`
- Commit message example: `Add transactional connected validation for every key`
- Do not push or open a PR without explicit instruction.

## Steps

### Step 1: Build a nonmutating connected preflight

Add `qa:keys:preflight`. It must:

- require an explicit disposable fixture project path;
- refuse the repository root, home directory, `/`, or a nonempty non-fixture
  project;
- verify Codex and Stream Deck versions, Accessibility permission, native helper
  build, focused fixture task identity, empty composer draft, and exactly 48
  contract keys;
- snapshot focused task ID/cwd, open windows/tasks, Plan, FAST, Permissions,
  Model, Reasoning, sidebar state, and any other state the gate can mutate;
- make zero mutations;
- print a redacted summary with no prompt contents, task IDs, account data, or
  private absolute paths.

**Verify**: run against an invalid path → refusal and zero state changes; run
against a valid fixture → preflight pass and zero state changes.

### Step 2: Drive actual Keypad handlers for all 48 keys

Use the Plan 001 matrix and real manifest settings. For each position send
`willAppear`, then `keyDown`; send `keyUp` when the action lifecycle requires
it. Never substitute `Encoder` events.

The gate must record:

- page, position, name, UUID, settings hash;
- handler event sequence;
- resolved task/cwd identity category (redacted);
- expected and observed postcondition;
- OK/alert outcome;
- cleanup result;
- 72px visual artifact reference.

Workflow keys must only verify that the exact prompt is prefilled in a new task
at the fixture cwd; do not submit it. Close/discard that temporary draft/task
before the next key.

Accept/Reject positive paths require a purpose-built harmless fixture state. If
Codex offers no safe way to create that state, record a deterministic native
fixture positive test plus a connected fail-closed test; mark the evidence type
explicitly rather than pretending it was live.

**Verify**: `npm run qa:keys:connected -- --fixture <path>` → report contains
exactly 48 unique PASS entries and no unclassified SKIP.

### Step 3: Make every mutation transactional

Create a cleanup journal before the first key. Each mutation registers its
inverse or cleanup immediately. In `finally`, and in SIGINT/SIGTERM handlers:

- release all synthesized keys/modifiers;
- restore Plan, FAST, Permissions, Model, Reasoning, and sidebar state from the
  preflight snapshot;
- close/discard temporary workflow/new-chat drafts without touching the
  original fixture task;
- dismiss the Add Project picker without choosing a folder;
- return focus to the original fixture task;
- verify every restored state.

Cleanup operations must be independent so one failure does not prevent the
rest. Preserve the primary test failure and report cleanup failures separately.

Refactor `qa-mode-events` and `qa-dial-events` to use the same snapshot/journal
helper.

**Verify**: failure-injection tests interrupt after each mutation boundary and
assert the final snapshot equals the initial snapshot.

### Step 4: Produce machine-readable and human-readable evidence

Write ignored artifacts under `.cache/profile-key-release/<timestamp>/`:

- `report.json` with 48 key records and cleanup state;
- `report.md` compact table grouped by page;
- six page screenshots plus 48 physical-size key crops;
- native/plugin logs filtered to stable reason codes and redacted identifiers.

The command exits nonzero if:

- any key is missing, duplicated, skipped without an allowed fixture reason, or
  fails;
- any postcondition is unverified;
- any cleanup/restoration check fails;
- any visual artifact is missing;
- the installed profile differs from source.

**Verify**: remove one report row in a fixture test → validator fails with the
exact page/position; complete report → 48/48 and cleanup PASS.

### Step 5: Correct the release documentation

Update `QA.md`, `README.md`, and `CONTRIBUTING.md` to:

- document the actual six-page arrangement;
- put YOLO and YEET on Page 2;
- remove obsolete Previous/Next and unsupported-FAST claims;
- remove nonexistent commands;
- explain deterministic `npm run check` versus explicit foreground connected
  release QA;
- warn that connected QA requires a disposable fixture and restores state;
- document librsvg and ImageMagick prerequisites and resolve them from `PATH`
  rather than hardcoded Apple-Silicon paths.

Add a documentation-contract test that verifies every documented npm command
exists and page membership comes from the explicit 48-key contract.

**Verify**:
`rg -n "qa:sessions|YOLO.*page 1|YEET.*page 1|two-page|Fast.*UNSUPPORTED" README.md QA.md PROGRESS.md CONTRIBUTING.md`
→ no stale current-state claims.

### Step 6: Define the release command

Add a single documented command, for example `qa:release:connected`, that runs:

1. deterministic `npm run check`;
2. preflight;
3. transactional 48-key connected gate;
4. installed/live-page design evaluator;
5. report validation.

Do not put foreground connected QA in hosted CI. CI must still run the
deterministic 48-key handler and visual coverage from Plan 001.

**Verify**: the release command exits 0 only with `48/48`, six pages, installed
parity, visual pass, postcondition pass, and cleanup pass.

## Test plan

- Preflight refusal for unsafe paths and dirty/nonfixture targets.
- Real Keypad event dispatch for all 48 matrix rows.
- Completeness failure for missing, duplicate, skipped, or unreported key.
- Signal/interruption and failure injection after every live mutation.
- Restoration equality for Plan, FAST, Permissions, Model, Reasoning, sidebar,
  focused task, drafts, and synthesized modifiers.
- Redaction tests ensuring report output contains no prompt text, task IDs,
  account values, or private absolute paths.
- Installed-profile and screenshot evidence tests for all six pages.

## Done criteria

- [ ] Connected report contains exactly 48 unique key PASS records.
- [ ] Every record came through a Keypad handler, not an Encoder substitute.
- [ ] Every stateful/mutating key has a target-bound postcondition.
- [ ] Every key has a physical-size visual artifact.
- [ ] Workflow prompts are verified but never submitted.
- [ ] Initial and final live-state snapshots are equal.
- [ ] SIGINT/SIGTERM and injected failures restore state.
- [ ] Documentation matches the six-page 48-key contract.
- [ ] `npm run check` and the connected release command exit 0.
- [ ] Only in-scope files changed.
- [ ] `plans/README.md` status updated.

## STOP conditions

- A connected test would execute Commit, Push, Deploy, Upload, Merge, YEET, or
  another workflow prompt rather than only verify its prefilled draft.
- The fixture path cannot be proven disposable and isolated from user work.
- Codex provides no safe positive fixture for Accept/Reject and no deterministic
  native accessibility fixture exists.
- A live mutation has no verified inverse/cleanup operation.
- Cleanup changes or deletes a pre-existing user draft/task/window.
- Any key would need to be marked pass without an observed postcondition.

## Maintenance notes

The release report is evidence, not a permanent tracked artifact; keep it under
ignored `.cache/`. Any profile change must update the explicit contract and
connected gate in the same commit. Reviewers should reject representative-only
sampling: the invariant is 48 named keys, 48 handler records, 48 physical-size
artifacts, and zero unclassified skips.
