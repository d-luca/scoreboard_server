import { FormEvent, JSX, useEffect, useState } from "react";
import type { Action } from "./bindings/Action";
import { Button } from "./components/ui/Button/Button";
import { Input } from "./components/ui/Input/Input";
import { useScoreboardStore } from "./lib/scoreboard-store";

function App(): JSX.Element {
	const state = useScoreboardStore((store) => store.state);
	const connection = useScoreboardStore((store) => store.connection);
	const error = useScoreboardStore((store) => store.error);
	const connect = useScoreboardStore((store) => store.connect);
	const dispatch = useScoreboardStore((store) => store.dispatch);
	const [timerSeconds, setTimerSeconds] = useState("10");
	const [homeName, setHomeName] = useState("HOME");
	const [awayName, setAwayName] = useState("AWAY");

	useEffect(() => {
		void connect();
	}, [connect]);

	const run = (action: Action): void => {
		void dispatch(action).catch(() => undefined);
	};

	const patchNames = (event: FormEvent): void => {
		event.preventDefault();
		run({ action: "patch", data: { teamHomeName: homeName, teamAwayName: awayName } });
	};

	const setTimer = (event: FormEvent): void => {
		event.preventDefault();
		const seconds = Number.parseInt(timerSeconds, 10);
		if (Number.isFinite(seconds) && seconds >= 0) {
			run({ action: "timer-set", data: { seconds } });
		}
	};

	return (
		<main className="min-h-screen bg-zinc-950 p-5 font-[Poppins] text-zinc-100">
			<header className="mb-5 flex items-end justify-between border-b border-zinc-700 pb-3">
				<div>
					<h1 className="font-[Anton] text-3xl">PHASE 1 DOMAIN CONSOLE</h1>
					<p className="text-sm text-zinc-400">Authoritative Rust state and monotonic timer</p>
				</div>
				<span className={connection === "connected" ? "text-emerald-400" : "text-amber-400"}>
					{connection}
				</span>
			</header>

			{error && <p className="mb-4 border border-red-700 bg-red-950 p-2 text-sm text-red-200">{error}</p>}

			<section className="mb-5 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
				<StateValue label={state.teamHomeName} value={state.teamHomeScore} />
				<StateValue label={state.teamAwayName} value={state.teamAwayScore} />
				<StateValue label={state.halfPrefix} value={state.half} />
				<StateValue label="TIMER" value={formatTimer(state.timer)} active={state.isTimerRunning} />
			</section>

			<div className="grid gap-4 lg:grid-cols-2">
				<ControlGroup title="Score and half">
					<ActionButton label="Home +1" action="score-home-inc" run={run} />
					<ActionButton label="Home -1" action="score-home-dec" run={run} />
					<ActionButton label="Away +1" action="score-away-inc" run={run} />
					<ActionButton label="Away -1" action="score-away-dec" run={run} />
					<ActionButton label="Half +1" action="half-inc" run={run} />
					<ActionButton label="Half -1" action="half-dec" run={run} />
				</ControlGroup>

				<ControlGroup title="Timer transport">
					<ActionButton label="Start" action="timer-start" run={run} />
					<ActionButton label="Pause" action="timer-pause" run={run} />
					<ActionButton label="Stop" action="timer-stop" run={run} />
					<Button
						type="button"
						variant="secondary"
						onClick={() => run({ action: "timer-adjust", data: { delta: -60 } })}
					>
						-60 s
					</Button>
					<Button
						type="button"
						variant="secondary"
						onClick={() => run({ action: "timer-adjust", data: { delta: -1 } })}
					>
						-1 s
					</Button>
					<Button
						type="button"
						variant="secondary"
						onClick={() => run({ action: "timer-adjust", data: { delta: 1 } })}
					>
						+1 s
					</Button>
					<Button
						type="button"
						variant="secondary"
						onClick={() => run({ action: "timer-adjust", data: { delta: 60 } })}
					>
						+60 s
					</Button>
				</ControlGroup>

				<ControlGroup title="Timer values">
					<form className="col-span-full flex gap-2" onSubmit={setTimer}>
						<Input
							min="0"
							step="1"
							type="number"
							value={timerSeconds}
							onChange={(event) => setTimerSeconds(event.target.value)}
						/>
						<Button type="submit">Set seconds</Button>
					</form>
					<Button
						type="button"
						variant="outline"
						onClick={() => run({ action: "timer-loadout", data: { slot: 1 } })}
					>
						Loadout 1 · {formatTimer(state.timerLoadout1)}
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => run({ action: "timer-loadout", data: { slot: 2 } })}
					>
						Loadout 2 · {formatTimer(state.timerLoadout2)}
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => run({ action: "timer-loadout", data: { slot: 3 } })}
					>
						Loadout 3 · {formatTimer(state.timerLoadout3)}
					</Button>
				</ControlGroup>

				<ControlGroup title="Patch and events">
					<form className="col-span-full grid grid-cols-[1fr_1fr_auto] gap-2" onSubmit={patchNames}>
						<Input
							aria-label="Home name"
							value={homeName}
							onChange={(event) => setHomeName(event.target.value)}
						/>
						<Input
							aria-label="Away name"
							value={awayName}
							onChange={(event) => setAwayName(event.target.value)}
						/>
						<Button type="submit">Patch</Button>
					</form>
					<ActionButton label="Buzzer event" action="buzzer-play" run={run} />
					<Button type="button" variant="destructive" onClick={() => run({ action: "reset" })}>
						Reset match
					</Button>
				</ControlGroup>
			</div>
		</main>
	);
}

function StateValue({
	label,
	value,
	active = false,
}: {
	label: string;
	value: string | number;
	active?: boolean;
}): JSX.Element {
	return (
		<div className="border border-zinc-700 bg-zinc-900 p-3">
			<div className="truncate text-xs text-zinc-400">{label}</div>
			<div className={active ? "font-[Anton] text-3xl text-emerald-400" : "font-[Anton] text-3xl"}>
				{value}
			</div>
		</div>
	);
}

function ControlGroup({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
	return (
		<fieldset className="grid grid-cols-2 gap-2 border border-zinc-700 p-3">
			<legend className="px-2 text-sm text-zinc-400">{title}</legend>
			{children}
		</fieldset>
	);
}

function ActionButton({
	label,
	action,
	run,
}: {
	label: string;
	action: Action["action"];
	run: (action: Action) => void;
}): JSX.Element {
	return (
		<Button type="button" variant="secondary" onClick={() => run({ action } as Action)}>
			{label}
		</Button>
	);
}

function formatTimer(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	return `${minutes.toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export default App;
