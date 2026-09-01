# Plan 013: Reconcile the canonical baseline and installed lineage

**Status:** DONE  
**Priority:** P0  
**Effort:** L  
**Risk:** High  
**Depends on:** None  
**Planned from:** local `main` at `a36ba3fa8725b98b6797af7b42798c5f32e804fb`, audited 2026-08-31  
**Target baseline:** current public `origin/main`, audited at `126cdad091e4ebf82ef9628b1c8b4c8a626abbf2`

## Why this comes first

The saved project and the public repository have unrelated Git histories. The saved project is running an older implementation through the installed Stream Deck symlink, while the public history already contains the focused-task, serialized-refresh, incremental-render, and canonical-profile work recorded in Plans 007–012. Merging these histories blindly would duplicate fixes, overwrite user files, and make it impossible to prove which code is installed.

This plan establishes one reviewed baseline without using `--allow-unrelated-histories`, destructive resets, or a disposable worktree as the live plugin target.

## Current state and evidence

- Saved-project `main`: `a36ba3fa8725b98b6797af7b42798c5f32e804fb`.
- Local tracking `origin/main` observed during the audit: `a2aa280…`; public GitHub `main`: `126cdad091e4ebf82ef9628b1c8b4c8a626abbf2`.
- `git merge-base HEAD origin/main` returns no merge base.
- `git rev-list --left-right --count HEAD...origin/main` returned `37 8` before refreshing the public ref.
- The public lineage includes the completed focused-task/profile work from Plans 007–012, including a direct focused-row query in `src/lib/codex-store.ts`; the saved-project source still lets a 12-row cache satisfy a later 50-row request.
- The installed plugin is a symlink into this saved project, so changing branches or moving the checkout can change the live device runtime.
- Existing dirty/untracked files, including `plans/README.md`, Plans 007–012, and user assets, must be treated as user-owned.

## Drift check

Before implementing, run:

```sh
git status --short
git rev-parse HEAD
git fetch origin
git rev-parse origin/main
git merge-base HEAD origin/main || true
git log --oneline --decorate --graph --all -30
```

Expected result: the saved project still has unrelated histories and `origin/main` is `126cdad…` or a descendant. Stop and re-review this plan if `origin/main` contains structural changes after `126cdad…` outside dependency, documentation, or generated-asset updates.

## Scope

- Preserve every pre-existing dirty or untracked user file.
- Create explicit backup refs for the saved-project lineage.
- Build a canonical branch from the refreshed public `origin/main` in a separate worktree.
- Port only local-only plans and user artifacts that are intentionally retained.
- Prove the public focused-task/refresh/profile invariants are present.
- Add a non-secret, reproducible build identity containing plugin version and Git commit, with no timestamp, task ID, path, or dirty-file list.
- Return the reviewed canonical tree to the saved project before any live relink/reload.

## Out of scope

- Fixing cleanup, dial dispatch, capability, or diagnostics behavior; those are Plans 014–017.
- Dependency remediation beyond establishing a reproducible install; that is Plan 018.
- Merging unrelated histories, rewriting public history, or deleting the old local lineage.
- Copying installed bundles back over source.

## Git workflow and preservation procedure

1. Record the exact dirty inventory without modifying it:

   ```sh
   git status --short --untracked-files=all
   git diff --binary > /private/tmp/streamdeckcodex-pre-013.patch
   git ls-files --others --exclude-standard > /private/tmp/streamdeckcodex-pre-013-untracked.txt
   git branch backup/pre-013-local-main a36ba3fa8725b98b6797af7b42798c5f32e804fb
   ```

   Verification: the patch and inventory are nonempty when the worktree is dirty, and `git show-ref --verify refs/heads/backup/pre-013-local-main` succeeds.

2. Create a temporary reconciliation worktree from public main:

   ```sh
   git worktree add /private/tmp/streamdeckcodex-013 -b codex/013-canonical-baseline origin/main
   ```

   Verification: `git -C /private/tmp/streamdeckcodex-013 rev-parse HEAD` equals the refreshed public SHA.

3. Compare, do not merge:

   ```sh
   git diff --stat origin/main backup/pre-013-local-main
   git diff --no-index /private/tmp/streamdeckcodex-013/plans ./plans || true
   ```

   Classify each local-only file as user artifact, historical plan, generated output, or obsolete duplicate. Record the classification in the implementation PR/commit message.

4. Port selected files with explicit patches or file-by-file copies. Plans 007–012 remain historical records and are marked as completed on the recovered public lineage. Do not port source hunks already represented by public commits.

