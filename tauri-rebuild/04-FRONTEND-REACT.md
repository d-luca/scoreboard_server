# 04 — Frontend (React + Vite)

## 1. Stack

| Concern        | Choice                                                   |
| -------------- | -------------------------------------------------------- |
| Framework      | React 19                                                 |
| Bundler        | Vite 7                                                   |
| Language       | TypeScript 5.9, `strict: true`                           |
| Styling        | Tailwind CSS 4 (`@tailwindcss/vite`)                     |
| Components     | shadcn-style local primitives (copied, not a dependency) |
| State          | Zustand 5                                                |
| Icons          | `@radix-ui/react-icons`                                  |
| Tauri bindings | `@tauri-apps/api` v2, `@tauri-apps/plugin-dialog`        |

The Electron app's `components/`, `lib/utils.ts`, `global.css` and `scoreboard.css` port
over with almost no edits. The rewrite is concentrated in `stores/` and the IPC layer.

## 2. Vite configuration

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: { alias: { "@": resolve(__dirname, "src") } },
	clearScreen: false,
	server: { port: 5173, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
	build: {
		target: "es2022",
		rollupOptions: {
			input: {
				main: resolve(__dirname, "index.html"),
				settings: resolve(__dirname, "settings.html"),
				outputs: resolve(__dirname, "outputs.html"),
				scoreboard: resolve(__dirname, "scoreboard.html"),
				control: resolve(__dirname, "control.html"),
				recording: resolve(__dirname, "recording.html"), // [OPTIONAL]
				overlayControl: resolve(__dirname, "overlay-control.html"), // [OPTIONAL]
				overlayPreview: resolve(__dirname, "overlay-preview.html"), // [OPTIONAL]
				videoGenerator: resolve(__dirname, "video-generator.html"), // [OPTIONAL]
			},
		},
	},
});
```

`[RISK]` The `scoreboard` and `control` entries are served over plain HTTP from the Rust
binary. They must not pull `@tauri-apps/api` into their chunk, or they will throw on load
in a normal browser. Guard it:

```js
// eslint.config.mjs
{
  files: ["src/entries/scoreboard.tsx", "src/entries/control.tsx", "src/features/remote/**"],
  rules: { "no-restricted-imports": ["error", { patterns: ["@tauri-apps/*"] }] },
}
```

Also verify after a build that `dist/assets/scoreboard-*.js` contains no `__TAURI__`
reference — add it as a one-line CI grep.

## 3. Two transports, one interface

Every UI surface needs the same two things: read the state, dispatch an action. The
transport differs.

```ts
// src/lib/transport.ts
import type { Action, ScoreboardState } from "@/bindings";

