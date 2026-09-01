# Plan 009: Make runtime refresh incremental and change-driven

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only files listed as in scope. If a STOP condition occurs, stop and report;
> do not improvise. When done, update this plan's status row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 3afac58..HEAD -- src/lib/codex-store.ts src/lib/rollout-status.ts src/lib/render-cache.ts src/plugin.ts src/actions/agent-status.ts src/actions/agent-navigator.ts src/actions/approval-mode.ts src/actions/command.ts src/actions/context.ts src/actions/keycap.ts src/actions/model.ts src/actions/reasoning.ts src/actions/usage.ts src/actions/workflow.ts test/rollout-status.test.ts test/local-store.integration.test.ts test/model-catalog-cache.test.ts test/render-cache.test.ts test/model-dial.acceptance.test.ts test/reasoning-dial.acceptance.test.ts test/profile-keys.behavior.test.ts`
> Any change to rollout semantics, file observation, render transport, or
> action lifecycle is a STOP condition until this plan is reconciled.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED — caches must not freeze time-sensitive or acknowledged state
- **Depends on**: Plans 007 and 008
- **Category**: perf, tech-debt
- **Planned at**: approved Plan 008 tip `3afac58`, 2026-07-26

## Why this matters

The 700ms recent-thread cache is normally cold by the next 1250ms refresh, so
the plugin rereads and JSON-parses at least 12 rollout tails on nearly every
tick. Each tail read is bounded at 512KiB, producing a worst-case 6MiB read per
refresh even when no file changed. Stable model metadata is also synchronously
read and parsed repeatedly by model and reasoning draws, while static keycaps
are regenerated and sent to Stream Deck on every global refresh.

After this plan, file content and parsed events are reused until file identity
or size changes, time-dependent status is still reduced on each refresh, model
metadata has one cache, static actions do not poll, and identical render
payloads are not resent.

## Current state

- `src/lib/codex-store.ts:80-97` reads up to 512KiB from a rollout tail.
- `src/lib/codex-store.ts:293-310` expires the whole list cache after 700ms.
- `src/lib/codex-store.ts:270-301` rereads and parses each row's rollout tail.
- `src/lib/rollout-status.ts:177-195` combines JSONL parsing with state
  reduction. `reduceRolloutEvents()` separately applies current time and
  acknowledgement state, so parsed events can be cached safely while reduction
  remains fresh.
- `src/lib/codex-store.ts:181-190` reads and parses `models_cache.json` for
  reasoning. `src/lib/codex-store.ts:533-564` reads and parses it again for
  model options.
- `src/actions/model.ts:155-163` calls `modelSnapshot()` again from `draw()`.
  `src/actions/reasoning.ts:174-181` does the same for reasoning levels.
- `src/actions/keycap.ts:83-104` rereads settings, regenerates SVG, and calls
  `setImage` on every refresh despite keycap content being static while visible.
- The Elgato SDK's `setImage`/`setFeedback` calls send a WebSocket event; it does
  not deduplicate identical payloads for this plugin.
- Preserve current visual functions and status semantics. Optimization must
  occur before transport, not by weakening render checks.

## Commands you will need

| Purpose       | Command                                                                                                                                        | Expected on success                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Focused tests | `npx vitest run test/rollout-status.test.ts test/local-store.integration.test.ts test/render-cache.test.ts test/profile-keys.behavior.test.ts` | all pass                                         |
| Typecheck     | `npm run typecheck`                                                                                                                            | exit 0                                           |
| Visual QA     | `npm run qa:design`                                                                                                                            | source-pass, 51 keys                             |
| Full gate     | `npm run check`                                                                                                                                | all tests, 51 keys, seven pages, validation pass |
| Diff hygiene  | `git diff --check`                                                                                                                             | no output                                        |

## Scope

**In scope**:

