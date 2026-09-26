# Frontend

React 19 + Vite + TypeScript (strict) + Tailwind CSS 4 + Zustand 5. UI primitives are
local shadcn-style components in [`src/components/ui/`](../src/components/ui/).

## Pages and bundles

One Vite build ([`vite.config.ts`](../vite.config.ts)) with one HTML entry per page in
[`pages/`](../pages/). The dev server runs on port 1420 (`devUrl` in `tauri.conf.json`).

| Page                                                                                                    | Served by                 | Entry                                                                   |
| ------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------- |
| `index.html` (main window)                                                                              | Tauri                     | [`src/main.tsx`](../src/main.tsx) → `App.tsx`                           |
| `splash.html`                                                                                           | Tauri                     | static                                                                  |
| `settings.html`, `outputs.html`, `presets.html`, `recording.html`, `video-generator.html`, `about.html` | Tauri                     | `src/entries/<Name>/`                                                   |
| `scoreboard.html`                                                                                       | LAN (`/scoreboard`)       | [`entries/scoreboard.tsx`](../src/entries/scoreboard.tsx)               |
| `value.html`                                                                                            | LAN (`/value/{property}`) | [`entries/value.tsx`](../src/entries/value.tsx)                         |
| `control.html`                                                                                          | LAN (`/control`)          | [`entries/control.tsx`](../src/entries/control.tsx) → `features/remote` |
| `overlay-*.html`                                                                                        | —                         | placeholders, see [features/overlay.md](features/overlay.md)            |

**LAN bundles must be Tauri-free.** `scoreboard`, `value` and `control` run in ordinary
browsers (OBS, phones) and would throw on load if they pulled in `@tauri-apps/api`. Two
guards enforce it:

- an ESLint `no-restricted-imports` rule on those entries and `src/features/remote/**`
  ([`eslint.config.mjs`](../eslint.config.mjs));
- a CI step that fails if `dist/assets/scoreboard-*.js` or `dist/assets/control-*.js`
  contains `__TAURI__`.

The Rust server embeds `dist/` and injects `window.__SCOREBOARD__` (WS URL, initial
`scoreAnimationEnabled`) into LAN pages, so one bundle works on any host and port.

## Transports

Every surface needs the same two things — read state and dispatch actions — over a
different channel. [`Transport`](../src/lib/transport.ts) abstracts it:

- [`tauriTransport`](../src/lib/tauriTransport.ts) — `invoke("sb_get_state")`,
  `invoke("sb_dispatch", { action })`, `listen("state:changed")`.
  `onScoreAnimation` follows `settings:changed`.
- [`WsTransport`](../src/lib/wsTransport.ts) — reconnecting WebSocket with jittered
  backoff. Seeds `onScoreAnimation` from the bootstrap and follows `score-animation`
  events. Inside an iframe it adds `?internal=1` so the in-app preview is not counted as
  a LAN client.

Because stores and components take a transport, `ScoreboardControl` and the scoreboard
render identically on the desktop and over the LAN.

## Stores

In [`src/lib/stores/`](../src/lib/stores/): `scoreboard`, `desktopScoreboard`, `settings`,
`presets`, `server`, `buzzer`, `window`, `recording`, `video`.

Rules:

- **No optimistic mutation.** Stores dispatch and wait for the state event; the desktop
  round-trip is well under a frame.
- **No `persist` middleware.** Persistence lives in Rust.
- Keep `ServerInfo` (heavy, QR SVG, rarely changes) and `ServerStatus` (light, frequent)
  apart, and subscribe with selectors, so a LAN client connecting does not re-render the
  control block or the QR code.

## Scoreboard visual spec

Components: [`src/components/Scoreboard/`](../src/components/Scoreboard/). Geometry
constants shared with the video renderer: [`scoreboardGeometry.ts`](../src/lib/scoreboardGeometry.ts).

- The board is **600 × 80**, skewed **−15°**; every text-bearing child is counter-skewed
  +15°, while the colour bars keep the skew so they stay parallelograms.
- Layout widths: team name `w-28` (112 px), colour bar `w-2` (8 px), score box `w-16`
  (64 px), divider 2 px at two-thirds height.
- Colours: board `#ffffff`, team strip `#1e1b4b` (indigo-950), divider `#64748b`.
- Fonts: **Anton** for the timer, team names and scores; **Poppins** for the half label
  and app chrome. Both are embedded (`src/assets/`, OFL) and preloaded, so OBS renders
  correctly on machines without them and the first video frame is not in a fallback font.
- The skew widens the bounding box by ~21 px, so the OBS page and the video frame are
  **622 × 80** with the board centred (`BOARD_PAD_X` = 11).
- Timer format is `MM:SS` ([`format.ts`](../src/lib/format.ts)); the half is
  `"<prefix> <n>"`.
