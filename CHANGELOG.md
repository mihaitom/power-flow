# Changelog

All notable changes to this project are documented here. Versions match the
ones published on [npm](https://www.npmjs.com/package/powerflow).

Reconstructed from git history for versions that predate this file — dates
are the release commit's date, entries are grouped by what they mean for
consumers of the package rather than a raw commit log.

## [Unreleased]



## [1.1.0] — 2026-07-31

### Added

- New `dotShape` options and additional layout options (`rowGap`/`columnGap`)
- Battery charge/discharge highlight enhancements
- Reset-to-defaults functionality for the playground's controls

### Fixed
- corrected the min+gzip badge/size mentioned in the README

## [1.0.0] — 2026-07-28

First stable release.

### Added

- Customizable appearance options: icons, `dotShape`, `curveBend`
- Playground: URL state, browser history and icon management for the demo

### Changed

- Consolidated all `PowerFlow` configuration into a single `options` object
- Battery power sign convention (charge/discharge) clarified and corrected

### Fixed

- Crash in non-DOM environments (e.g. SSR) — `PowerFlowElement` now falls
  back to a plain stand-in class when `HTMLElement` isn't available

## [0.1.4] — 2026-06-06

### Changed

- Smoother dot/node animation transitions
- Readability tweaks: larger simulation-time font, clearer button/input colors
- Vite dependency update; committed `package-lock.json` removed

## [0.1.3] — 2026-06-06

### Added

- `icons` and `speedScale` properties on `PowerFlowElement`

### Changed

- Better default values for the playground
- Clearer README wording around node descriptions and layout
- `@mdi/js` moved to `devDependencies` (icons are inlined, not a runtime dep)

## [0.1.2] — 2026-06-05

### Added

- GIF capture script for recording demos (auto-installs `puppeteer-core`)

### Changed

- Battery icon positioning
- Battery color handling and layout responsiveness on mobile

## [0.1.1] — 2026-06-05

- Patch release, no functional changes beyond the version bump.

## [0.1.0] — 2026-06-05

Initial public release.

### Added

- Animated, framework-agnostic SVG power-flow diagram: solar, grid, home and
  battery nodes with flow dots whose speed follows the actual power
- `<power-flow>` web component and vanilla `PowerFlow` API
- Demo/playground site, deployed to GitHub Pages

[Unreleased]: https://github.com/mihaitom/power-flow/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/mihaitom/power-flow/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mihaitom/power-flow/compare/v0.1.4...v1.0.0
[0.1.4]: https://github.com/mihaitom/power-flow/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/mihaitom/power-flow/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/mihaitom/power-flow/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/mihaitom/power-flow/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/mihaitom/power-flow/releases/tag/v0.1.0