5. Commit on `codex/013-canonical-baseline`. After review, move the saved project to the reviewed canonical commit using a non-destructive handoff that preserves its dirty files. Never make `/private/tmp/streamdeckcodex-013` the installed plugin target.

## Implementation steps

### 1. Establish the public source-of-truth invariants

Confirm the canonical branch contains all of the following before adding new behavior:

- Direct authoritative focused-task lookup rather than reliance on the recent-thread cache.
- Live composer snapshot support.
- Serialized refresh coordination.
- Incremental render caching.
- Canonical generated two-page profile contract.
- The tests associated with Plans 007–012.

Verification commands:

```sh
rg -n "focusedThread|composer-read|RefreshCoordinator|render cache|profile" src scripts test tests
npm ci
npm run check
npm audit --omit=dev
```

Expected: dependency install succeeds, the full project check passes, and the production audit reports zero vulnerabilities.

### 2. Add reproducible build identity

Add a small generated module or esbuild define containing:

- manifest/plugin version;
- exact Git commit used for the build;
- a schema version for the build-info structure.

Generate it through a checked script and log it once at plugin startup. The generator must support `--check` so CI can detect stale build information. Do not include build time, username, filesystem path, branch name, task/thread IDs, transcripts, or dirty filenames.

Verification:

```sh
npm run build-info:generate
npm run build-info:check
npm run build
rg -n "commit|version" com.todd.streamdeckcodex.sdPlugin/bin/plugin.js
```

Expected: two builds from the same commit produce identical build-info content, and the bundled plugin contains the expected commit and version.

### 3. Preserve and reconcile plan records

Update `plans/README.md` so Plans 007–012 are clearly described as historical work recovered from the public lineage, not changes to replay manually. Add Plans 013–019 with dependencies and status.

Verification: every plan number appears once in the index and every referenced plan file exists.

### 4. Hand the canonical tree back to the saved project

After the branch is reviewed and committed:

- ensure the saved-project dirty inventory still matches the pre-plan inventory;
- move or cherry-pick the reviewed canonical commit into the saved project without deleting user files;
- run the validation gate in the saved path;
- only then relink/reload the plugin, if the operator explicitly authorizes the live deployment step.

Verification:

```sh
git status --short --untracked-files=all
git rev-parse HEAD
npm ci
npm run check
readlink "$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/com.todd.streamdeckcodex.sdPlugin"
```

Expected: the saved project is on the canonical reviewed commit; preserved files remain present; the installed link, if enabled, points to the saved project rather than `/private/tmp`.

## Test plan

- Full `npm run check` on the canonical branch and again in the saved project.
- `npm audit --omit=dev` reports zero production vulnerabilities.
- Build-info generation is deterministic and stale-state detection fails as intended in a negative fixture.
- Focused-task regression fixture proves a focused task outside the first 12 recent rows still resolves.
- Generated profile parity and Elgato validation pass.
- If live deployment is approved: reload Stream Deck, confirm the plugin process logs the expected version/SHA, and visually verify normal labels/icons rather than question marks.

## Machine-checkable done criteria

- [ ] `git merge-base backup/pre-013-local-main origin/main` remains empty; no unrelated-history merge commit was created.
- [ ] `backup/pre-013-local-main` resolves to `a36ba3f…`.
- [ ] All pre-plan dirty/untracked files are accounted for and preserved.
- [ ] Canonical source descends from refreshed public `origin/main`.
- [ ] Plans 007–012 are indexed as recovered historical work.
- [ ] `npm ci`, `npm run check`, and `npm audit --omit=dev` pass in the saved project.
- [ ] The built plugin exposes the exact canonical commit and plugin version without private data.
- [ ] No installed symlink points to a temporary reconciliation worktree.

## STOP conditions

- Public `origin/main` has new structural source changes after the audited `126cdad…` that overlap this plan.
- Any dirty or untracked user file cannot be classified or preserved safely.
- The installed plugin link resolves to a path other than the saved project or known prior saved path.
- A step would require `git reset --hard`, deletion of user files, or `--allow-unrelated-histories`.
- The public baseline fails its own checks before local-only work is applied.

## Maintenance notes

- Keep the backup branch until at least one tagged release from the reconciled lineage has been installed and verified.
- Build identity should be the first fact requested in future device/runtime bug reports.
- Future plans should drift-check against the canonical public descendant, not `a36ba3f…`.
