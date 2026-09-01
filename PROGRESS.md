# Project status

## Current phase

Release candidate installed and verified on Sagan on 2026-09-01. There are no
known implementation blockers.

## Completed

- Reconciled the saved project onto the canonical public lineage while
  preserving the earlier local work on safety branches.
- Confirmed the public repository has no filed issues. Its only public fork has
  no unique commits, so there was no licensed feature work to copy back.
- Confirmed current Elgato architecture and tooling: SDK 3, Node 24, Stream Deck
  7.1 minimum, `@elgato/streamdeck` 2.1.2, and CLI 1.9.0. Full and production
  dependency audits are clean.
- Fixed the Sagan startup loop caused by unbounded defensive PTT cleanup. All
  synthesized key/mouse paths are bounded and pair down/up cleanup.
- Fixed bundled-profile activation races by targeting only connected supported
  devices, switching profiles sequentially, and recording success only after
  actions become visible.
- Updated the native Codex adapter for the current desktop UI: AX depth 27,
  Chromium empty-composer placeholders, compact/advanced picker nesting, and
  semantic AXPress for final Model/Reasoning selection.
- Verified on the Sagan disposable task that Model changed from 5.6 Sol to 5.6
  Terra and Reasoning changed from High to Light, with live picker readback.
- Ran the real Stream Deck action-event harness on Sagan. Model and Reasoning
  rotation caused zero Codex mutation; each dial press applied once; Plan
  activated with verified feedback; the harness restored Terra, Light, and
  Plan-off afterward.
- Verified Ultra on Sagan with Terra: the companion selected Ultra, chose the
  bounded `Continue` path without enabling Full access, read back Ultra from the
  live picker, and restored Light. Luna continues to omit unsupported Ultra.
- Verified the registered Plan and Fast action paths on Sagan in both
  directions. Each press emitted one task-bound toggle, the visible composer
  confirmed ACTIVE then OFF, and the harness restored both modes off.
- Verified the attached Stream Deck Plus (serial `EL18L1A03393`) is enumerated,
  Stream Deck 7.5.1 runs Node 24.13.1, the Codex Companion profile renders all
  keys/dials without question marks, and the plugin survives its former restart
  boundary.
- Built and packaged clean commit `6b97001`, installed that exact bundle on
  Sagan, and restarted only the Codex Companion process. The replacement PID
  remained alive beyond 40 seconds and the connected Stream Deck editor showed
  the two-page profile with normal keys/dials and no question marks.
- Passed 483 unit/acceptance tests, typecheck, native build, seven-page profile
  parity, 144px/72px visual QA, public-tree scrub, bundle build, and the official
  Elgato validator.

## Next verified step

No required implementation step remains. User-facing hardware use can now
exercise the installed Sagan build; any newly observed behavior should be filed
as a concrete regression rather than inferred from fixture-only evidence.

## Evidence boundary

The USB device and installed profile were observed on Sagan. The connected dial
gate exercises the real registered action handlers and visible Codex UI through
a local SDK event transport; it is not a claim that a human physically turned
each encoder. Do not publish Codex logs, transcripts, task IDs, account data, or
local profile databases.
