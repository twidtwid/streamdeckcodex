# Plan 018: Patch Stream Deck tooling and dependency advisories

**Status:** DONE  
**Priority:** P1  
**Effort:** S  
**Risk:** Low  
**Depends on:** Plan 013  
**May run in parallel with:** Plans 014–017 after Plan 013  
**Target baseline:** canonical public descendant established by Plan 013

## Why

The public lineage already uses the current Stream Deck SDK architecture (SDK 3 manifest, Node 24 runtime, Stream Deck 7.1 minimum) and has newer Elgato packages than the stale saved-project tree. A current full audit still found high-severity development-chain advisories involving `brace-expansion`, `minimatch`, `fast-uri`, and `nanoid`, while the production-only audit was clean. The correct refresh is a narrow dependency and release-tooling update, not a plugin rewrite.

## Current state and evidence

- Audited public main already includes `@elgato/streamdeck` 2.1.2 and CLI 1.9.0-era updates.
- Manifest architecture is SDK version 3 with Node 24 and minimum Stream Deck 7.1.
- Full local audit during the review reported four high-severity development dependency findings.
- Production audit reported zero vulnerabilities.
- Public history already addressed one `fast-uri` path, but the final canonical lockfile must be audited again after Plan 013.
- The manifest lacks a verified support URL suitable for packaged distribution.

## Drift check

```sh
git status --short
git rev-parse HEAD
npm outdated || true
npm audit
npm audit --omit=dev
node -p "require('./package.json').devDependencies"
rg -n 'SDKVersion|Software|Nodejs|SupportURL' com.todd.streamdeckcodex.sdPlugin/manifest.json
```

Record the actual canonical versions and advisories. Stop if remediation requires an unreviewed major SDK/runtime migration or production dependency downgrade.

## Scope

- Update direct Elgato SDK/CLI and build/test dependencies to current compatible stable patch/minor versions.
- Remove known full-audit advisories using direct upgrades or narrowly justified overrides.
- Verify lockfile determinism and Node 24 compatibility.
- Add a valid project support URL to the manifest.
- Make full and production audits explicit release gates with documented policy.

## Out of scope

- Rewriting the plugin to a new SDK architecture when the current architecture remains supported.
- `npm audit fix --force` or unreviewed major-version upgrades.
- Runtime behavior changes from Plans 014–017.
- Adding unrelated libraries or replacing the test framework.

## Git workflow

Create `codex/018-dependency-refresh` from the completed Plan 013 commit. Prefer one commit for dependency/lockfile changes and a second for release-gate/manifest documentation. Rebase onto completed behavior plans before final release validation and resolve lockfile conflicts by regenerating from reviewed `package.json`, never by hand-merging lock entries.

## Implementation steps

### 1. Establish the supported-version matrix

Check official Elgato documentation/release notes and npm metadata for the direct packages. Record:

- installed and target package versions;
- supported Node versions;
- required Stream Deck software version;
- manifest SDK compatibility;
- relevant breaking changes.

Use primary sources only. Do not increase the minimum Stream Deck version unless a selected dependency requires it and the user accepts that compatibility change.

### 2. Update direct dependencies first

Upgrade direct packages one at a time or in coherent vendor groups. Regenerate the lockfile with the repository’s package manager. Run typecheck/tests/build after the Elgato group before touching generic tooling so regressions have a clear cause.

### 3. Remediate transitive advisories narrowly

For each remaining advisory:

- identify the dependency path with `npm explain`;
- prefer an upstream direct dependency update;
- use `overrides` only when the fixed version is semver-compatible and its owner has not yet released a parent update;
- document why the override is safe and when it can be removed.

Never use `npm audit fix --force`.

### 4. Add release audit scripts

Provide unambiguous scripts for:

- full dependency audit;
- production-only audit;
- outdated informational report;
- deterministic clean install in CI.

Both audits must be visible in the release checklist. If a dev-only advisory has no safe fix, it requires an explicit, time-bounded exception with package path, exposure analysis, and review date; no silent suppression.

### 5. Add and validate SupportURL

Set `SupportURL` to the repository’s public issues/help location. Validate manifest schema and packaged artifact after the change.

## Test plan

- Clean `npm ci` from the committed lockfile.
- Full and production audits.
- Typecheck, unit/native fixtures, build, Elgato validate, and pack.
- Inspect packed artifact for only expected runtime dependencies and no dev credentials/cache files.
- Run Plan 015 dial event-path tests and Plan 014 PTT safety tests after rebasing.
- If direct SDK behavior changed, reload connected Stream Deck and verify plugin registration, keys, encoders, touch strip, property inspectors, and no question marks.

## Verification commands

```sh
npm ci
npm run audit:full
npm run audit:production
npm run check
npm run build
npm run validate
npm run pack
```

Also run `npm explain <package>` for every override and preserve the explanation in the PR/commit notes.

## Machine-checkable done criteria

- [ ] Direct Elgato packages match current compatible stable versions documented from primary sources.
- [ ] `npm ci` succeeds with no lockfile changes.
- [ ] Production audit reports zero vulnerabilities.
- [ ] Full audit reports zero vulnerabilities, or every remaining dev-only item has an explicit approved exception and expiry date.
- [ ] No `--force` audit fix or unbounded override is present.
- [ ] Manifest passes official validation and contains a working `SupportURL`.
- [ ] Built and packed plugin passes the full project gate after rebase.

## STOP conditions

- A fix requires a major SDK/runtime migration or raises the minimum Stream Deck version.
- A transitive override fails the dependency’s own tests or crosses a declared incompatible range.
- A production advisory has no safe compatible fix.
- The official Elgato validator rejects the target package/manifest combination.
- Packaging unexpectedly includes secrets, caches, source maps with private paths, or development-only binaries.

## Maintenance notes

- Review temporary overrides monthly and remove them when upstream packages update.
- Keep full audit and production audit separate so development-chain risk remains visible.
- Recheck official SDK compatibility before every major Node or Stream Deck minimum-version change.
