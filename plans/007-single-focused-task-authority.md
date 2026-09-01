# Plan 007: Make one focused-task identity authoritative end to end

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. Touch only files listed as in scope. If a STOP condition occurs,
> stop and report; do not improvise. When done, update this plan's status row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a36ba3f..HEAD -- native/CodexUIControl.swift src/lib/codex-store.ts src/actions/agent-status.ts src/actions/agent-navigator.ts test/active-desktop-thread.test.ts test/focused-target.test.ts test/native-target.fixture.test.ts test/local-store.integration.test.ts test/profile-keys.behavior.test.ts`
> If any in-scope file changed, compare the excerpts below with live code.
> Differences in focus selection, witness validation, or `CodexStore` caching
> are a STOP condition until this plan is reconciled.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH — this changes the safety boundary for task-scoped mutations
- **Depends on**: none
- **Category**: bug, tech-debt, perf
- **Planned at**: commit `a36ba3f`, 2026-07-26

## Why this matters

The plugin currently has two related identity defects. Native targeting can
accept an older matching focus event from one desktop log even when a newer log
says a different task is focused. At the TypeScript layer, `focusedThread()`
searches a limit-dependent recent-task cache and can miss the active task
entirely when it is older than the first 12 rows. The result is unnecessary
focus/selected/recent fallback logic around the most safety-sensitive state in
the plugin.

After this plan, the globally newest focused-primary desktop event is the only
native witness authority, and `CodexStore` resolves that task directly by ID.
Selected navigation state remains presentation-only and cannot affect a
mutation target.

## Current state

- `src/lib/desktop-active.ts` is the proven reference implementation. It
  gathers a candidate witness from each of the eight newest desktop logs and
  globally sorts by `observedAt`, then file modification time:

  ```ts
  // src/lib/desktop-active.ts:182-200
  const newest = candidates
    .slice(0, 8)
    .map((candidate) => ({
      ...candidate,
      witness: latestDesktopWitnessInLog(candidate.path),
    }))
    .filter((candidate) => candidate.witness !== undefined)
    .sort(
      (left, right) =>
        right.witness.observedAt - left.witness.observedAt ||
        right.modifiedAt - left.modifiedAt,
    )[0];
  ```

- `native/CodexUIControl.swift:652-684` loops files and returns the first file
  whose appended history matches the requested task. It does not first choose
  the globally newest event.
- `native/CodexUIControl.swift:731-741` similarly returns the first per-file
  current witness matching the requested task.
- `native/CodexUIControl.swift:858-867` validates only the token's original
  file after its cursor. A newer conflicting focus event in another log is not
  considered.
- `src/lib/codex-store.ts:247-318` caches `Math.max(limit, 12)` recent rows,
  but `src/lib/codex-store.ts:252-254` returns any fresh cache regardless of the
  requested limit.
- `src/lib/codex-store.ts:343-348` asks `recentThreads(50)` for the active ID.
  If `sessions(8)` filled a 12-row cache first, the nominal 50-row lookup still
  sees only 12.
- `src/lib/codex-store.ts:210,329-341` retains `#selectedThreadId`,
  `selectThread()`, and `controlThread()`. Repository search shows production
  mutations use `focusedThread()`; only stale navigation writes and tests use
  the selected fallback.
- The native style is fail-closed: ambiguity returns `nil` or throws
  `TARGET_MISMATCH`. Preserve that convention. The TypeScript store uses
  readonly SQLite queries and short in-memory caches; keep it synchronous.

## Commands you will need

| Purpose              | Command                                                                                                                                                                                    | Expected on success                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Build native fixture | `npm run native:build`                                                                                                                                                                     | exit 0                                                                                      |
| Focused tests        | `npx vitest run test/active-desktop-thread.test.ts test/focused-target.test.ts test/native-target.fixture.test.ts test/local-store.integration.test.ts test/profile-keys.behavior.test.ts` | all pass                                                                                    |
| Typecheck            | `npm run typecheck`                                                                                                                                                                        | exit 0, no errors                                                                           |
| Full 51-key gate     | `npm run check`                                                                                                                                                                            | 30 test files pass; design reports 51 keys and seven pages; Stream Deck validation succeeds |
| Diff hygiene         | `git diff --check`                                                                                                                                                                         | no output                                                                                   |

## Scope

**In scope**:

