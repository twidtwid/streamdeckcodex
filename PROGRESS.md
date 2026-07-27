# Project status

Codex Companion is preparing for its first public beta.

## Ready

- Stream Deck + seven-page profile and four-dial layout
- Standard key actions for button-only Stream Deck devices
- Local-only Codex status, usage, context, and workflow controls
- Automated formatting, type, unit, visual, packaging, and Elgato validation
- Community, security, contribution, and third-party license documentation

## Beta validation

- Stream Deck + has completed connected hardware testing.
- Button-only actions pass automated SDK and manifest validation; independent
  hardware testing is pending.
- Button-only profiles are not bundled because Elgato profiles are specific to
  each device model.

## Release rule

Run `npm run check`, `npm audit --omit=dev`, and `npm run pack` before
publishing. Never publish local Codex logs, transcripts, rollout data, account
details, private paths, or connected-device profile databases.