export interface Transport {
	getState(): Promise<ScoreboardState>;
	dispatch(action: Action): Promise<void>;
	subscribe(cb: (s: ScoreboardState) => void): () => void;
	onEvent(name: "timer-finished" | "buzzer", cb: () => void): () => void;
	status: "connected" | "connecting" | "disconnected"; // always "connected" for Tauri
}
```

- `TauriTransport` — `invoke("sb_get_state")`, `invoke("sb_dispatch", { action })`,
  `listen("state:changed", ...)`.
- `WsTransport` — the reconnecting WebSocket client from doc 02 §4.3.

`createScoreboardStore(transport)` is transport-agnostic, so `<ScoreboardControl/>` works
identically in the desktop window and on the phone. `[NEW]` — this is what lets `/control`
be a real React page instead of a duplicated HTML string.

## 4. Stores

### 4.1 `scoreboardStore`

```ts
interface ScoreboardStore {
	state: ScoreboardState; // mirror of the backend, never mutated locally
	connection: "connected" | "connecting" | "disconnected";
	dispatch: (action: Action) => Promise<void>;
	// sugar used by components
	incHome(): void;
	decHome(): void;
	incAway(): void;
	decAway(): void;
	incHalf(): void;
	decHalf(): void;
	startTimer(): void;
	pauseTimer(): void;
	stopTimer(): void;
	adjustTimer(delta: number): void;
	setTimer(seconds: number): void;
	applyLoadout(slot: 1 | 2 | 3): void;
	patch(p: Partial<ScoreboardState>): void;
	reset(): void;
}
```

**Rules:**

- The store never performs optimistic local mutation. It dispatches and waits for the
  `state:changed` event. Round-trip on the desktop is well under a frame; on the LAN it is
  a few ms. This removes every desync the Electron version fights.
- No `persist` middleware on this store. Persistence lives in Rust settings.
- `updateScoreboardDataFromExternal` disappears — there is only one inbound path.

### 4.2 `settingsStore`

Mirror of `Settings` from Rust. `set(patch)` → `invoke("settings_set")` →
`settings:changed` event → store update. Persisted by Rust, so no `persist` middleware.

### 4.3 `buzzerStore`

```ts
interface BuzzerStore {
	autoPlay: boolean; // mirrors settings.buzzerAutoPlay
	trackName: string | null;
	play(): void;
	selectTrack(): Promise<void>;
	clearTrack(): Promise<void>;
}
```

`[NEW]` The audio element source comes from `convertFileSrc(path)` (asset protocol) rather
than a `Uint8Array` shuttled over IPC and turned into a Blob URL. Preload the `<audio>`
once at startup and call `currentTime = 0; play()` on trigger. Keep the bundled
`buzzer.mp3` as the default.

`[RISK]` Autoplay policy: a webview may refuse to play audio before a user gesture. In the
desktop window this is a non-issue in practice, but on the `/control` page you must "arm"
the audio on the first tap (play a muted zero-length sound) or the timer-end buzzer will
be silently blocked on iOS Safari.

### 4.4 `serverStore`

`ServerInfo` mirror + `ServerStatus` mirror + `showAddresses: boolean` (UI-only).
Populated by `invoke("server_get_info")` / `invoke("server_get_status")` and kept current
by the `server:info` and `server:status` events.

`ServerInfo` is heavy (it carries a QR SVG) and rarely changes; `ServerStatus` is light and
changes often. Keep them in separate slices so a client connecting on the LAN does not
re-render the QR code.

### 4.5 `windowStore` `[NEW]`

```ts
interface WindowStore {
	open: AppWindow[]; // fed by window:opened / window:closed
	show(which: AppWindow): Promise<void>; // invoke("window_open")
}
```

Used by the status bar (clicking a badge opens the relevant window) and by cross-window
navigation such as the recording window's "Generate Video…" button.

### 4.6 Optional stores

`overlayStore` (doc 05), `recordingStore` and `videoGeneratorStore` (doc 06).

## 5. Entry points

```
src/entries/
  main.tsx              → index.html            (Tauri, controls + status bar)
  settings.tsx          → settings.html         (Tauri, feature window)
  outputs.tsx           → outputs.html          (Tauri, feature window)
  scoreboard.tsx        → scoreboard.html       (HTTP, OBS)
  control.tsx           → control.html          (HTTP, phone)
  recording.tsx         → recording.html        [OPTIONAL]
  overlay-control.tsx   → overlay-control.html  [OPTIONAL]
  overlay-preview.tsx   → overlay-preview.html  [OPTIONAL]
  video-generator.tsx   → video-generator.html  [OPTIONAL]
```

Every Tauri-side entry mounts the same `<TauriApp>` shell: `TauriTransport` provider,
theme, and a `useEscapeToClose()` hook on `settings`, `outputs` and `about`. Feature
windows subscribe to `state:changed` like any other window, so a value edited in Settings
is reflected in the main window before the field loses focus.

`scoreboard.tsx` is tiny:

```tsx
const cfg = window.__SCOREBOARD__;
const transport = new WsTransport(cfg.wsUrl);
createRoot(document.getElementById("root")!).render(<ScoreboardView transport={transport} />);
```

`scoreboard.html` sets `html,body { background: transparent; margin: 0; overflow: hidden }`
so OBS composites it correctly.

## 6. The visual scoreboard — exact specification

This is the one component that must look **pixel-identical** to the current app. Port it
verbatim.

### 6.1 Structure

```tsx
<div
	className="flex size-full items-center justify-between overflow-hidden bg-white text-4xl text-indigo-950"
	style={{ transform: "skewX(-15deg)", fontFamily: "Anton" }}
>
	{eventLogo && <EventLogo />}
	<div
		className="flex w-full flex-col items-center justify-center gap-0"
		style={{ transform: "skewX(15deg)" }}
	>
		<Timer value={timer} />
		<Half prefix={halfPrefix} value={half} />
	</div>
	<TeamInfo {...teams} />
