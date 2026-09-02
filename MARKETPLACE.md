# Elgato Marketplace readiness

This checklist maps Codex Companion to Elgato's current official requirements.
It is release evidence, not a substitute for Maker Console review.

## Plugin package

- [x] Reverse-DNS plugin UUID includes author and product identity.
- [x] Every action UUID is prefixed by the plugin UUID.
- [x] SDK version 3 and Stream Deck 7.1 minimum.
- [x] Node.js SDK `@elgato/streamdeck` 2.x and Node.js 24 runtime.
- [x] macOS 13 minimum is declared.
- [x] Plugin and category names are aligned.
- [x] Eleven actions—within Elgato's recommended 2–30 range.
- [x] Descriptive action names and tooltips.
- [x] Profile-only generic keycap action is hidden from the action list.
- [x] Failed actions use `showAlert`; successful actions use state updates or
      `showOk`.
- [x] Support and public project URLs are declared.
- [x] `streamdeck validate` passes.
- [x] `streamdeck pack` creates a directly installable `.streamDeckPlugin`.

## Artwork

- [x] Plugin icon is PNG at 256 × 256 and 512 × 512.
- [x] Category and action-list artwork is white monochrome SVG on transparency.
- [x] Dynamic key artwork is rendered at high-DPI key size and changes with
      state.
- [x] Touch-strip layout stays inside 200 × 100 bounds.
- [x] Marketplace thumbnail and gallery images are 1920 × 960 PNG.
- [x] Gallery media uses only project-owned artwork and accurate feature copy.

## Distribution, privacy, and licensing

- [x] Runtime package files are immutable.
- [x] Runtime code does not read `manifest.json`.
- [x] The package includes the project's MIT license.
- [x] The package includes full licenses for all bundled runtime dependencies.
- [x] `.sdignore` excludes logs, source maps, and macOS metadata.
- [x] Public-tree scrub rejects private Mac paths, credential-shaped values,
      private keys, databases, logs, and secret-file extensions.
- [x] No analytics, telemetry, independent network service, or separate
      credentials.

## Profiles and compatibility

- [x] Model-specific profiles are registered for Stream Deck (type 0), Mini
      (type 1), XL (type 2), Stream Deck + (type 7), and Neo (type 9).
- [x] Profiles are generated from one canonical key contract, retain logical
      page boundaries, and contain no encoder actions on button-only devices.
- [x] Every profile is editable and does not auto-switch merely because it was
      installed.
- [x] Documentation names macOS, supported device families, and dial-only
      features.
- [x] Button-only support is labeled beta until independent hardware testing.

## Maker Console handoff

Before submitting:

1. Confirm the Marketplace organization name is exactly `Todd Dailey`,
   matching the manifest author. The established
   `com.todd.streamdeckcodex` UUID must not change after publication.
2. Confirm `Codex Companion` is still unique in Marketplace search.
3. Upload the packaged plugin, 1920 × 960 thumbnail, at least three 1920 × 960
   gallery PNGs, description, support link, and release notes.
4. Download the processed DRM build from Maker Console and repeat install,
   runtime, and hardware checks before publication.
5. Accurately select macOS and the hardware families that completed physical
   testing. Do not promote automated profile validation as a hardware test.

## Official references

- [Plugin guidelines](https://docs.elgato.com/guidelines/stream-deck/plugins/)
- [Manifest reference](https://docs.elgato.com/streamdeck/sdk/references/manifest/)
- [Distribution and DRM](https://docs.elgato.com/streamdeck/sdk/introduction/distribution/)
- [Plugin packaging](https://docs.elgato.com/streamdeck/cli/commands/pack/)
- [Profile guidelines](https://docs.elgato.com/guidelines/stream-deck/profiles/)
- [Maker Console submission](https://docs.elgato.com/maker-console/submitting-products/)
