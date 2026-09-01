# Plan 011: Generate every profile consumer from one 51-key contract

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only files listed as in scope. If a STOP condition occurs, stop and report;
> do not improvise. When done, update this plan's status row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat dbc90f0..HEAD -- profile-src scripts test/helpers/profile-key-contract.ts test/profile-keys.behavior.test.ts test/profile-keys.visual.test.ts package.json README.md`
> Expected: no output. Commit `dbc90f0` is the verified combined Plan
> 009/010/012 baseline; any later key/page/action contract drift is a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED — action IDs and page ordering are externally meaningful
- **Depends on**: Plans 007 through 009 and Plan 012
- **Category**: tech-debt, tests, dx, perf
- **Planned at**: combined commit `dbc90f0f751426f2d50bc98080fb527570708e7f`,
  2026-07-26

## Why this matters

The profile is hand-described in at least four places: generated page input,
the 533-line test contract, evaluator expectations, and renderer page IDs.
Connected QA then bundles the test helper with a fake Vitest module just to
recover supposedly canonical data. A profile change therefore requires
synchronized edits across production manifests, tests, rendering, and QA, and
drift is detected only after expensive work.

After this plan, one assertion-free data contract defines all 51 keys, seven
pages, stable action IDs, behavior/target metadata, and visual settings.
Manifests, tests, evaluator, renderer, installer, and connected QA consume that
contract directly. The build verifies generated parity before testing and
performs each expensive generation/native-build step only once.

## Current state

- `scripts/generate-keycap-pages.mjs:12-73` defines Pages 3–7 labels, icons,
  actions, and membership.
- `test/helpers/profile-key-contract.ts:73-483` separately defines 51 rows with
  page, position, action ID, label, UUID, settings, behavior, target, and icon.
- `scripts/evaluate-profile-design.mjs:41-127` repeats seven page names,
  expected labels, key count, and live anchors.
- `scripts/render-profile-visuals.mjs:51-59` separately hard-codes seven page
  IDs/slugs.
- `scripts/lib/connected-qa.mjs:80-109` bundles the test helper with esbuild and
  aliases Vitest to a fake shim to load `PROFILE_KEY_CONTRACT`.
- `package.json:31` builds native before every `npm test`.
  `package.json:40` builds native again inside `npm run build` and regenerates
  tracked icon/profile sources after earlier tests consumed them.
- `test/profile-keys.behavior.test.ts:307` iterates every contract row through
  its real keypad handler. `test/profile-keys.visual.test.ts:40` renders every
  contract row. These exhaustive matrices must remain, but their data source
  should not live in a test-only module.
- The governing invariant in `plans/README.md` is literal: all 51 keys across
  all seven pages must be accounted for. Empty positions are intentional.

## Commands you will need

| Purpose          | Command                                                                                                            | Expected on success                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Generate profile | `npm run profile:generate`                                                                                         | exit 0; deterministic manifests                     |
| Check parity     | `npm run profile:check`                                                                                            | exit 0; no generated drift                          |
| Contract tests   | `npx vitest run test/profile-contract.test.ts test/profile-keys.behavior.test.ts test/profile-keys.visual.test.ts` | all 51 rows pass                                    |
| Visual QA        | `npm run qa:design`                                                                                                | source-pass, 51 keys, 102 rasters, seven pages      |
| Full gate        | `npm run check`                                                                                                    | generation once, native build once, all checks pass |
| Diff hygiene     | `git diff --check`                                                                                                 | no output                                           |

## Scope

**In scope**:

- `profile-src/profile-contract.json` (create)
- `profile-src/streamdeckcodex-plus/manifest.json`
- `profile-src/streamdeckcodex-plus/Profiles/*/manifest.json`
- `scripts/generate-profile.mjs` (create)
- `scripts/generate-keycap-pages.mjs` (remove after parity)
- `scripts/render-profile-visuals.mjs`
- `scripts/evaluate-profile-design.mjs`
- `scripts/install-keycap-pages.mjs`
- `scripts/lib/connected-qa.mjs`
- `scripts/build-profile.mjs`
- `scripts/generate-lucide-paths.mjs`
- `scripts/generate-wordmark-paths.mjs`
- `test/helpers/profile-key-contract.ts`
- `test/profile-contract.test.ts` (create)
- `test/profile-keys.behavior.test.ts`
- `test/profile-keys.visual.test.ts`
- `test/build-pipeline.test.ts` (create)
- `test/connected-qa.test.ts`
- `test/keycap-visuals.test.ts`
- `test/manifest.test.ts`
- `test/profile-installer.test.ts`
- `package.json`
- `.github/workflows/ci.yml` only if the reordered gate changes prerequisites
- `com.todd.streamdeckcodex.sdPlugin/streamdeckcodex-plus.streamDeckProfile`
- `README.md`
- `plans/README.md` for status and corrected current counts

