# Plan 005: Native shortcuts and project affinity

> Historical execution record. The exact-target and verified-postcondition
> implementation was subsequently expanded by Plans 001–004; this file is
> retained because it records the parallel main-branch work that was reconciled.

## Goal

Keep every Stream Deck action in the Codex project that is actually focused,
and invoke native Codex shortcuts whenever the requested action has one.

## Changes

1. Route New Chat, Search, Terminal, Settings, New Project, Sidebar,
   Accept/Reject/Send, PTT, and Keyboard Shortcuts through explicit native
   shortcut definitions where Codex exposes them.
2. Keep semantic workflows as prefilled prompts, but require the focused task's
   cwd. Never fall back to a selected or recent task for mutation.
3. Resolve the newest desktop focus event across all Codex logs and clear stale
   focus when the newest event is inactive.
4. Carry the focused task ID through command, model, reasoning, approval, and
   workflow mutation paths.
5. Add a deterministic 48-key behavior audit and rerun the full build, visual,
   and profile validation gates.

## Done

- [x] All 48 keys have an explicit dispatch policy.
- [x] Every available native shortcut is used instead of prompt text.
- [x] Project-scoped actions use only the focused task/cwd.
- [x] Inactive or ambiguous focus dispatches nothing and shows an alert.
- [x] Full test, visual, build, and installed-profile gates pass.
