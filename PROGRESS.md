# Project status

Refresh implementation and automated verification are complete on 2026-09-01
against public baseline `126cdad`. The saved project now uses the canonical
public lineage; the prior local lineage and all user artifacts remain on local
safety branches.

## Completed in this refresh

- Recovered the focused-task, serialized-refresh, incremental-render, and
  canonical-profile work from the public lineage without merging unrelated
  histories.
- Added reproducible build identity and non-fatal, idempotent PTT cleanup with
  paired-release and privacy regression tests.
- Replaced helper-only Model/Reasoning checks with actual dial event-path tests:
  rotate emits no mutation; press emits one exact focused-task mutation.
- Unified model/effort capabilities from the current Codex model cache. Future
  Luna/Terra/Sol versions, None, Minimal, and model-dependent Ultra are handled
  without version-specific Swift tables.
- Added reason-coded read-only health diagnostics and `npm run doctor`. Live
  verification reads Context, Model, Reasoning, Usage, install, and input
  health. Permissions now shows the actual bounded cause instead of generic
  Unknown; the current locked/background desktop correctly reports
  `codex-background`.
- Confirmed zero GitHub issues. The only public fork has no unique commits and
  is 16 commits behind current main, so there is nothing appropriate to copy.
- Confirmed the project already uses the current official Stream Deck SDK
  architecture: SDK 3, Node 24, Stream Deck 7.1+, `@elgato/streamdeck` 2.1.2,
  and CLI 1.9.0. Patched current dependency advisories to a zero-vulnerability
  lockfile.

## Verified gates

- `npm ci`, 455 unit/acceptance tests, typecheck, native build, all seven
  generated profile pages, 144px/72px visual QA, public-tree scrub, and the
  official Elgato validator pass.
- Full and production audits both report zero vulnerabilities.
- The validated plugin package builds successfully with the working public
  support URL and contains only the expected 29 runtime/profile files.
- The installed plugin is the saved-project symlink; Context, Model, Reasoning,
  Usage, and input-release health are readable without private content.
- Post-reload monitoring found Stream Deck currently lacks usable Accessibility
  authorization; the plugin now renders `Access` and logs only the transition
  rather than repeating the same failure every refresh tick.

## Next verified step

- Clean build `7785d2f` was loaded through the installed saved-project link and
  monitored for two minutes. The process stayed alive, emitted each health
  transition once, and retained released input state.
- Restore Stream Deck under **System Settings → Privacy & Security →
  Accessibility**, then put an empty Codex composer frontmost before running
  reversible connected Model/Reasoning and mode QA. Until then those gates are
  intentionally blocked and perform no mutation.

## Release rule

Run `npm run release:verify` before publishing. Connected evidence is separate
and build-specific. Never publish local Codex logs, transcripts, rollout data,
account details, private paths, or connected-device profile databases.