**Out of scope**:

- Any label, icon, page position, UUID, action ID, command/workflow prompt, dial
  behavior, or visual design change
- Adding/removing/reordering keys or pages
- Changing the Stream Deck archive format or removing the tracked archive
- Completing the blocked connected destructive gate in Plan 004
- Replacing Lucide or wordmark generation
- Dependency upgrades

## Git workflow

- Branch: `codex/011-canonical-profile-contract`
- Commit message example: `Canonicalize the Stream Deck profile contract`
- Do not push or open a pull request unless explicitly instructed.

## Steps

### Step 1: Capture the current 51-key state as neutral canonical data

Create `profile-src/profile-contract.json`. It must be assertion-free data and
contain:

- profile name/preconfigured name;
- exactly seven ordered pages with stable page IDs and names;
- every occupied keypad position;
- stable `ActionID`, UUID, settings, label/name, behavior, target, and icon;
- explicit intentional empty positions or enough dimensions to prove them;
- renderer/evaluator metadata such as page slug and live OCR anchors, kept
  separate from action semantics inside the same page record.

Generate the initial JSON from current manifests plus the existing test helper,
then review it. Do not manually retype UUIDs or IDs. Add a schema/type guard in
`test/profile-contract.test.ts` that rejects:

- duplicate page IDs;
- duplicate page/position pairs;
- duplicate action IDs;
- unknown behavior/target values;
- missing command/workflow/icon registry references;
- any count other than 51 keys/seven pages;
- page key counts other than 8, 8, 8, 8, 8, 6, 5.

The first committed contract must be semantically identical to current
manifests and `PROFILE_KEY_CONTRACT`.

**Verify**:
`npx vitest run test/profile-contract.test.ts`
→ exactly 51 unique keys and seven ordered pages pass.

### Step 2: Make tests load the neutral contract directly

Reduce `test/helpers/profile-key-contract.ts` to:

- its TypeScript type definitions;
- a JSON loader and runtime validation;
- test helper functions that assert manifest parity.

Delete the 51-row literal. Keep `PROFILE_KEY_CONTRACT` as a typed exported view
if that avoids unnecessary churn in exhaustive tests.

Update behavior and visual tests to consume the same loaded data. The behavior
test must continue to execute every one of the 51 real handlers, and the visual
test must continue to render every one.

**Verify**:
`npx vitest run test/profile-contract.test.ts test/profile-keys.behavior.test.ts test/profile-keys.visual.test.ts`
→ all rows pass; output names all 51 parameterized cases.

### Step 3: Generate all seven keypad manifests from the contract

Create `scripts/generate-profile.mjs` with two modes:

- write mode updates all seven keypad controller `Actions`, page names, root
  page ordering/current page, and stable manifest names from the contract;
- `--check` mode computes the same expected JSON and exits nonzero with a
  concise list of drifted files without modifying them.

Preserve encoder controllers and other manifest fields not owned by the
contract. Use deterministic JSON formatting. Generate Pages 1–2 as well as
Pages 3–7; do not keep a second hand-authored “special page” path.

Replace `profile:keycaps` with:

```json
"profile:generate": "node scripts/generate-profile.mjs",
"profile:check": "node scripts/generate-profile.mjs --check"
```

Remove `scripts/generate-keycap-pages.mjs` only after write mode produces a
byte/semantic-equivalent profile and `--check` passes.

**Verify**:

```sh
npm run profile:generate
npm run profile:check
git diff -- profile-src/streamdeckcodex-plus
```

Expected: parity check exits 0; no semantic action/page change from the
pre-plan baseline.

### Step 4: Point renderer, evaluator, installer, and connected QA at the contract

- Renderer derives ordered page IDs/slugs from the contract; delete
  `sourcePages`.
- Evaluator derives page count, key count, names, labels, anchors, and expected
  positions from the contract. Keep independent design rules such as edge,
  contrast, redundancy, and nonblank-glyph checks; do not turn the evaluator
  into “compare the contract to itself.”
- Installer derives expected page count/order from the contract while still
  matching target directories case-insensitively.
- Connected QA reads/parses the JSON directly. Delete the esbuild bundle,
  temporary Vitest shim, and test-to-production dependency.

Run:

```sh
rg -n "expectedPages|sourcePages|vitest-shim|PROFILE_KEY_CONTRACT.*test/helpers|keys.length === 51|pages.length === 7" scripts
```

Expected: no duplicated contract literal or fake Vitest loader. Numeric design
thresholds may remain where they are true visual rules, not profile membership.

