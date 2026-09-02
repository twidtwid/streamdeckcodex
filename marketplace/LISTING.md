# Codex Companion Marketplace listing

## Product

- **Name:** Codex Companion
- **Type:** Stream Deck plugin
- **Category:** Development
- **Price:** Free
- **Operating system:** macOS 13 or later
- **Stream Deck App:** 7.1 or later
- **Language:** English
- **Dial support:** Yes
- **Profiles:** Yes

## Description

Codex Companion puts the Codex desktop App on your Stream Deck with live,
local controls for active chats, permissions, voice input, model and reasoning
settings, usage, context, and common coding workflows.

Keys update as your Codex sessions change, showing running, unread, waiting,
and approval states at a glance. Stream Deck + adds four live dials for session
navigation, actions, model selection, and reasoning effort. Ready-made,
editable profiles are included for Stream Deck, Stream Deck Mini, Stream Deck
Neo, Stream Deck XL, and Stream Deck +.

Everything runs locally on your Mac. No API key, account token, telemetry,
background service, or separate Codex CLI installation is required.

Requires macOS 13 or later, Stream Deck App 7.1 or later, and the Codex desktop
App installed and signed in. Stream Deck Accessibility permission is required
for local App control.

Codex Companion is an unofficial community project and is not affiliated with
or endorsed by OpenAI, Elgato, or Corsair.

## Additional links

- **Project:** https://github.com/twidtwid/streamdeckcodex
- **Support:** https://github.com/twidtwid/streamdeckcodex/issues
- **Setup guide:** https://github.com/twidtwid/streamdeckcodex#install-from-github
- **Privacy:** https://github.com/twidtwid/streamdeckcodex#privacy-and-security

## Release notes — 0.2.2

- Updated for the new Codex model navigation: model and reasoning dials drive
  the Select model submenu and the five-segment Power control, Ultra included
- Permissions cycle only through the modes Codex offers, so Full Access
  returns to Ask
- No native helper spawns while Codex is unreachable; usage and health work
  off the refresh tick
- Smaller public tree with behavioral tests and corrected docs

## Release notes — 0.2.1

- Repairs the bundled native helper's executable permission on fresh installs
- Documents the separate `trampoline_handler` Accessibility grant used by
  Stream Deck 7.5

## Release notes — 0.2

- Editable profiles generated for Stream Deck, Mini, Neo, XL, and Stream Deck +
  from one 50-key contract
- Live Codex chat status, unread, running, approval, usage, and context keys
- Fast-mode and permission controls, including Ask, Approve, YOLO, and Custom
- Push-to-talk, compact, new chat, new project, workflow, and command actions
- Stream Deck + dials for sessions, actions, model, and reasoning effort
- Reason-coded failure states instead of an ambiguous Unknown
- Local-only macOS integration with no API keys or telemetry

## Media

- **Thumbnail:** `marketplace/media/thumbnail.png`
- **Gallery 1:** `marketplace/media/gallery-01-live-status.png`
- **Gallery 2:** `marketplace/media/gallery-02-controls.png`
- **Gallery 3:** `marketplace/media/gallery-03-workflows.png`
- **Gallery 4:** `marketplace/media/gallery-04-key-actions.png`
- **App icon:** `marketplace/media/app-icon.png`

## Upload package

`dist/com.todd.streamdeckcodex.streamDeckPlugin`