</div>
```

The whole board is skewed `-15deg`; every text-bearing child is counter-skewed `+15deg`,
while the colour bars keep an extra `-15deg` so they stay parallelograms.

### 6.2 Sub-components

| Element               | Classes                                                                        | Inline style                                           |
| --------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `Timer`               | `flex items-center justify-center text-4xl`                                    | `fontFamily: "Anton"`, `lineHeight: 1`                 |
| `Half`                | `flex items-center justify-center bg-white text-sm font-bold text-neutral-950` | `fontFamily: "Poppins"`, `lineHeight: 1`               |
| Team strip            | `flex h-full gap-3 bg-indigo-950 text-nowrap`                                  | —                                                      |
| Team name row         | `flex items-center justify-between gap-2`                                      | `transform: "skewX(15deg)"`                            |
| Team name box         | `flex w-28 items-center justify-center tracking-wide text-white`               | `fontFamily: "Anton"`                                  |
| Colour bar            | `h-full w-2`                                                                   | `backgroundColor: color`, `transform: "skewX(-15deg)"` |
| Score block           | `flex items-center bg-white`                                                   | —                                                      |
| Score box             | `flex h-full w-16 items-center justify-center`                                 | `transform: "skewX(15deg)"`                            |
| Score divider wrapper | `h-2/3`                                                                        | —                                                      |
| Score divider         | `flex h-full w-0.5 bg-slate-500`                                               | —                                                      |

Fixed widths that define the layout: team name `w-28` = 7 rem, colour bar `w-2` = 0.5 rem,
score box `w-16` = 4 rem, divider `w-0.5` = 2 px at two-thirds height.

`Half` renders `prefix`, then `<span className="mx-0.5" />` as a spacer, then the value.

Timer formatting: `Math.floor(v / 60)` and `v % 60`, each `padStart(2, "0")`, joined by
`:`.

Component-level fallbacks when props are missing: names `"T-H"` / `"T-A"`, colours
`#00ff00` / `#ff0000`, scores `0`, timer `0`, half `1`.

`EventLogo` currently renders an empty `<div>`. Keep it as a stub or drop it; the
`eventLogo` field is unimplemented in the Electron app too.

### 6.3 Render target sizes

| Context                 | Size                                                     |
| ----------------------- | -------------------------------------------------------- |
| OBS / `scoreboard.html` | `600 × 80` px, `padding: 0 12px`, transparent background |
| Overlay preview window  | `600 × 80`                                               |
| In-app preview iframe   | outer container `580 × 64`, iframe `560 × 80`            |
| Video frames            | `round(600 × scale) × round(80 × scale)`                 |

Tailwind preflight makes the effective content width of the 600 px wrapper 576 px. Keep
that in mind if you tweak the padding.

### 6.4 Fonts

```css
@font-face {
	font-family: "Anton";
	src: url("./assets/Anton-Regular.ttf") format("truetype");
	font-weight: 400;
}
@font-face {
	font-family: "Poppins";
	src: url("./assets/Poppins-<weight>.ttf") format("truetype");
	font-weight: <400|500|600|700|800|900>;
}
body {
	font-family: "Poppins", sans-serif;
}
```

Anton: timer, team names, scores, and the outer container. Poppins: the half label and all
application chrome.

`[RISK]` Fonts must be `@font-face`-loaded from the embedded assets so the OBS page renders
correctly on a machine that does not have them installed. Verify the font files end up in
`dist/assets/` and are reachable at `/assets/...` through the Rust static handler.
Preload them in `scoreboard.html` with `<link rel="preload" as="font" crossorigin>` so the
first painted frame is not in a fallback face — a real problem for video generation.

## 7. Main window UI `[NEW: restructured]`

The main window contains **only** the scoreboard values, the buttons that change them, and
a status bar. No settings, no preview, no recording panel. Everything else opens from the
native menu (doc 01 §9).

### 7.1 Layout

```
Layout: flex h-screen w-screen flex-col overflow-hidden
├── <main class="flex-1 overflow-auto p-4">
│     └── ScoreboardControl        ← single column, fills the window
└── <StatusBar class="h-8 shrink-0 border-t">
```

No `Card` chrome around the control block — the window *is* the card. Drop the title
header the Electron version had; the window title bar already says it.

Sizing: designed for 720×560, usable down to 640×480. The control block scales by clamping
its own type (`text-6xl` at ≥ 700 px height, `text-5xl` below) rather than by scrolling.
A scrollbar in the main window during a live match is a failure.

### 7.2 `ScoreboardControl`

- A bordered row: home `TeamControl` | `HalfControl` | away `TeamControl`.
  Each has an uppercase label, a `text-7xl` value, a default `+1` button and a destructive
  `-1` button; buttons are `h-16 flex-1 text-xl`. `[PARITY]`
