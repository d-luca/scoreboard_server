import React from "react";
import type { ScoreboardPatch } from "../../bindings/ScoreboardPatch";

import { formatTimer } from "../../lib/format";
import { createScoreboardStore } from "../../lib/scoreboard-store";
import type { WsTransport } from "../../lib/ws-transport";
import { DraftInput } from "./DraftInput";
import "./remote.css";

const PRESET_COLORS = ["#ffffff", "#000000", "#ffcc00", "#0066cc", "#00cc00"] as const;
const PANEL_CLASS = "rounded-xl border border-slate-700 bg-slate-800 p-4 shadow-lg";
const INPUT_CLASS =
	"w-full border border-slate-600 bg-slate-700 px-3 text-base text-slate-50 placeholder:text-slate-400";

type ScoreboardHook = ReturnType<typeof createScoreboardStore>;
type ButtonTone = "primary" | "secondary" | "danger" | "amber";

interface RemoteControlProps {
	store: ScoreboardHook;
	transport: WsTransport;
}

export function RemoteControl({ store, transport }: RemoteControlProps): React.JSX.Element {
	const connect = store((current) => current.connect);
	const connection = store((current) => current.connection);
	const authorization = store((current) => current.authorization);
	const error = store((current) => current.error);
	const disabled = connection !== "connected" || authorization !== "authorized";

	React.useEffect(() => {
		void connect();
	}, [connect]);

	console.log({ connect, connection, authorization, error, disabled });

	return (
		<div className="remote-page bg-slate-900 text-slate-50">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
				<header className="flex items-center justify-between gap-3 max-[520px]:flex-col max-[520px]:items-start">
					<div>
						<p className="text-sm font-semibold tracking-widest text-amber-400 uppercase">
							Live match control
						</p>
						<h1 className="text-2xl font-bold">Scoreboard Remote</h1>
					</div>
					<div
						className="flex min-h-12 items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 text-sm font-semibold"
						role="status"
						aria-live="polite"
					>
						<span
							className={`size-3 rounded-full ${connection === "connected" ? "bg-emerald-400" : "bg-red-500"}`}
							aria-hidden="true"
						/>
						{connection === "connected"
							? "Connected"
							: connection === "connecting"
								? "Connecting…"
								: "Disconnected"}
					</div>
				</header>

				{authorization === "unauthorized" ? (
					<div
						className="rounded-lg border border-amber-500 bg-amber-950 px-4 py-3 text-sm text-amber-100"
						role="alert"
					>
						<strong>Read-only:</strong> this control link is not authorized. Scan or open the latest control
						link from Outputs &amp; Sharing.
					</div>
				) : null}

				{error && authorization !== "unauthorized" ? (
					<div
						className="rounded-lg border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100"
						role="alert"
					>
						{error}
					</div>
				) : null}

				<main className="grid grid-cols-12 gap-4">
					<TeamsSection store={store} disabled={disabled} />
					<TimerSection store={store} disabled={disabled} />
					<HalfSection store={store} disabled={disabled} />
					<SettingsSection store={store} disabled={disabled} />
					<BuzzerSection store={store} transport={transport} disabled={disabled} />
				</main>
			</div>
		</div>
	);
}

function TeamsSection({ store, disabled }: SectionProps): React.JSX.Element {
	return (
		<section className={`${PANEL_CLASS} col-span-12 min-[720px]:col-span-7`} aria-labelledby="teams-heading">
			<SectionHeading id="teams-heading">Teams</SectionHeading>
			<div className="grid gap-4 min-[521px]:grid-cols-2">
				<TeamEditor store={store} side="home" disabled={disabled} />
				<TeamEditor store={store} side="away" disabled={disabled} />
			</div>
		</section>
	);
}