- `native/CodexUIControl.swift`
- `src/lib/codex-store.ts`
- `src/actions/agent-status.ts`
- `src/actions/agent-navigator.ts`
- `test/active-desktop-thread.test.ts`
- `test/focused-target.test.ts`
- `test/native-target.fixture.test.ts`
- `test/local-store.integration.test.ts`
- `test/profile-keys.behavior.test.ts`
- `plans/README.md` for status only

**Out of scope**:

- Permission-mode cycling and the live-input detector fixed at `a36ba3f`
- Scheduler, refresh cadence, SVG rendering, profile layout, labels, icons,
  page membership, model/reasoning behavior
- Weakening frontmost-window, unique-window, unique-composer, log-root,
  file-identity, bounded-read, or fresh-event checks
- Any fallback from focused task to selected, newest, or recently active task

## Git workflow

- Branch: `codex/007-single-focused-task-authority`
- Preserve any pre-existing user changes.
- Use an imperative commit message matching repository history, for example
  `Unify focused task authority`.
- Do not push or open a pull request unless the operator explicitly asks.

## Steps

### Step 1: Characterize global native witness arbitration

Add a compiled native fixture that accepts two or more temporary log files,
each with timestamped focus events, and executes the same collector/arbitrator
used by production. Do not concatenate files into one synthetic history.

Cover at least:

1. newer matching task in one file wins over an older different task;
2. newer different task invalidates an older requested-task witness;
3. equal event timestamps use file modification time deterministically;
4. equal event timestamps and equal file modification times from different file
   identities fail closed rather than choosing by enumeration order;
5. inactive, secondary, and unfocused events are ignored;
6. a new event in a different file invalidates an existing witness token;
7. expected-task, conflicting-task, then expected-task events across different
   logs invalidate the original token even though the newest event matches;
8. rotated/replaced files and events outside the bounded scan fail closed.

Use `test/active-desktop-thread.test.ts:109-131` as the expected global-ordering
semantics and `test/native-target.fixture.test.ts` as the compiled-helper test
style. Replace the existing fake `"newer-mismatch"` single-history assertion
with the real multi-file fixture. In `test/focused-target.test.ts`, remove only
the source-string assertions tied to the deleted `readLog` implementation;
retain its higher-level action-routing and focused-window policy guards. The
compiled fixture is the replacement evidence for bounded reads and
file-identity continuity.

**Verify**:
`npm run native:build && npx vitest run test/active-desktop-thread.test.ts test/focused-target.test.ts test/native-target.fixture.test.ts`
→ all tests pass, including named two-file cases.

### Step 2: Implement one native global witness observer

Refactor `freshWitness`, `currentWitness`, `freshNewWitness`, and
`hasCurrentWitness` around one collector that:

- reads at most the existing eight newest log files and existing 128MiB bound;
- records source path, file identity, cursor, renderer window, conversation ID,
  event timestamp, and file modification time;
- chooses the globally newest valid focused-primary event using the same
  ordering as `activeDesktopThreadId`;
- for an after-cursor lookup, considers every file snapshot in
  `DesktopLogCursor`, including newly created files;
- invalidates a token when any globally newer focus event targets a different
  conversation or renderer window;
- retains the existing unique-fresh-event requirement for new task creation.

Define the witness token explicitly. It must serialize:

- the expected conversation ID and renderer-window ID;
- the selected event timestamp, source path, file identity, and byte cursor;
- one baseline entry for every eligible observed log: canonical path, file
  identity, byte cursor/size, and modification time.

Token validation must inspect appended focus events after every baseline cursor
and any newly created eligible log. Any intervening different conversation or
renderer invalidates the token permanently, even if a later event returns to
the expected identity. Truncation, replacement, a lost baseline file, or an
ambiguous ordering tie must fail closed. Do not validate a token by comparing
only the single newest event.

Use event timestamp first and file modification time second. When an event has
no timestamp, use the file modification time as the TypeScript observer does.
If timestamp and modification time are both equal for different file
identities, report ambiguity and fail closed; enumeration order and path
lexicography are not identity evidence.

Do not call the TypeScript observer from Swift and do not remove the native
mutation-time check. They are independent safety observers that must implement
the same ordering policy.

**Verify**:
`npm run native:build && npx vitest run test/native-target.fixture.test.ts`
→ all target fixtures pass; newer cross-file mismatch exits nonzero.

### Step 3: Add a direct focused-row projection in `CodexStore`

Extract the current `ThreadRow -> AgentSnapshot` mapping from
`recentThreads()` into one private helper so list and focused-row projections
cannot drift.