- Timer region: label, `text-4xl tabular-nums` `MM:SS`, Start/Pause button, destructive
  Reset button, and five `h-11` buttons: `+1s`, `+1m`, `-1s`, `-1m`, outlined `Buzzer`.
  Start and Reset are disabled when `timer === 0 && !isTimerRunning`. `[PARITY]`
- Three outlined loadout buttons in `grid grid-cols-3 gap-2`, `h-11` — now dispatching
  `TimerLoadout { slot }` instead of an absolute value `[NEW]`. Each button label shows the
  configured duration (`L1 15:00`) so the operator does not have to open Settings to
  remember what a slot holds `[NEW]`.
- Full-width destructive `Reset Scoreboard`, `h-12`.
- `[NEW]` Team names and colours are **displayed** here (the label above each score shows
  the team name, tinted with the team colour) but are **edited** in the Settings window.
  Double-clicking a team label is a shortcut that opens Settings on the Scoreboard tab.

Every button with a bound hotkey shows a `HotkeyBadge` and a native tooltip
(`Hotkey: Ctrl + 1`).

### 7.3 `StatusBar` `[NEW]`

A single `h-8` strip reporting the status of everything the app exposes. This is what
replaces the removed preview and feedback cards.

| Badge         | Source                                    | States                                                            | Click action                    |
| ------------- | ----------------------------------------- | ----------------------------------------------------------------- | ------------------------------- |
| Server        | `ServerStatus.running` + `port`           | green `● :3001` / red `● server down`                             | Opens the Outputs window        |
| Clients       | `ServerStatus.wsClients`                  | grey `○ no clients` / green `● 2 clients`                         | Opens the Outputs window        |
| Control token | `ServerInfo.tokenRequired`                | `🔒 protected` / amber `🔓 open`                                   | Opens Settings › Server         |
| Overlay       | `ServerStatus.overlayActive` `[OPTIONAL]` | grey `○ overlay` / blue `● overlay`                               | Toggles overlay mode            |
| Recording     | `ServerStatus.recording*` `[OPTIONAL]`    | hidden when idle / pulsing red `● REC 12:04`                      | Opens the Recording window      |
| Timer source  | `state.isTimerRunning`                    | `▶ running` / `⏸ paused`                                          | —                               |

Rules:

- Text is `text-xs`, badges separated by a `VerticalDivider`. The bar never wraps; below
  640 px width, drop labels and keep the dots, with the full text in a `title` tooltip.
- Every badge is a real `<button>` with an accessible name, not a decorative `<div>`.
- The bar must not re-render the control block. Subscribe to `serverStore` with a
  selector, not to the whole store.

### 7.4 Settings window (`settings.html`) `[NEW]`

The old `Settings` card, moved into its own window and given room to breathe. Same tab bar
as the Electron version, plus a Server tab.

**Scoreboard tab**

- `Team Home Name`, `Team Away Name`, `Half Prefix` text inputs — dispatch on change
- Home/Away colour pickers: preset swatches `#ffffff`, `#000000`, `#ffcc00`, `#0066cc`,
  `#00cc00`, plus `<input type="color">`
- Three `MM:SS` loadout inputs. Input filter allows digits and at most one colon, ≤ 3
  minute digits and ≤ 2 second digits. On blur, validate against
  `^([0-9]{1,3})(?::([0-5]?[0-9]))?$`; empty means zero; invalid reverts to the stored
  value; valid commits.
- Overlay Mode ON/OFF `[OPTIONAL]` — mirrors the `Tools › Overlay Mode` menu item

**Server tab** `[NEW]`

- Port input + `Apply & Restart Server`; shows the actually-bound port when it differs
  from the requested one
- `Require control token` toggle, with a plain-language warning when off
- `Regenerate token` button
- Read-only bound-address list

**Keyboard Shortcuts tab** `[OPTIONAL]` — see doc 05 §7.

**Buzzer tab**

- Auto Buzzer ON/OFF (now persisted in settings `[NEW]`)
- Current track: filename or `Default (built-in buzzer)`
- `Choose File…`, `Use Default` (disabled when already default), `Test`
- Supported formats note: MP3, WAV, OGG, M4A, AAC, FLAC

The window has no Save button: every change dispatches immediately, exactly as the
Electron panel did. <kbd>Esc</kbd> closes it.

### 7.5 Outputs & Sharing window (`outputs.html`) `[NEW]`

Everything the old `ScoreboardFeedback` card held, minus the cramped iframe.

- **Preview** — a live `560 × 80` iframe of `/scoreboard` on a checkerboard background so
  transparency is visible, with a scale selector (50 % / 100 % / 200 %).
