# Build Progress

Updated: 2026-07-25 15:34 PDT

## Current phase

Final connected-device and documentation QA. The linked companion is running
on the connected Stream Deck Plus, with the redesigned Page 1 open in the
active two-page profile.

## Completed

- Implemented the independent Codex Micro-inspired two-page control surface,
  live agent states, workflow launchers, guarded PTT, Model/Reasoning dials,
  Usage, and the Action dial.
- Replaced Page 2's direct Skills key with a focused-chat, read-only Context
  key. Skills remains on the Action dial.
- Context defaults to percentage remaining plus `LEFT`; pressing toggles to
  separate compact USED and MAX token lines. Its meter represents context used
  without a redundant text caption.
- Context rejects missing, malformed, unrelated, future, and stale data rather
  than showing an invented value.
- Made Plan a real bidirectional active-chat toggle with visible postcondition
  verification and symmetric `ACTIVE/PLAN` and `OFF/PLAN` feedback.
- Removed Fast's generic command-menu path. Because this Codex build exposes no
  verifiable focused-composer Fast control, Fast now refuses safely with
  `UNSUPPORTED` and does not type or open a cross-chat chooser.
- Verified draft preservation for Plan and Fast and retained all PTT
  modifier-release safeguards.
- Passed 83 automated tests, typecheck, production build, and Elgato manifest
  validation.
- Live focused-chat QA read `105904/258400` (59% left), showed `--` on a
  different chat without verified data, and restored the source chat value.
- Reopened Stream Deck 7.5 and verified the installed `Codex Companion copy 1`
  Page 2: normal actions, default `59% / LEFT` Context face, used meter, no
  clipping, no ellipsis, and no question marks. The two-line exact face was
  also checked in the connected-device preview.
- Verified the already-open local activity page received new worker
  transitions without a manual reload.
- Replaced Page 1's unsafe blind Accept/Reject keys with bounded Previous
  Session and Next Session. Page 2 Accept/Reject remain intact.
- Unified Page 1 keys, Dial 1, and Previous/Next on one ordered eight-session
  projection. Labels prefer meaningful title words, use project identity for
  delegated/untitled/raw-ID sessions, fit seven characters without ellipses,
  and deduplicate deterministically.
- Passed 92 automated tests and production key-event QA: Previous opened live
  `SDCodex` from `Voice`; Next returned to `Voice`; both exact task IDs were
  observed and composer keyboard-event count was zero.
- Verified the connected Page 1 preview with actual current data: `Voice`,
  `SDCodex`, `OldBld`, `TermHTM`, `Laguna`, `Chrome`; Dial 1 showed
  `SESSION 1/8 / Voice`; active/status treatments matched; Next showed
  `NEWEST`; there was no clipping or question-mark action.
- Replaced the shared session colors with the exact official Codex Micro
  palette: running/thinking `#9CD5FE`, unread `#9BF396`, needs-input
  `#FFD0B8`, and error `#FF7373`; idle/off behavior is unchanged.
- Kept Model/Reasoning preview amber at `#F4B740`. Exact-color tests cover Page
  1, Dial 1, and Previous/Next; active/inactive needs-input fixtures passed
  contrast and fit inspection.
- Passed 96 automated tests, typecheck, production build, Elgato validation,
  linked-plugin restart, runtime connection, and connected-device preview. The
  live preview showed the new running/unread palette with no question marks.

## Next verified step

Use the active `Codex Companion copy 1` profile. After a Codex or Stream Deck
upgrade, rerun `npm run check`, `npm run qa:modes`, `npm run qa:sessions`, and
the connected-device acceptance matrix in `QA.md`.

## Blockers

- No genuine Codex approval/question is currently pending in the live session
  list, so the connected peach needs-input state has not been claimed from a
  fabricated fixture. It is ready for observation at the next real decision
  gate.
- Fast cannot be called ready on the current Codex desktop build: no safe,
  visible, focused-composer Fast state/control is exposed for verified toggling.
- Two stale one-page Stream Deck profiles remain untouched; deleting them
  requires an explicit user decision because they may contain customizations.
