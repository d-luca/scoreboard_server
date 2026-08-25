# Scoreboard Server — Tauri Rebuild Documentation

This folder contains everything needed to rebuild **Scoreboard Server** from zero on
**Tauri v2 + Rust + React/Vite**, replacing the current Electron implementation.

## Reading order

| #   | Document                                                      | Purpose                                                              |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| 00  | [Overview](./00-OVERVIEW.md)                                  | Product spec, feature inventory, scope, decisions, glossary          |
| 01  | [Architecture](./01-ARCHITECTURE.md)                          | Process model, module map, Electron→Tauri mapping                    |
| 02  | [Data Contracts](./02-DATA-CONTRACTS.md)                      | State schema, WS protocol, HTTP API, IPC commands & events           |
| 03  | [Backend (Rust)](./03-BACKEND-RUST.md)                        | Crates, state, timer engine, axum server, settings, security         |
| 04  | [Frontend (React)](./04-FRONTEND-REACT.md)                    | Vite setup, entry points, stores, components, scoreboard visual spec |
| 05  | [Feature: Overlay](./05-FEATURE-OVERLAY.md)                   | **Optional.** Floating windows + global hotkeys                      |
| 06  | [Feature: Recording & Video](./06-FEATURE-RECORDING-VIDEO.md) | **Optional.** Match recording + ffmpeg video generation              |
| 07  | [Build & Release](./07-BUILD-RELEASE.md)                      | Bundling, sidecars, CI, Windows/Linux packaging                      |
| 08  | [Implementation Plan](./08-IMPLEMENTATION-PLAN.md)            | Phased milestones with acceptance criteria                           |
| 09  | [Feature: Presets](./09-FEATURE-PRESETS.md)                   | Team library + match presets, Presets window, Presets menu           |

## Fast facts

- **Target platforms:** Windows, Linux
- **Backend:** Pure Rust (axum + tokio), no Node runtime at runtime
- **Frontend:** React 19 + Vite 7 + TypeScript + Tailwind 4 + Zustand 5
- **UI shape:** the main window holds **only** the scoreboard values, their buttons and a
  status bar. Settings, Outputs & Sharing, Recording, Video Generator and the overlay each
  live in their own window, opened from the native menu bar (00 §3.1, 01 §9).
- **Optional features:** Overlay mode (05), Recording + Video generation (06)
- **Scope stance:** open rebuild — improvements are proposed and marked `[NEW]`

## Conventions used in these docs

- `[PARITY]` — behaviour must match the Electron app exactly.
- `[NEW]` — an intentional improvement over the Electron app.
- `[OPTIONAL]` — deferrable feature; the app must be shippable without it.
- `[RISK]` — something that can bite you; read before implementing.