Change `focusedThread()` to:

1. read the active ID through the existing 700ms `#activeDesktopCache`;
2. return `undefined` immediately when there is no active ID;
3. query that exact ID with a readonly parameterized SQLite query;
4. project only that row and apply the live-input overlay;
5. cache the focused projection for the same active ID for at most 700ms;
6. invalidate it when live-input state or acknowledgement state changes.

The direct query must not require the active row to be among recent rows or
have a nonempty preview. It must still reject archived or nonexistent IDs.

Preserve correct question ownership: when live input includes a nonempty owner
title, apply it only to a title-matching snapshot. Fall back to the focused ID
only when the native snapshot has no owner title. A background approval title
that does not match the directly queried focused row must not mark the focused
row as needing input.

Keep the recent list as one explicitly bounded 12-row cache; stop accepting
arbitrary larger limits that the cache cannot honor. Callers needing the
focused task must use `focusedThread()`.

**Verify**:
`npx vitest run test/local-store.integration.test.ts`
→ new fixtures with at least 13 newer rows still resolve the older active task,
and archived/missing active IDs return `undefined`.

### Step 4: Delete the obsolete selected-task mutation fallback

Remove:

- `#selectedThreadId`;
- `selectThread()`;
- `controlThread()`;
- unused `threadAtSlot()` and `threadSettings()` if repository-wide search
  confirms they still have no production caller;
- the `selectThread()` writes in both navigation actions.

Keep dial/key selection maps used for preview/navigation; they are presentation
state, not target identity. Update tests so opening a session asserts
`openThread(selected.id)` and subsequent control identity comes only from the
desktop observer.

Run:

```sh
rg -n "selectThread|controlThread|threadAtSlot|threadSettings" src
```

Expected: no production reference. Negative source-policy assertions in tests
may still quote a deleted symbol; they do not preserve the fallback.

**Verify**:
`npx vitest run test/local-store.integration.test.ts test/profile-keys.behavior.test.ts`
→ all 51 key handlers still execute, and every focused-target key still rejects
when focused identity is unavailable.

### Step 5: Run the complete release gate

Run `npm run check`. Do not alter key labels, images, profile manifests, or
page ordering to make unrelated visual checks pass.

**Verify**: `npm run check` → exit 0; output explicitly reports 51 keys,
102 raster artifacts, seven pages, all tests passing, and successful Stream
Deck validation.

## Test plan

- Native multi-file fixtures invoke production collection/arbitration.
- Store integration creates more than 12 rows and puts the active task beyond
  the list cache.
- Store integration covers empty preview, archived ID, missing ID, focus switch,
  live approval overlay invalidation, and a background approval title that must
  not mark the focused row.
- Existing `test/profile-keys.behavior.test.ts` continues iterating all 51
  contract rows and proving fail-closed behavior for every focused key.
- Existing `test/profile-keys.visual.test.ts`, run by the full gate, continues
  rendering every key at both sizes.

## Done criteria

- [ ] Native current/fresh/token validation chooses globally newest focus
      across real separate fixture files.
- [ ] A newer conflicting event in another file invalidates the old witness.
- [ ] `focusedThread()` performs an exact-ID query and succeeds beyond 12 rows.
- [ ] No selected/newest/recent fallback can provide mutation identity.
- [ ] `rg -n "selectThread|controlThread|threadAtSlot|threadSettings" src`
      shows no obsolete production path.
- [ ] Focused tests pass.
- [ ] `npm run check` passes the literal 51-key/seven-page gate.
- [ ] `git diff --check` produces no output.
- [ ] No out-of-scope file is modified except generated artifacts already
      tracked by `npm run check`, which must be byte-identical afterward.

## STOP conditions

Stop and report if:

- globally newest events cannot be ordered from timestamp plus mtime without
  weakening a current file-identity or bounded-read invariant;
- Codex logs contain focused-primary events with no usable timestamp and the
  fallback ordering would be nondeterministic;
- direct SQLite lookup requires writing, migrating, or changing Codex state;
- a production action still intentionally needs selected/newest fallback for a
  mutation;
- any of the 51 key behavior or visual cases regresses.

## Maintenance notes

Future focus observers in either language must match the same global-ordering
policy. Reviewers should scrutinize cross-file token invalidation and verify
that no convenience fallback re-enters control identity. The native and
TypeScript observers remain intentionally independent at the mutation boundary;
this plan aligns their semantics without creating a cross-process dependency.