function TeamEditor({ store, side, disabled }: SectionProps & { side: "home" | "away" }): React.JSX.Element {
	const isHome = side === "home";
	const nameKey = isHome ? "teamHomeName" : "teamAwayName";
	const colorKey = isHome ? "teamHomeColor" : "teamAwayColor";
	const name = store((current) => current.state[nameKey]);
	const color = store((current) => current.state[colorKey]);
	const score = store((current) => current.state[isHome ? "teamHomeScore" : "teamAwayScore"]);
	const patch = store((current) => current.patch);
	const increase = store((current) => (isHome ? current.incHome : current.incAway));
	const decrease = store((current) => (isHome ? current.decHome : current.decAway));

	const update = (next: ScoreboardPatch): void => {
		void patch(next).catch(() => undefined);
	};

	return (
		<div className="rounded-lg bg-slate-900/60 p-3">
			<label
				className="mb-1 block text-xs font-semibold tracking-wide text-slate-300 uppercase"
				htmlFor={`${side}-name`}
			>
				{isHome ? "Home" : "Away"} name
			</label>
			<DraftInput
				id={`${side}-name`}
				className={INPUT_CLASS}
				value={name}
				disabled={disabled}
				maxLength={32}
				autoComplete="off"
				onCommit={(next) => {
					if (next && next !== name) update({ [nameKey]: next });
					return next.length > 0;
				}}
			/>

			<div className="mt-3 flex items-center gap-2">
				<input
					type="color"
					value={color}
					disabled={disabled}
					onChange={(event) => update({ [colorKey]: event.currentTarget.value })}
					aria-label={`${isHome ? "Home" : "Away"} custom color`}
					className="w-14 cursor-pointer border border-slate-600 bg-slate-700 p-1"
				/>
				<code className="text-xs text-slate-300">{color}</code>
			</div>

			<div className="mt-2 grid grid-cols-5 gap-2" aria-label={`${isHome ? "Home" : "Away"} color presets`}>
				{PRESET_COLORS.map((preset) => (
					<button
						key={preset}
						type="button"
						disabled={disabled}
						onClick={() => update({ [colorKey]: preset })}
						className={`border-2 ${color.toLowerCase() === preset ? "border-amber-400" : "border-slate-600"}`}
						style={{ backgroundColor: preset }}
						aria-label={`Set ${isHome ? "home" : "away"} color to ${preset}`}
						aria-pressed={color.toLowerCase() === preset}
					/>
				))}
			</div>

			<div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
				<RemoteButton
					tone="danger"
					disabled={disabled}
					onClick={() => run(decrease())}
					aria-label={`Decrease ${side} score`}
				>
					−
				</RemoteButton>
				<output
					className="min-w-16 text-center text-4xl font-black tabular-nums"
					aria-label={`${side} score`}
				>
					{score}
				</output>
				<RemoteButton
					disabled={disabled}
					onClick={() => run(increase())}
					aria-label={`Increase ${side} score`}
				>
					+
				</RemoteButton>
			</div>
		</div>
	);
}

function TimerSection({ store, disabled }: SectionProps): React.JSX.Element {
	const timer = store((current) => current.state.timer);
	const running = store((current) => current.state.isTimerRunning);
	const timerLoadout1 = store((current) => current.state.timerLoadout1);
	const timerLoadout2 = store((current) => current.state.timerLoadout2);
	const timerLoadout3 = store((current) => current.state.timerLoadout3);
	const loadouts = [timerLoadout1, timerLoadout2, timerLoadout3];
	const start = store((current) => current.startTimer);
	const pause = store((current) => current.pauseTimer);
	const stop = store((current) => current.stopTimer);
	const adjust = store((current) => current.adjustTimer);
	const setTimer = store((current) => current.setTimer);
	const applyLoadout = store((current) => current.applyLoadout);

	return (
		<section className={`${PANEL_CLASS} col-span-12 min-[720px]:col-span-5`} aria-labelledby="timer-heading">
			<SectionHeading id="timer-heading">Timer</SectionHeading>
			<div className="remote-timer mb-4 text-center text-5xl font-bold tracking-tight text-amber-400 tabular-nums">
				{formatTimer(timer)}
			</div>
			<div className="grid grid-cols-2 gap-2 min-[521px]:grid-cols-3">
				<RemoteButton disabled={disabled} onClick={() => run(adjust(60))}>
					+1m
				</RemoteButton>
				<RemoteButton disabled={disabled} onClick={() => run(adjust(1))}>
					+1s
				</RemoteButton>
				<RemoteButton
					disabled={disabled || (!running && timer === 0)}
					onClick={() => run(running ? pause() : start())}
					className="col-span-2 min-[521px]:col-span-1"
				>
					{running ? "Pause" : "Start"}
				</RemoteButton>
				<RemoteButton tone="danger" disabled={disabled} onClick={() => run(adjust(-1))}>
					−1s
				</RemoteButton>
				<RemoteButton tone="danger" disabled={disabled} onClick={() => run(adjust(-60))}>
					−1m
				</RemoteButton>
				<RemoteButton
					tone="danger"
					disabled={disabled || (!running && timer === 0)}
					onClick={() => run(stop())}
				>
					Reset
				</RemoteButton>
			</div>

			<label
				className="mt-4 mb-1 block text-xs font-semibold tracking-wide text-slate-300 uppercase"
				htmlFor="manual-timer"
			>
				Set timer (MM:SS or seconds)
			</label>
			<div className="grid grid-cols-[1fr_auto] gap-2">
				<DraftInput
					id="manual-timer"
					className={`${INPUT_CLASS} remote-timer`}
					value={formatTimer(timer)}
					disabled={disabled}
					inputMode="numeric"
					placeholder="15:00"
					onCommit={(value) => {
						const seconds = parseManualTimer(value);
						if (seconds === null) return false;
						if (seconds !== timer) run(setTimer(seconds));
					}}
				/>
				<RemoteButton
					tone="amber"
					disabled={disabled}
					onClick={() => document.getElementById("manual-timer")?.blur()}
				>
					Set
				</RemoteButton>
			</div>

			<div className="mt-3 grid grid-cols-1 gap-2 min-[521px]:grid-cols-3" aria-label="Timer loadouts">
				{loadouts.map((seconds, index) => {
					const slot = (index + 1) as 1 | 2 | 3;
					return (
						<RemoteButton
							key={slot}
							tone="secondary"
							disabled={disabled}
							onClick={() => run(applyLoadout(slot))}
						>
							L{slot} {formatTimer(seconds)}
						</RemoteButton>
					);
				})}
			</div>
		</section>
	);
}