- **Local output** — `http://localhost:<port>/scoreboard` with a copy button and OBS setup
  instructions (recommended browser-source width/height).
- **LAN outputs** — addresses from `server_get_info`, hidden behind an eye toggle, hidden
  by default `[PARITY]`. Each row has copy and open-in-browser actions
  (`tauri-plugin-opener`).
- **Remote control** — the `/control` URL, a QR code rendered from
  `ServerInfo.controlQrSvg`, `Copy control link`, and `Regenerate token`. The token string
  is masked until revealed by the same eye toggle.
- **Single-value outputs** — a small builder that produces `/value/:property` URLs from a
  dropdown, for operators who composite individual fields in OBS. `[NEW]` The endpoint
  exists today but is undiscoverable.

## 8. LAN remote (`/control`) `[NEW: rewritten as React]`

Feature parity with the generated page, reusing the desktop components where sizing
allows.

- Header: title `Scoreboard Remote`, connection dot, `Connected` / `Disconnected`.
- Responsive 12-column grid. ≥ 720 px: Teams 7 cols, Timer 5, Half 5, Settings 7.
  ≤ 520 px: header stacks, timer controls go two-up with the primary toggle spanning both,
  presets go single-column.
- Teams: editable name, `<input type="color">` plus presets
  `#ffffff #000000 #ffcc00 #0066cc #00cc00`, `-`/score/`+`.
- Timer: `MM:SS` display, `+1m`, `+1s`, Start/Pause, `-1s`, `-1m`, Reset,
  `Set Timer (MM:SS)` input + Set, and three loadout buttons.
  Manual parse accepts bare digits (seconds) or `M:SS` with 1–3 minute digits.
- Half: `-`, `PERIODO 1`, `+`.
- Settings: half prefix, three loadout inputs, `Reset All` with a confirm dialog.
- Buzzer: `🔔 Buzzer` and `Auto: ON/OFF`, playing `/buzzer.mp3` on the `timer-finished`
  event when auto is on.
- Text inputs must not be overwritten by incoming state while focused `[PARITY]` — this
  detail is what makes the current remote usable; keep it.
- Touch ergonomics `[PARITY]`: buttons `min-height 48px`, inputs `44px`, `8px` radius,
  `touch-action: manipulation`, press-scale animation, safe-area padding, visible focus
  outlines.
- Palette: background `#0f172a`, panels `#1e293b`, secondary `#334155`; blue for primary
  and positive, red for negative/destructive, amber for accents; timer in
  `Consolas, Monaco, monospace`.

`[NEW]` Add a "read-only" banner when the socket reports `unauthorized`, instead of
silently ignoring taps.

## 9. Hooks

| Hook                             | Purpose                                                 |
| -------------------------------- | ------------------------------------------------------- |
| `useTransport()`                 | Context providing the active `Transport`                |
| `useScoreboard(selector)`        | Zustand selector over the mirrored state                |
| `useLocalHotkeys()`              | Window `keydown` handling for the focused window        |
| `useFormattedTimer(seconds)`     | Memoized `MM:SS`                                        |
| `useOverlayTimer()` `[OPTIONAL]` | Thin wrapper dispatching timer actions from the overlay |

`useLocalHotkeys` `[PARITY]`: ignores events whose target is `INPUT`, `TEXTAREA` or
`contentEditable`; iterates mappings in action order; the first match calls
`preventDefault()` and dispatches.

`useScoreboardData` from the Electron app is deleted — it was a second, non-subscribing
copy of the state.

## 10. UI primitives to port

`Button`, `Input`, `Label`, `ColorPicker`, `Select` (+ `SelectValue`, `SelectTrigger`,
`SelectContent`, `SelectItem`), `Card` (+ `CardHeader`, `CardTitle`, `CardDescription`,
`CardContent`, `CardFooter`), `HotkeyBadge`, `ValueBox`, `VerticalDivider`.

Keep the existing Radix Select scrollbar fix: Radix injects
`[data-radix-select-viewport]::-webkit-scrollbar{display:none}` and
`scrollbar-width:none`; override it with a **more specific selector**, not just a class on
the viewport.

## 11. Frontend quality gates

- `tsc --noEmit` clean, `strict: true`, no `any` in `src/lib` or `src/stores`.
- ESLint with the Tauri-import restriction from §2.
- Visual check: screenshot the scoreboard at 600×80 and diff against a reference PNG
  exported from the Electron build before you delete it. Do this early — it is the only
  cheap way to guarantee pixel parity.