**Verify**:
`npm run qa:design`
→ source-pass, 51 keys, 102 rasters, seven pages.

### Step 5: Reorder the full gate so generated code is validated, not rewritten afterward

Create one ordered verification flow in `package.json`:

1. check generated icon/profile parity without rewriting;
2. build the native helper once;
3. formatter/typecheck/tests;
4. visual QA;
5. bundle the TypeScript plugin without rebuilding native or regenerating
   tracked sources;
6. Stream Deck validation.

Preserve standalone `npm test` ergonomics. Avoid npm's implicit `pretest`
inside `npm run check` by introducing explicit internal scripts, for example
`test:unit` and `build:bundle`; choose names consistent with current scripts.

Add `--check` support to `scripts/generate-lucide-paths.mjs` and
`scripts/generate-wordmark-paths.mjs`: compute the expected module text in
memory, compare it to the tracked file, and exit nonzero without writing on
drift. Their default mode must retain existing generation behavior. Combine
these with `profile:check` in a `generated:check` script that runs before
typecheck/tests.

The normal full gate must invoke `swiftc` exactly once. The build must not
silently rewrite a tracked icon/profile module after tests have passed.

Create `test/build-pipeline.test.ts`. It must parse `package.json` scripts and
assert the expanded `check` pipeline order, prove the explicit unit-test stage
does not trigger npm's implicit `pretest` lifecycle, and prove
`scripts/build-native.mjs` occurs exactly once in that expanded path. It must
also execute each icon/profile generator's `--check` mode and require exit 0,
so a declared check mode that silently writes or skips comparison cannot pass.
Update CI only if necessary to call the same `npm run check`.

**Verify**:

```sh
npm run check | tee /tmp/streamdeckcodex-check.log
rg -c "> node scripts/build-native.mjs" /tmp/streamdeckcodex-check.log
```

Expected: full gate passes and the count is `1`.

### Step 6: Correct stale active documentation

Update README statements that currently say “two live-control pages and four
curated pages”; the current layout is two live pages plus five curated Pages
3–7. Keep historical plan files intact, but mark Plan 004's 48-key/six-page
language as superseded by the active 51-key/seven-page invariant in the index.

Do not rewrite historical plan bodies unless necessary to label them clearly
as historical.

**Verify**:

```sh
rg -n "four curated|48-key|six pages" README.md plans/README.md
```

Expected: README has no incorrect current count; the index describes old
48-key material only as historical/blocked.

### Step 7: Run the complete gate twice

Run `npm run check` twice. The second run must not modify tracked files.

**Verify**:

- both runs exit 0;
- both report all 51 keys and seven pages;
- `npm run profile:check` exits 0;
- `git status --short` after the second run contains only intentional source
  changes for this plan;
- `git diff --check` has no output.

## Test plan

- Contract schema/parity tests cover all 51 rows and reject duplicate IDs,
  positions, invalid registries, wrong counts, and wrong page ordering.
- Existing handler matrix still invokes all 51 real keypad handlers.
- Existing visual matrix still renders all 51 at 144px and 72px.
- Generator check mode detects one deliberately altered temporary manifest.
- Renderer/evaluator retain independent visual-quality rules.
- Build-order test proves native and generators run once and before consumers.

## Done criteria

- [ ] One neutral contract is the only hand-maintained source of page/key
      membership, IDs, behavior, target, and visual metadata.
- [ ] All seven keypad manifests are generated from it.
- [ ] Tests, renderer, evaluator, installer, and connected QA consume it.
- [ ] No test-only module is bundled into production QA.
- [ ] Full check builds native exactly once and never validates stale generated
      sources.
- [ ] Two consecutive full gates are clean and deterministic.
- [ ] All 51 handlers and all 51 visuals pass; seven pages remain installed.
- [ ] No label, icon, action, position, ID, or page changes.

## STOP conditions

Stop and report if:

- current manifests and the 51-row helper disagree before migration;
- preserving stable action IDs requires regenerating IDs;
- generating Pages 1–2 would overwrite encoder or non-keypad state;
- evaluator independence would be lost by deriving a genuine quality rule from
  the same contract it evaluates;
- full check cannot avoid two native builds without breaking standalone tests;
- any action, label, icon, position, page, or visual output changes.

## Maintenance notes

Future profile changes start in the neutral contract, run
`profile:generate`, and commit both contract and deterministic manifests.
Reviewers should reject direct manifest membership edits that do not update the
contract. Keep visual-quality rules independent: the contract says what should
exist; the evaluator decides whether it is legible and intentional. The
packaged `.streamDeckProfile` remains a tracked in-scope derivative and must be
regenerated deterministically whenever owned profile JSON changes.
