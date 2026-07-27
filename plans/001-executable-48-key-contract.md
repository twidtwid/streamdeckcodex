# Plan 001: Establish the executable 48-key contract

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Do not
> treat source-text searches as behavioral tests. If a STOP condition occurs,
> stop and report; do not improvise. When done, update this plan's row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat aacdbf2..HEAD -- profile-src scripts src test package.json`
> and `git status --short`.
> This plan was written from a dirty working tree at `aacdbf2`. Do not reset,
> restore, stash, overwrite, or discard any pre-existing change. Compare the
> current files against the excerpts below. If an excerpt's behavior no longer
> matches, stop and report the drift.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/002-exact-focused-window-targeting.md`
- **Category**: tests
- **Planned at**: commit `aacdbf2`, 2026-07-26

## Why this matters

The existing 109-test suite can pass while physical controls remain broken
because several “acceptance” tests search source files for strings instead of
executing actions. The current connected FAST/Plan harness sends an encoder
event, not the `Keypad` event used by the actual buttons. This plan creates one
explicit, executable contract for every one of the 48 keys and makes incomplete
coverage a test failure.

## Current state

- `test/physical-input.acceptance.test.ts:84-94` considers focused targeting
  accepted when source text contains `codexStore.controlThread()?.id`.
- `test/physical-input.acceptance.test.ts:135-150` considers YEET and New
  Project accepted when selected substrings and `Cmd+O` exist.
- `test/model-dial.acceptance.test.ts:88-107` asserts that source contains
  `invoke("model", slug)`; it does not invoke the control boundary.
- `scripts/qa-mode-events.mjs:151-187` sends `controller: "Encoder"` and
  `event: "dialUp"`, while physical FAST and Plan keys run
  `CommandAction.onKeyDown`.
- `scripts/evaluate-profile-design.mjs:41-48` accepts any total between 16 and
  48 keys rather than requiring the complete intended profile.
- `scripts/render-profile-visuals.mjs:71-96` already renders each present key at
  144px and 72px. Extend this existing pattern instead of introducing another
  visual renderer.
- Action classes use `showOk()`, `showAlert()`, `setImage()`, `setTitle()`,
  `setFeedback()`, and `setSettings()`. Tests should use a shared fake action
  implementing those methods and recording calls.

Product constraints that tests must enforce:

- local-only and credential-free;
- no proprietary OpenAI artwork;
- exact focused-task targeting for mutations;
- fail closed when identity or a visible postcondition cannot be proved;
- helper/process exit alone is never a sufficient success postcondition;
- drafts must be preserved;
- one primary label unless a permanent state identity genuinely requires a
  secondary caption.

## The required 48-key matrix

The test fixture must list these keys explicitly. Do not derive the expected
matrix from the manifests being tested; that would compare the files to
themselves.

| Page | Position | Key         | Required action contract                                                              |
| ---- | -------- | ----------- | ------------------------------------------------------------------------------------- |
| 1    | 0,0      | Agent 1     | `agent-status`, slot 1; assigned slot opens its exact task; empty slot opens New Chat |
| 1    | 1,0      | Agent 2     | `agent-status`, slot 2; same invariants                                               |
| 1    | 2,0      | Agent 3     | `agent-status`, slot 3; same invariants                                               |
| 1    | 3,0      | Agent 4     | `agent-status`, slot 4; same invariants                                               |
| 1    | 0,1      | Agent 5     | `agent-status`, slot 5; same invariants                                               |
| 1    | 1,1      | Agent 6     | `agent-status`, slot 6; same invariants                                               |
| 1    | 2,1      | New Chat    | `command:new-chat`; open a new Codex task and never reuse a recent task               |
| 1    | 3,1      | Plan Mode   | `command:plan`; exact focused task, verified state transition, draft preservation     |
| 2    | 0,0      | FAST        | `command:fast`; exact focused task and proved Standard/Fast transition                |
| 2    | 1,0      | Permissions | `approval-mode`; ASK → APPROVE → YOLO → CUSTOM → ASK using live state                 |
| 2    | 2,0      | PTT         | `command:dictate`; matched down/up lifecycle and unconditional modifier release       |
| 2    | 3,0      | Quota       | `usage`; toggles weekly/resets view without consuming a reset                         |
| 2    | 0,1      | YEET        | `workflow:publish`; exact focused cwd and exact publication prompt                    |
| 2    | 1,1      | New project | `new-project`; verified Add Project folder picker                                     |
| 2    | 2,1      | Compact     | `command:compact`; exact focused task and verified `/compact` dispatch/outcome        |
| 2    | 3,1      | Context     | `context`; toggles remaining/exact locally and reads only focused task data           |
| 3    | 0,0      | Branch info | `workflow:branch`; exact focused cwd and registry prompt                              |
| 3    | 1,0      | New branch  | `workflow:new-branch`; exact focused cwd and registry prompt                          |
| 3    | 2,0      | Merge       | `workflow:merge`; exact focused cwd and registry prompt                               |
| 3    | 3,0      | Diff        | `workflow:diff`; exact focused cwd and registry prompt                                |
| 3    | 0,1      | Commit      | `workflow:commit`; exact focused cwd and registry prompt                              |
| 3    | 1,1      | Push        | `workflow:push`; exact focused cwd and registry prompt                                |
| 3    | 2,1      | Ship prep   | `workflow:release`; exact focused cwd and registry prompt                             |
| 3    | 3,1      | Deploy      | `workflow:deploy`; exact focused cwd and registry prompt                              |
| 4    | 0,0      | Refactor    | `workflow:refactor`; exact focused cwd and registry prompt                            |
| 4    | 1,0      | Add tests   | `workflow:tests`; exact focused cwd and registry prompt                               |
| 4    | 2,0      | Search      | `workflow:search`; exact focused cwd and registry prompt                              |
| 4    | 3,0      | Explain     | `workflow:explain`; exact focused cwd and registry prompt                             |
| 4    | 0,1      | Document    | `workflow:document`; exact focused cwd and registry prompt                            |
| 4    | 1,1      | Optimize    | `workflow:optimize`; exact focused cwd and registry prompt                            |
| 4    | 2,1      | Audit       | `workflow:audit`; exact focused cwd and registry prompt                               |
| 4    | 3,1      | Fix CI      | `workflow:fix-ci`; exact focused cwd and registry prompt                              |
| 5    | 0,0      | PR Review   | `workflow:pr-review`; exact focused cwd and registry prompt                           |
| 5    | 1,0      | Accept      | `command:accept`; exact focused task and only a visible eligible approval control     |
| 5    | 2,0      | Reject      | `command:reject`; exact focused task and only a visible eligible approval control     |
| 5    | 3,0      | Send        | `command:send`; exact focused task and only a nonempty intended draft                 |
| 5    | 0,1      | Explore     | `workflow:explore`; exact focused cwd and registry prompt                             |
| 5    | 1,1      | Analyze     | `workflow:analyze`; exact focused cwd and registry prompt                             |
| 5    | 2,1      | Summarize   | `workflow:summarize`; exact focused cwd and registry prompt                           |
| 5    | 3,1      | Define goal | `workflow:goal`; exact focused cwd and registry prompt                                |
| 6    | 0,0      | Run shell   | `workflow:terminal`; exact focused cwd and registry prompt                            |
| 6    | 1,0      | Edit code   | `workflow:editor`; exact focused cwd and registry prompt                              |
| 6    | 2,0      | Debug       | `workflow:debug`; exact focused cwd and registry prompt                               |
| 6    | 3,0      | Upload      | `workflow:upload`; exact focused cwd and registry prompt                              |
| 6    | 0,1      | Skills      | `skills`; opens only the documented Codex Skills route                                |
| 6    | 1,1      | Chat audit  | `workflow:sessions`; exact focused cwd and registry prompt                            |
| 6    | 2,1      | Sidebar     | `command:sidebar`; verified sidebar state change in Codex                             |
| 6    | 3,1      | Tune setup  | `workflow:settings`; exact focused cwd and registry prompt                            |

## Commands you will need

| Purpose       | Command                             | Expected on success                                       |
| ------------- | ----------------------------------- | --------------------------------------------------------- |
| Typecheck     | `npm run typecheck`                 | exit 0, no TypeScript errors                              |
| Focused tests | `npm test -- profile-keys.behavior` | 48 matrix entries exercised; all pass                     |
| Visual tests  | `npm run qa:visuals`                | 48 SVG, 48 144px PNG, and 48 72px PNG artifacts generated |
| Design gate   | `npm run qa:design`                 | exit 0 with exactly six pages and 48 keys                 |
| Full tests    | `npm test`                          | all tests pass                                            |

## Scope

**In scope**:

- `test/helpers/fake-streamdeck-action.ts` (create)
- `test/helpers/profile-key-contract.ts` (create)
- `test/profile-keys.behavior.test.ts` (create)
- `test/profile-keys.visual.test.ts` (create or extend
  `test/keycap-visuals.test.ts`)
- `test/physical-input.acceptance.test.ts`
- `test/model-dial.acceptance.test.ts`
- `test/reasoning-dial.acceptance.test.ts`
- `scripts/evaluate-profile-design.mjs`
- `scripts/render-profile-visuals.mjs`
- `vitest.config.ts` only for the decorator transform needed to instantiate
  the real action classes in executable tests
- `profile-src/streamdeckcodex-plus/Profiles/95B6205B-6011-4D73-8C91-B78957110300/manifest.json`
  only to normalize the Page 2 internal action names to the user's canonical
  FAST, Permissions, PTT, and Context identities
- `com.todd.streamdeckcodex.sdPlugin/streamdeckcodex-plus.streamDeckProfile`
  only as the deterministic archive regenerated from that scoped manifest
- `package.json`

**Out of scope**:

- Changing rendered key artwork, icons, page order, prompts, or product
  behavior. The bounded Page 2 manifest-name normalization above is the only
  metadata-label exception.
- Editing `native/CodexUIControl.swift`; native behavior changes belong to later
  plans.
- Installing or modifying the user's live Stream Deck profile.
- Deleting existing tests wholesale. Retain useful static policy checks for
  banned artwork, forbidden APIs, and manifest structure.

## Git workflow

- Branch: `codex/001-executable-48-key-contract`
- Preserve the pre-existing dirty tree; do not use reset, restore, checkout, or
  stash to manufacture a clean state.
- Use imperative commit messages consistent with recent history, e.g.
  `Validate every profile key behavior`.
- Do not push or open a PR unless the operator explicitly asks.

## Steps

### Step 1: Add an explicit canonical test fixture

Create `test/helpers/profile-key-contract.ts`. Encode the 48 rows above with
page number, position, expected display name, action UUID, exact settings,
behavior class, task-target policy, and visual identity. Assert:

- exactly six pages;
- exactly eight populated positions per page;
- exactly 48 unique `(page, position)` pairs and 48 unique action IDs;
- manifest values match the explicit fixture byte-for-byte after stable JSON
  normalization;
- every `command:*` ID exists in `COMMANDS`;
- every `workflow:*` ID exists in `KEYCAP_WORKFLOWS`;
- every icon exists in the allowed Lucide/wordmark registry.

**Verify**: `npm test -- profile-keys.behavior` → fixture coverage reports 48/48
and no manifest mismatch.

### Step 2: Build a reusable fake Stream Deck action/event harness

Create `test/helpers/fake-streamdeck-action.ts`. It must record calls and
arguments for `getSettings`, `setSettings`, `setImage`, `setTitle`,
`setFeedback`, `showOk`, and `showAlert`. Provide builders for real Keypad event
shapes: `willAppear`, `keyDown`, and matched `keyUp`. Do not use Encoder events
for key tests.

Use Vitest module mocks or narrow injectable adapters around
`src/lib/automation.ts`, `src/lib/codex-ui-control.ts`, and `codexStore` so the
test observes exact calls without opening Codex.

**Verify**: `npm test -- profile-keys.behavior -t "harness"` → one deliberate
success and one deliberate failure prove call recording and alert behavior.

### Step 3: Execute every key's actual handler

Create a table-driven test that loads each of the 48 explicit fixture rows,
instantiates the action class registered for its UUID, and invokes the same
handler physical hardware uses.

For each row assert:

- the expected action class received the manifest settings;
- exact command/workflow ID, prompt, thread ID, and cwd dispatch arguments;
- `showOk()` occurs only after the mocked postcondition succeeds;
- `showAlert()` and no `showOk()` occur on failure;
- task-scoped mutations dispatch nothing when focused identity is missing;
- display-only keys perform no Codex mutation;
- PTT has one down and one up even when the action errors;
- Permissions tests all four starting states and the wrap to ASK;
- Agent slots test both assigned and empty behavior.

Replace source-substring assertions for these behaviors. Do not count an
assertion against file contents as executable coverage.

**Verify**: `npm test -- profile-keys.behavior` → 48/48 keys pass, including
negative/fail-closed cases.

### Step 4: Require physical-size visual evidence for every key

Extend the current renderer/evaluator so the artifact report records one row
for each fixture key at both 144px and 72px. Require:

- nonblank glyph mass and at least the existing minimum color count;
- no nonbackground pixels touching the forbidden edge inset;
- no icon/caption bounding-box intersection;
- no text clipping, ellipsis, duplicate primary label, or unintended secondary
  copy;
- approved two-line exceptions only for Permissions and YEET;
- exact expected icon identity, including distinct underlying path data where
  the contract requires distinct icons.

The evaluator must fail if any fixture key lacks either PNG size. Keep generated
evidence under ignored `.cache/`.

**Verify**: `npm run qa:design` → report states `48/48 keys`, `96/96 raster
artifacts`, zero visual failures.

### Step 5: Make the standard gate enforce completeness

Change the design evaluator from a permissive 16–48 key count to exactly 48,
and have the behavioral test fail if the fixture and manifests differ. Ensure
`npm run check` includes the executable key test through the normal Vitest run.

**Verify**: temporarily alter one expected setting in the test fixture and
confirm the focused test fails with page, position, expected, and observed;
restore it, then run `npm run check` → exit 0.

## Test plan

- One explicit contract row for every key listed above.
- Positive and failure-path handler execution for all 48 keys.
- Additional state cases for Agent slots, Plan, FAST, Permissions, PTT, Usage,
  and Context.
- Visual evidence at 144px and 72px for all 48.
- A completeness meta-test proving the suite fails if a key is added, removed,
  duplicated, moved, or left untested.

## Done criteria

- [ ] The explicit fixture contains exactly 48 named keys and six pages.
- [ ] Every fixture row executes the actual Keypad handler.
- [ ] Every task-scoped key has a no-focused-task fail-closed assertion.
- [ ] Every key has 144px and 72px visual evidence.
- [ ] The report says 48/48 behavioral and 96/96 raster artifacts.
- [ ] Source-string tests no longer claim behavioral acceptance.
- [ ] `npm run typecheck`, `npm test`, and `npm run qa:design` exit 0.
- [ ] `npm run check` exits 0.
- [ ] No file outside the in-scope list is modified by this plan.
- [ ] `plans/README.md` status is updated.

## STOP conditions

- The profile no longer contains exactly the six pages and 48 keys listed.
- Executing action classes requires changing production behavior rather than a
  narrow test seam.
- A key's intended behavior cannot be determined from its manifest plus
  `COMMANDS`/`KEYCAP_WORKFLOWS`.
- Visual checks require subjective human judgment without a machine-checkable
  threshold; report the missing measurable criterion instead of inventing one.
- Any step would install or alter the user's live Stream Deck profile.

## Maintenance notes

Any future key addition, removal, move, relabel, icon change, or action-setting
change must update the explicit fixture, executable behavior case, and both
visual sizes in the same commit. Reviewers should reject tests that derive
expected values from the manifest under test or merely search production source
for tokens.