function HalfSection({ store, disabled }: SectionProps): React.JSX.Element {
	const half = store((current) => current.state.half);
	const prefix = store((current) => current.state.halfPrefix);
	const increase = store((current) => current.incHalf);
	const decrease = store((current) => current.decHalf);

	return (
		<section className={`${PANEL_CLASS} col-span-12 min-[720px]:col-span-5`} aria-labelledby="half-heading">
			<SectionHeading id="half-heading">Half</SectionHeading>
			<div className="grid grid-cols-[1fr_minmax(0,2fr)_1fr] items-center gap-2">
				<RemoteButton
					tone="danger"
					disabled={disabled}
					onClick={() => run(decrease())}
					aria-label="Decrease half"
				>
					−
				</RemoteButton>
				<output
					className="text-center text-xl font-bold wrap-break-word text-amber-400"
					aria-label="Current half"
				>
					{prefix} {half}
				</output>
				<RemoteButton disabled={disabled} onClick={() => run(increase())} aria-label="Increase half">
					+
				</RemoteButton>
			</div>
		</section>
	);
}

function SettingsSection({ store, disabled }: SectionProps): React.JSX.Element {
	const state = store((current) => current.state);
	const patch = store((current) => current.patch);
	const reset = store((current) => current.reset);

	const commitPatch = (next: ScoreboardPatch): void => {
		void patch(next).catch(() => undefined);
	};

	const loadouts: Array<{ key: "timerLoadout1" | "timerLoadout2" | "timerLoadout3"; value: number }> = [
		{ key: "timerLoadout1", value: state.timerLoadout1 },
		{ key: "timerLoadout2", value: state.timerLoadout2 },
		{ key: "timerLoadout3", value: state.timerLoadout3 },
	];

	return (
		<section
			className={`${PANEL_CLASS} col-span-12 min-[720px]:col-span-7`}
			aria-labelledby="settings-heading"
		>
			<SectionHeading id="settings-heading">Settings</SectionHeading>
			<label
				className="mb-1 block text-xs font-semibold tracking-wide text-slate-300 uppercase"
				htmlFor="half-prefix"
			>
				Half prefix
			</label>
			<DraftInput
				id="half-prefix"
				className={INPUT_CLASS}
				value={state.halfPrefix}
				disabled={disabled}
				maxLength={24}
				onCommit={(value) => {
					if (value && value !== state.halfPrefix) commitPatch({ halfPrefix: value });
					return value.length > 0;
				}}
			/>

			<div className="mt-4 grid gap-3 min-[521px]:grid-cols-3">
				{loadouts.map(({ key, value }, index) => (
					<label key={key} className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
						Loadout {index + 1}
						<DraftInput
							className={`${INPUT_CLASS} remote-timer mt-1`}
							value={formatTimer(value)}
							disabled={disabled}
							inputMode="numeric"
							placeholder="15:00"
							onInput={filterDurationInput}
							onCommit={(draft) => {
								const seconds = parseLoadout(draft);
								if (seconds === null) return false;
								if (seconds !== value) commitPatch({ [key]: seconds });
							}}
						/>
					</label>
				))}
			</div>

			<RemoteButton
				tone="danger"
				disabled={disabled}
				className="mt-4 w-full"
				onClick={() => {
					if (
						window.confirm("Reset scores, timer, and half? Team names, colors, and loadouts will be kept.")
					) {
						run(reset());
					}
				}}
			>
				Reset All
			</RemoteButton>
		</section>
	);
}