- `src/lib/codex-store.ts`
- `src/lib/rollout-status.ts`
- `src/lib/render-cache.ts` (create)
- `src/plugin.ts`
- `src/actions/agent-status.ts`
- `src/actions/agent-navigator.ts`
- `src/actions/approval-mode.ts`
- `src/actions/command.ts`
- `src/actions/context.ts`
- `src/actions/keycap.ts`
- `src/actions/model.ts`
- `src/actions/reasoning.ts`
- `src/actions/usage.ts`
- `src/actions/workflow.ts`
- `test/rollout-status.test.ts`
- `test/local-store.integration.test.ts`
- `test/model-catalog-cache.test.ts` (create)
- `test/render-cache.test.ts` (create)
- `test/model-dial.acceptance.test.ts`
- `test/reasoning-dial.acceptance.test.ts`
- `test/profile-keys.behavior.test.ts`
- `plans/README.md` for status only

**Out of scope**:

- Changing polling cadence or scheduler semantics from Plan 008
- Changing status thresholds, labels, colors, icons, SVG geometry, profile
  manifests, or page membership
- Incrementally parsing an unterminated JSONL line without a proven boundary
- Caching final `running`/`thinking` state without reconsidering current time
- Caching final unread/idle state without acknowledgement identity
- Native AX traversal; that belongs to Plan 010

## Git workflow

- Branch: `codex/009-incremental-runtime-refresh`
- Commit message example: `Make runtime refresh incremental`
- Do not push or open a pull request unless explicitly instructed.

## Steps

### Step 1: Separate rollout parsing from time-sensitive reduction

Export a pure `parseRolloutEvents(content)` from
`src/lib/rollout-status.ts`. It should retain current tolerance for a partial
first line and malformed lines. Implement `parseRolloutLines()` as:

```ts
return reduceRolloutEvents(parseRolloutEvents(content), options);
```

Add tests proving parsed events can be reduced twice with different `now` and
`acknowledgedAt` values to yield different final states. Do not cache a final
`RolloutState`.

**Verify**:
`npx vitest run test/rollout-status.test.ts`
→ all existing status cases plus fresh-time/fresh-ack cases pass.

### Step 2: Cache rollout bytes and parsed events by file identity

Add one private rollout cache to `CodexStore`, keyed by canonical rollout path
and containing:

- stable file identity (device/inode when available);
- file size and modification time;
- exact tail bytes or text;
- parsed `RolloutEvent[]`.

On refresh:

1. stat the path;
2. reuse parsed events when identity, size, and mtime are unchanged;
3. reread/reparse when any key changes, size shrinks, or identity rotates;
4. always rerun `reduceRolloutEvents()` with current `now` and acknowledgement;
5. bound/evict entries that are no longer in recent or focused rows;
6. preserve the existing 512KiB maximum and partial-first-line behavior.

For testability, inject or export a narrow file-observation seam. Add an
integration test that counts tail reads across two identical refreshes, an
append, truncation, rotation, and acknowledgement change.

Expected:

- unchanged second refresh performs zero rollout reads and zero JSON parses;
- append/truncate/replace performs one read/parse for only that path;
- acknowledgement and stale-time transitions change status without rereading
  unchanged bytes.

**Verify**:
`npx vitest run test/local-store.integration.test.ts test/rollout-status.test.ts`
→ all cache-transition cases pass.

### Step 3: Parse the model catalog once per file version

Replace separate `models_cache.json` reads with one private catalog loader in
`CodexStore`, keyed by file identity/size/mtime. Both `modelSnapshot()` and
`reasoningSnapshot()` consume the same parsed object.

Change Model and Reasoning `draw()` functions to receive options/levels from
the snapshot already obtained by their caller; they must not call the store
again during the same draw.

Create `test/model-catalog-cache.test.ts`, using a temporary model-cache file
and a narrow injected reader/counting seam, to prove:

- model plus reasoning snapshots perform one file read/parse;
- unchanged calls reuse it;
- replacement/mtime change reloads it;
- invalid JSON returns current safe fallbacks and recovers after a valid rewrite.

Run:

```sh
rg -n 'readFileSync\\(join\\(this\\.codexHome, "models_cache\\.json"' src
```

