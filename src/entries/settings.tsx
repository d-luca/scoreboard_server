import React from "react";
import ReactDOM from "react-dom/client";
import "../global.css";
import { ColorPicker } from "../components/ui/ColorPicker/ColorPicker";
import { Button } from "../components/ui/Button/Button";
import { Input } from "../components/ui/Input/Input";
import { Label } from "../components/ui/Label/Label";
import { DraftInput } from "../features/remote/DraftInput";
import { useBuzzerStore } from "../lib/buzzer-store";
import { formatTimer } from "../lib/format";
import { useServerStore } from "../lib/server-store";
import { useSettingsStore } from "../lib/settings-store";
import { useEscapeToClose } from "../lib/use-escape-to-close";

/**
 * Settings window (doc 04 §7.4). Every change dispatches immediately and is
 * persisted by Rust (debounced, atomic) — there is no Save button.
 * `Esc` closes the window.
 */

type Tab = "scoreboard" | "server" | "buzzer";

function SettingsWindow(): React.JSX.Element {
	useEscapeToClose();
	const [tab, setTab] = React.useState<Tab>("scoreboard");

	const settings = useSettingsStore((store) => store.settings);
	const refresh = useSettingsStore((store) => store.refresh);
	const refreshServer = useServerStore((store) => store.refresh);
	const refreshBuzzer = useBuzzerStore((store) => store.refresh);

	React.useEffect(() => {
		void refresh();
		void refreshServer();
		void refreshBuzzer();
	}, [refresh, refreshServer, refreshBuzzer]);

	if (!settings) {
		return (
			<div className="flex h-screen w-screen items-center justify-center">
				<p className="text-app-tertiary text-sm">Loading settings…</p>
			</div>
		);
	}

	return (
		<div className="bg-app-primary flex h-screen w-screen flex-col overflow-hidden">
			<header className="border-app-primary flex items-center justify-between gap-3 border-b px-4 py-3">
				<h1 className="font-[Poppins] text-lg font-semibold">Settings</h1>
				<nav className="flex gap-1" aria-label="Settings sections">
					{(
						[
							["scoreboard", "Scoreboard"],
							["server", "Server"],
							["buzzer", "Buzzer"],
						] as const
					).map(([key, label]) => (
						<button
							key={key}
							type="button"
							onClick={() => setTab(key)}
							aria-current={tab === key ? "page" : undefined}
							className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
								tab === key ? "bg-app-tertiary text-app-primary" : "text-app-tertiary hover:text-app-primary"
							}`}
						>
							{label}
						</button>
					))}
				</nav>
			</header>
			<main className="flex-1 overflow-auto p-4">
				{tab === "scoreboard" && <ScoreboardTab />}
				{tab === "server" && <ServerTab />}
				{tab === "buzzer" && <BuzzerTab />}
			</main>
			<footer className="text-app-quaternary border-app-primary border-t px-4 py-2 text-xs">
				Changes apply immediately and are saved automatically. Press Esc to close.
			</footer>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Scoreboard tab                                                      */
/* ------------------------------------------------------------------ */

function ScoreboardTab(): React.JSX.Element {
	const settings = useSettingsStore((store) => store.settings)!;
	const set = useSettingsStore((store) => store.set);

	const commit = (patch: Parameters<typeof set>[0]): void => {
		void set(patch).catch(() => undefined);
	};

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<section className="flex flex-col gap-3" aria-labelledby="settings-teams">
				<SectionHeading id="settings-teams">Teams</SectionHeading>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="Team Home Name" htmlFor="team-home-name">
						<DraftInput
							id="team-home-name"
							className={INPUT_CLASS}
							maxLength={32}
							value={settings.teamHomeName}
							onCommit={(value) => {
								if (!value.trim()) return false;
								commit({ teamHomeName: value });
							}}
						/>
					</Field>
					<Field label="Team Away Name" htmlFor="team-away-name">
						<DraftInput
							id="team-away-name"
							className={INPUT_CLASS}
							maxLength={32}
							value={settings.teamAwayName}
							onCommit={(value) => {
								if (!value.trim()) return false;
								commit({ teamAwayName: value });
							}}
						/>
					</Field>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="Home Colour">
						<ColorPicker
							value={settings.teamHomeColor}
							onChange={(color) => commit({ teamHomeColor: color })}
						/>
					</Field>
					<Field label="Away Colour">
						<ColorPicker
							value={settings.teamAwayColor}
							onChange={(color) => commit({ teamAwayColor: color })}
						/>
					</Field>
				</div>
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="settings-half">
				<SectionHeading id="settings-half">Half</SectionHeading>
				<Field label="Half Prefix" htmlFor="half-prefix">
					<DraftInput
						id="half-prefix"
						className={INPUT_CLASS}
						maxLength={24}
						value={settings.halfPrefix}
						onCommit={(value) => commit({ halfPrefix: value })}
					/>
				</Field>
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="settings-loadouts">
				<SectionHeading id="settings-loadouts">Timer Loadouts</SectionHeading>
				<p className="text-app-tertiary text-xs">
					Durations applied by the L1–L3 buttons. Accepts <code>MM:SS</code>, <code>M:SS</code> or bare
					seconds.
				</p>
				<div className="grid gap-4 sm:grid-cols-3">
					{([0, 1, 2] as const).map((index) => (
						<Field key={index} label={`Loadout ${index + 1}`} htmlFor={`loadout-${index + 1}`}>
							<LoadoutInput
								id={`loadout-${index + 1}`}
								value={settings.timerLoadouts[index]}
								onCommit={(seconds) => {
									const next = [...settings.timerLoadouts] as [number, number, number];
									next[index] = seconds;
									commit({ timerLoadouts: next });
								}}
							/>
						</Field>
					))}
				</div>
			</section>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Server tab                                                          */
/* ------------------------------------------------------------------ */

function ServerTab(): React.JSX.Element {
	const settings = useSettingsStore((store) => store.settings)!;
	const set = useSettingsStore((store) => store.set);
	const info = useServerStore((store) => store.info);
	const status = useServerStore((store) => store.status);

	const [portDraft, setPortDraft] = React.useState<string | null>(null);
	const [busy, setBusy] = React.useState(false);
	const [message, setMessage] = React.useState<string | null>(null);

	const boundPort = status?.port ?? 0;
	const running = status?.running ?? false;

	const applyPort = async (): Promise<void> => {
		const parsed = Number(portDraft ?? settings.serverPort);
		if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
			setMessage("Port must be a number between 1 and 65535.");
			return;
		}
		setBusy(true);
		setMessage(null);
		try {
			await set({ serverPort: parsed });
			setPortDraft(null);
			setMessage("Server restarting on the new port…");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<section className="flex flex-col gap-3" aria-labelledby="settings-server">
				<SectionHeading id="settings-server">HTTP Server</SectionHeading>
				<Field label="Preferred Port" htmlFor="server-port">
					<div className="flex items-center gap-2">
						<Input
							id="server-port"
							inputMode="numeric"
							className="w-28"
							value={portDraft ?? String(settings.serverPort)}
							onChange={(event) => setPortDraft(event.target.value.replace(/[^\d]/g, "").slice(0, 5))}
						/>
						<Button size="sm" disabled={busy || portDraft === null} onClick={() => void applyPort()}>
							Apply &amp; Restart Server
						</Button>
					</div>
				</Field>
				<p className="text-app-tertiary text-xs">
					{running
						? `Listening on :${boundPort}${
								boundPort !== settings.serverPort ? ` (preferred :${settings.serverPort} was occupied)` : ""
							}. LAN clients reconnect automatically when the server restarts.`
						: "Server is not running."}
				</p>
				{message ? (
					<p className="text-app-tertiary text-xs" role="status">
						{message}
					</p>
				) : null}
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="settings-access">
				<SectionHeading id="settings-access">Remote Access</SectionHeading>
				<label className="flex items-center gap-3 text-sm">
					<input
						type="checkbox"
						className="size-4"
						checked={settings.requireControlToken}
						onChange={(event) =>
							void set({ requireControlToken: event.target.checked }).catch(() => undefined)
						}
					/>
					Require control token
				</label>
				{settings.requireControlToken ? (
					<p className="text-success-400 text-xs">
						Phones must use the token-bearing link or QR code from Outputs &amp; Sharing.
					</p>
				) : (
					<p className="text-warning-400 text-xs">
						Warning: anyone on this network can change the score while the token is off.
					</p>
				)}
				<p className="text-app-quaternary text-xs">
					{info?.tokenRequired
						? "The control link and QR code are shown in Outputs & Sharing."
						: "Control is open; the QR code is hidden while the token is disabled."}
				</p>
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="settings-addresses">
				<SectionHeading id="settings-addresses">Bound Addresses</SectionHeading>
				{info && info.addresses.length > 0 ? (
					<ul className="text-app-tertiary flex flex-col gap-1 text-xs">
						{info.addresses.map((entry) => (
							<li key={entry.address}>
								<code>
									http://{entry.address}:{boundPort}/scoreboard
								</code>{" "}
								<span className="text-app-quaternary">({entry.name})</span>
							</li>
						))}
					</ul>
				) : (
					<p className="text-app-quaternary text-xs">No LAN interfaces found.</p>
				)}
			</section>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Buzzer tab                                                          */
/* ------------------------------------------------------------------ */

function BuzzerTab(): React.JSX.Element {
	const settings = useSettingsStore((store) => store.settings)!;
	const set = useSettingsStore((store) => store.set);
	const trackName = useBuzzerStore((store) => store.trackName);
	const selectTrack = useBuzzerStore((store) => store.selectTrack);
	const clearTrack = useBuzzerStore((store) => store.clearTrack);
	const play = useBuzzerStore((store) => store.play);

	const [busy, setBusy] = React.useState(false);
	const [message, setMessage] = React.useState<string | null>(null);

	const handleSelect = async (): Promise<void> => {
		setBusy(true);
		setMessage(null);
		try {
			await selectTrack();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};

	const handleClear = async (): Promise<void> => {
		setBusy(true);
		setMessage(null);
		try {
			await clearTrack();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<section className="flex flex-col gap-3" aria-labelledby="settings-buzzer-auto">
				<SectionHeading id="settings-buzzer-auto">Playback</SectionHeading>
				<label className="flex items-center gap-3 text-sm">
					<input
						type="checkbox"
						className="size-4"
						checked={settings.buzzerAutoPlay}
						onChange={(event) => void set({ buzzerAutoPlay: event.target.checked }).catch(() => undefined)}
					/>
					Auto Buzzer
				</label>
				<p className="text-app-tertiary text-xs">
					When on, the buzzer plays on this machine (and on phones with auto on) when the timer reaches 00:00.
				</p>
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="settings-buzzer-track">
				<SectionHeading id="settings-buzzer-track">Track</SectionHeading>
				<p className="text-sm">
					Current track:{" "}
					<span className="text-app-secondary font-medium">{trackName ?? "Default (built-in buzzer)"}</span>
				</p>
				<div className="flex flex-wrap gap-2">
					<Button size="sm" disabled={busy} onClick={() => void handleSelect()}>
						Choose File…
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={busy || trackName === null}
						onClick={() => void handleClear()}
					>
						Use Default
					</Button>
					<Button size="sm" variant="secondary" disabled={busy} onClick={() => play()}>
						Test
					</Button>
				</div>
				<p className="text-app-quaternary text-xs">
					Supported formats: MP3, WAV, OGG, M4A, AAC, FLAC. The custom track is served to the phone remote at{" "}
					<code>/buzzer.mp3</code> as well.
				</p>
				{message ? (
					<p className="text-error-400 text-xs" role="alert">
						{message}
					</p>
				) : null}
			</section>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const INPUT_CLASS =
	"flex h-10 w-full rounded-md border border-app-secondary bg-app-tertiary px-3 py-2 text-sm text-app-primary shadow-sm transition-colors placeholder:text-app-quaternary focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500";

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }): React.JSX.Element {
	return (
		<h2 id={id} className="text-app-primary text-base font-semibold">
			{children}
		</h2>
	);
}

function Field({
	label,
	htmlFor,
	children,
}: {
	label: string;
	htmlFor?: string;
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<div className="flex flex-col gap-1.5">
			{htmlFor ? <Label htmlFor={htmlFor}>{label}</Label> : <Label>{label}</Label>}
			{children}
		</div>
	);
}

/**
 * `MM:SS` loadout input (doc 04 §7.4): filter allows digits and one colon;
 * on blur, `^([0-9]{1,3})(?::([0-5]?[0-9]))?$` — empty means zero, invalid
 * reverts to the stored value.
 */
function LoadoutInput({
	id,
	value,
	onCommit,
}: {
	id: string;
	value: number;
	onCommit(seconds: number): void;
}): React.JSX.Element {
	return (
		<DraftInput
			id={id}
			className={INPUT_CLASS}
			inputMode="numeric"
			value={formatTimer(value)}
			onInput={filterDurationInput}
			onCommit={(raw) => {
				const seconds = parseLoadout(raw);
				if (seconds === null) return false;
				if (seconds !== value) onCommit(seconds);
			}}
		/>
	);
}

function parseLoadout(value: string): number | null {
	if (value === "") return 0;
	if (/^\d{1,3}$/.test(value)) return Number(value);
	const match = /^(\d{1,3}):([0-5]?\d)$/.exec(value);
	return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function filterDurationInput(event: React.FormEvent<HTMLInputElement>): void {
	const input = event.currentTarget;
	const filtered = input.value.replace(/[^\d:]/g, "");
	const [minutes = "", ...secondsParts] = filtered.split(":");
	input.value = `${minutes.slice(0, 3)}${secondsParts.length > 0 ? `:${secondsParts.join("").slice(0, 2)}` : ""}`;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<SettingsWindow />
	</React.StrictMode>,
);