function BuzzerSection({
	store,
	transport,
	disabled,
}: SectionProps & { transport: WsTransport }): React.JSX.Element {
	const playBuzzer = store((current) => current.playBuzzer);
	const [autoPlay, setAutoPlay] = React.useState(true);
	const audioRef = React.useRef<HTMLAudioElement>(null);
	const autoPlayRef = React.useRef(autoPlay);
	const armedRef = React.useRef(false);

	React.useEffect(() => {
		autoPlayRef.current = autoPlay;
	}, [autoPlay]);

	const playSound = React.useCallback((): void => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.muted = false;
		audio.currentTime = 0;
		void audio.play().catch(() => undefined);
	}, []);

	React.useEffect(() => {
		const stopTimerFinished = transport.onEvent("timer-finished", () => {
			if (autoPlayRef.current) playSound();
		});
		const stopBuzzer = transport.onEvent("buzzer", playSound);
		return () => {
			stopTimerFinished();
			stopBuzzer();
		};
	}, [playSound, transport]);

	React.useEffect(() => {
		const armAudio = (): void => {
			const audio = audioRef.current;
			if (!audio || armedRef.current) return;
			armedRef.current = true;
			audio.muted = true;
			audio.currentTime = 0;
			void audio
				.play()
				.then(() => {
					audio.pause();
					audio.currentTime = 0;
					audio.muted = false;
				})
				.catch(() => {
					armedRef.current = false;
					audio.muted = false;
				});
		};
		window.addEventListener("pointerdown", armAudio, { capture: true, once: true });
		return () => window.removeEventListener("pointerdown", armAudio, { capture: true });
	}, []);

	return (
		<section
			className={`${PANEL_CLASS} col-span-12 flex flex-wrap items-center gap-3`}
			aria-labelledby="buzzer-heading"
		>
			<audio ref={audioRef} src="/buzzer.mp3" preload="auto" />
			<div className="mr-auto">
				<SectionHeading id="buzzer-heading">Buzzer</SectionHeading>
				<p className="text-xs text-slate-400">Auto plays locally when the timer reaches zero.</p>
			</div>
			<RemoteButton tone="amber" disabled={disabled} onClick={() => run(playBuzzer())}>
				🔔 Buzzer
			</RemoteButton>
			<RemoteButton
				tone={autoPlay ? "primary" : "secondary"}
				aria-pressed={autoPlay}
				onClick={() => setAutoPlay((enabled) => !enabled)}
			>
				Auto: {autoPlay ? "ON" : "OFF"}
			</RemoteButton>
		</section>
	);
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }): React.JSX.Element {
	return (
		<h2 id={id} className="mb-3 text-lg font-bold text-slate-100">
			{children}
		</h2>
	);
}

interface RemoteButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	tone?: ButtonTone;
}

function RemoteButton({
	tone = "primary",
	className = "",
	type = "button",
	...props
}: RemoteButtonProps): React.JSX.Element {
	const tones: Record<ButtonTone, string> = {
		primary: "border border-blue-500 bg-blue-600 text-white hover:bg-blue-500",
		secondary: "border border-slate-500 bg-slate-700 text-slate-50 hover:bg-slate-600",
		danger: "border border-red-500 bg-red-600 text-white hover:bg-red-500",
		amber: "border border-amber-400 bg-amber-500 text-slate-950 hover:bg-amber-400",
	};
	return (
		<button type={type} className={`${tones[tone]} px-4 py-2 text-base font-bold ${className}`} {...props} />
	);
}

interface SectionProps {
	store: ScoreboardHook;
	disabled: boolean;
}

function run(command: Promise<void>): void {
	void command.catch(() => undefined);
}

function parseManualTimer(value: string): number | null {
	if (/^\d+$/.test(value)) {
		const seconds = Number(value);
		return Number.isSafeInteger(seconds) ? seconds : null;
	}
	const match = /^(\d{1,3}):([0-5]?\d)$/.exec(value);
	return match ? Number(match[1]) * 60 + Number(match[2]) : null;
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