Expected: one centralized loader site only.

**Verify**:
`npx vitest run test/model-catalog-cache.test.ts test/model-dial.acceptance.test.ts test/reasoning-dial.acceptance.test.ts test/local-store.integration.test.ts`
→ all pass.

### Step 4: Stop polling static action families

Classify action refresh ownership explicitly in `src/plugin.ts`:

- static while visible: Keycap and Workflow key images;
- interaction-local: Command dial selection and static Command key images;
- live: agents/sessions, Permissions, Context, Usage, Model, Reasoning, and any
  dial whose display changes when the focused task changes.

Remove static/interaction-local `refreshAll()` calls from the global refresh.
Delete now-unused methods. Keep `onWillAppear` and interaction handlers as the
render triggers.

Do not remove a refresh merely because its method looks simple; prove its
display cannot change from external focused-task state.

Add a test or action harness assertion showing multiple global refreshes do not
call `getSettings`/`setImage` for a static keycap.

**Verify**:
`npx vitest run test/profile-keys.behavior.test.ts`
→ every key still renders on appear and all 51 handlers still execute.

### Step 5: Deduplicate identical render payloads

Create `src/lib/render-cache.ts` with narrow helpers for:

- key image plus empty title;
- dial feedback objects.

Use a `WeakMap` keyed by action instance, or another lifecycle-safe key. Send
only when the serialized payload changes. A failed send must not poison the
cache: record a payload only after the SDK promise resolves.

Adopt the helper in live action families. Preserve immediate redraw after a
user interaction when the payload actually changes.

`test/render-cache.test.ts` must prove:

1. identical image sends once;
2. changed image sends again;
3. failed first send retries;
4. identical feedback sends once regardless of new object identity;
5. changed feedback sends again.

Add one action-level test showing an unchanged refresh does not emit another
transport call, while a status or display-mode change does.

**Verify**:
`npx vitest run test/render-cache.test.ts test/profile-keys.behavior.test.ts`
→ all deduplication and 51-key cases pass.

### Step 6: Run visual and complete gates

Run `npm run qa:design`, then `npm run check`. The generated SVG/PNG outputs
must remain visually identical unless the only difference is ignored cache
metadata outside the artifacts.

**Verify**:

- `npm run qa:design` reports `source-pass`, 51 keys, 102 raster artifacts;
- `npm run check` exits 0 and validates seven pages;
- `git diff --check` has no output.

## Test plan

- Pure rollout tests distinguish cached parse input from fresh reduction state.
- Temporary-file integration measures actual reader calls, not elapsed time.
- Model catalog tests prove one read across Model and Reasoning consumers.
- Render-cache tests assert SDK call counts and retry behavior.
- Existing 51-row handler test remains exhaustive.
- Full visual QA renders all 51 keys at both physical sizes.

## Done criteria

- [ ] Unchanged refreshes reread/reparse zero rollout files.
- [ ] Current time and acknowledgement still change cached-content status.
- [ ] Model and reasoning share one parsed catalog per file version.
- [ ] Static keycaps/workflow keys do not participate in global polling.
- [ ] Identical images/feedback are not resent; changed payloads are sent.
- [ ] No visual output, label, icon, page, or action contract changes.
- [ ] All focused tests pass.
- [ ] `npm run check` passes all 51 keys and seven pages.
- [ ] `git diff --check` produces no output.

## STOP conditions

Stop and report if:

- rollout status cannot be recomputed from cached events without changing
  current semantics;
- file identity cannot distinguish truncation/replacement safely;
- a supposedly static action depends on external task state;
- deduplication suppresses an SDK retry or a real display transition;
- testability appears to require broad filesystem mocking across the suite;
- any one of the 51 key behavior or visual cases changes.

## Maintenance notes

Cache parsed inputs, not time-dependent conclusions. Any future rollout field
that changes status reduction can reuse cached events; any change to JSONL
framing must revisit file-identity and partial-line handling. New action
families should declare whether they are static, interaction-local, or live
instead of automatically joining the global poll.