- `scoreboard.html` has a transparent background so OBS composites it.

**RollingScore.** When `scoreAnimationEnabled` is on, each changed digit rolls
odometer-style (460 ms; up on increase or carry, down on decrease). A press mid-roll
retargets from the in-flight value. At rest the score is plain, untransformed text, so
the OBS frame stays crisp. When off, the score is a static readout.

The canvas renderer for video ([`renderScoreboardToCanvas.ts`](../src/lib/renderScoreboardToCanvas.ts))
re-implements this spec; change both together.

## Main window

`App.tsx`: `ScoreboardControl` fills the window and `StatusBar` sits at the bottom. No
settings, preview or recording panels — those are separate windows. Designed for 720×560,
usable at 640×480 without a scrollbar.

**ScoreboardControl** ([`components/ScoreboardControl/`](../src/components/ScoreboardControl/)):
home `TeamControl` | `HalfControl` | away `TeamControl`, then `TimerControl` (value,
Start/Pause, Reset, ±1s/±1m, Buzzer, three loadout buttons labelled with their duration)
and a full-width Reset Scoreboard. Team names and colours are displayed here but edited in
Settings. In countdown, Start and Reset are disabled at `00:00`; count-up can start from
`00:00`. Buttons with a hotkey show a `HotkeyBadge` and a tooltip.

**StatusBar** ([`components/StatusBar/`](../src/components/StatusBar/)): one `h-8` strip,
never wrapping; every badge is a real `<button>`.

| Badge         | Shows                                    | Click            |
| ------------- | ---------------------------------------- | ---------------- |
| Connection    | only when the transport is not connected | —                |
| Timer         | ▼/▲ + running / paused                   | —                |
| Server        | `:port` or down                          | Outputs          |
| Clients       | external WS client count                 | Outputs          |
| Control token | protected / open                         | Settings         |
| Auto buzzer   | on / off                                 | Settings         |
| REC           | `● REC MM:SS`, only while recording      | Recording window |

**Hotkeys** ([`hotkeys.ts`](../src/lib/hotkeys.ts), [`useLocalHotkeys`](../src/lib/hooks/useLocalHotkeys.ts)):
window-focused only. Defaults: `Q`/`A` home ±, `E`/`D` away ±, `]`/`[` half ±, `Space`
start, `P` pause, `S` stop, `↑`/`↓` ±1 s, `Shift+↑`/`↓` ±1 min, `Ctrl+1/2/3` loadouts,
`Ctrl+Shift+R` reset. Events from `INPUT`, `TEXTAREA` or `contentEditable` targets are
ignored; the first match calls `preventDefault()` and dispatches.

## Feature windows

- **Settings** ([`entries/Settings/`](../src/entries/Settings/)) — tabs _Scoreboard_
  (names, colours, prefix; timer direction toggle and `MM:SS` loadouts; Appearance →
  Score animation), _Server_ (port, require token, regenerate token, bound addresses), _Buzzer_ (auto
  play, track, default, test). No Save button: every change is applied immediately.
  Loadout inputs accept digits and one colon, validate on blur against
  `^([0-9]{1,3})(?::([0-5]?[0-9]))?$`, revert when invalid.
- **Outputs & Sharing** ([`entries/Outputs/`](../src/entries/Outputs/)) — live preview
  iframe of `/scoreboard` (internal client), local and LAN URLs (LAN addresses hidden
  behind an eye toggle by default), control URL with QR code and masked token,
  `/value/{property}` URL builder.
- **Presets** — see [features/presets.md](features/presets.md).
- **Recording** and **Video Generator** — see
  [features/recording-video.md](features/recording-video.md).

## LAN remote (`/control`)

[`src/features/remote/RemoteControl/`](../src/features/remote/RemoteControl/): sections
for teams (name, colour, score ±), timer (display, ±1m/±1s, Start/Pause, Reset, set
`MM:SS`, loadouts), half, buzzer, and settings (prefix, loadouts, Reset All with confirm).

- **Focused inputs are never overwritten** by incoming state (`DraftInput`); this is what
  makes the remote usable.
- Touch ergonomics: buttons ≥ 48 px, inputs ≥ 44 px, `touch-action: manipulation`,
  safe-area padding, visible focus outlines.
- A **read-only banner** is shown when the socket reports `unauthorized`.
- Buzzer audio (`/buzzer.mp3`) must be armed on the first tap, or iOS Safari silently
  blocks the timer-end sound.

## Quality gates

- `tsc --noEmit` clean with `strict: true`; ESLint clean (including the Tauri-import rule).
- Radix Select hides its scrollbar with an injected rule; override it with a **more
  specific selector**, not a class on the viewport.
