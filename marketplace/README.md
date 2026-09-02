# Marketplace media

`npm run marketplace:media` creates the public PNG artwork for Elgato Maker
Console in `marketplace/media/`:

- `thumbnail.png` — primary product image
- `gallery-01-live-status.png`
- `gallery-02-controls.png`
- `gallery-03-workflows.png`
- `gallery-04-key-actions.png`
- `app-icon.png` — 288 × 288 Maker Console app icon

Every image is a 1920 × 960 PNG. Maker Console uploads come straight from
this directory; there is no separate submission copy to keep in sync. The
generator builds the compositions from the project’s generated profile-key
renderings in `.cache/profile-visual-qa`.
Those renders contain only this project’s original key artwork; the media does
not include Codex, Stream Deck, or other application screenshots.

If the visual-QA cache is missing, the generator first runs the same local
profile-rendering script as `npm run qa:visuals`. To refresh the source artwork
explicitly, run that command before generating Marketplace media.

## Claims represented in the artwork

- Model-specific profiles are bundled for Stream Deck, Mini, Neo, XL, and
  Stream Deck +. Button-only profiles contain no encoder actions.
- Every profile has live chat status, controls, and workflow pages. Dials are
  an additional Stream Deck + feature.
- The named controls and status views are provided by the plugin. The artwork
  does not imply affiliation with OpenAI, Elgato, Corsair, or any other brand.

Before upload, verify that the release’s supported macOS, Stream Deck, and
Codex versions still match the repository README and release notes.
Refer to the product as the **Stream Deck App** in Maker Console copy.
