# Scoreboard Server — developer documentation

Design and reference documentation for the Tauri app. For installing, running and using
the app, see the [project README](../README.md).

| Document                                                                                                       | What it covers                                                                                     |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [architecture.md](architecture.md)                                                                             | Process model, source layout, state and event flow, windows, menu                                  |
| [protocol.md](protocol.md)                                                                                     | WebSocket, HTTP API, control token, Tauri commands and events                                      |
| [timer.md](timer.md)                                                                                           | Timer engine: countdown / count-up, ticking, actions                                               |
| [frontend.md](frontend.md)                                                                                     | Bundles, transports, stores, scoreboard visual spec, windows, remote                               |
| [features/presets.md](features/presets.md)                                                                     | Team and match presets                                                                             |
| [features/recording-video.md](features/recording-video.md)                                                     | `.sbrec` recordings and WebM video generation                                                      |
| [features/overlay.md](features/overlay.md)                                                                     | Overlay mode and global hotkeys — **planned, not implemented**                                     |
| [Scoreboard Designer: feature contract](features/scoreboard_designer/scoreboard-designer.md)                   | Custom scoreboard definitions, scope and publishing — **planned, not implemented**                 |
| [Scoreboard Designer: editor design](features/scoreboard_designer/scoreboard-designer-editor.md)               | Designer UI, layout rules and editing interactions — **planned, not implemented**                  |
| [Scoreboard Designer: implementation plan](features/scoreboard_designer/scoreboard-designer-implementation.md) | Dependencies, work packages, decision gates and completion criteria — **planned, not implemented** |
| [build-release.md](build-release.md)                                                                           | Toolchain, scripts, CI, packaging, ffmpeg sidecar, release checklist                               |
| [testing.md](testing.md)                                                                                       | Automated tests and the manual regression checklist                                                |
| [pitfalls.md](pitfalls.md)                                                                                     | Known traps and the reasons behind non-obvious code                                                |

## Conventions

- **Types are not copied into these docs.** Every data contract is a Rust type exported
  to TypeScript by ts-rs; the generated files in [`src/bindings/`](../src/bindings/) are
  the reference. Regenerate them with `pnpm bindings`.
- Docs describe design and invariants, and link to the source for details. When
  behaviour changes, update the doc in the same commit.
