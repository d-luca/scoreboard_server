import { Button } from "@/components/ui/Button/Button";
import type { Settings } from "@/bindings/Settings";
import { useHotkeys } from "@/lib/hooks/useHotkeys";
import {
	DEFAULT_HOTKEYS,
	hotkeyFromEvent,
	hotkeyLabel,
	isReservedHotkey,
	sameHotkey,
	type HotkeyAction,
	type HotkeyBinding,
} from "@/lib/hotkeys";
import { useSettingsStore } from "@/lib/stores/settingsStore";
import React from "react";
import { SectionHeading } from "../SectionHeading";

const GROUPS: ReadonlyArray<{
	id: string;
	title: string;
	actions: ReadonlyArray<readonly [HotkeyAction, string]>;
}> = [
	{
		id: "score",
		title: "Score",
		actions: [
			["increaseHomeScore", "Home +1"],
			["decreaseHomeScore", "Home −1"],
			["increaseAwayScore", "Away +1"],
			["decreaseAwayScore", "Away −1"],
		],
	},
	{
		id: "half",
		title: "Half",
		actions: [
			["increaseHalf", "Half +1"],
			["decreaseHalf", "Half −1"],
		],
	},
	{
		id: "timer",
		title: "Timer",
		actions: [
			["startTimer", "Start"],
			["pauseTimer", "Pause"],
			["stopTimer", "Reset timer"],
			["increaseTimerSecond", "+1 second"],
			["decreaseTimerSecond", "−1 second"],
			["increaseTimerMinute", "+1 minute"],
			["decreaseTimerMinute", "−1 minute"],
			["timerLoadout1", "Apply loadout 1"],
			["timerLoadout2", "Apply loadout 2"],
			["timerLoadout3", "Apply loadout 3"],
		],
	},
	{
		id: "match",
		title: "Match",
		actions: [["resetScoreboard", "Reset scoreboard"]],
	},
];

const LABELS = Object.fromEntries(GROUPS.flatMap((group) => group.actions)) as Record<HotkeyAction, string>;
const ACTIONS = Object.keys(DEFAULT_HOTKEYS) as HotkeyAction[];

type Feedback = { action: HotkeyAction | null; text: string };

export function KeyBindingsTab(): React.JSX.Element {
	const overrides = useSettingsStore((store) => store.settings!.hotkeys);
	const set = useSettingsStore((store) => store.set);
	const hotkeys = useHotkeys();

	const [recording, setRecording] = React.useState<HotkeyAction | null>(null);
	const [feedback, setFeedback] = React.useState<Feedback | null>(null);

	const commit = (action: HotkeyAction | null, next: Settings["hotkeys"]): void => {
		setFeedback(null);
		void set({ hotkeys: next }).catch((error: unknown) =>
			setFeedback({ action, text: error instanceof Error ? error.message : String(error) }),
		);
	};

	const assign = (action: HotkeyAction, binding: HotkeyBinding): void => {
		const label = hotkeyLabel(binding);
		if (isReservedHotkey(binding)) {
			setFeedback({ action, text: `${label} is reserved by the app menu.` });
			return;
		}
		const conflict = ACTIONS.find((other) => other !== action && sameHotkey(hotkeys[other], binding));
		if (conflict) {
			setFeedback({ action, text: `${label} is already used by “${LABELS[conflict]}”.` });
			return;
		}
		// Only overrides are stored, so a binding equal to its default drops out.
		const next = Object.fromEntries(Object.entries(overrides).filter(([id]) => id !== action));
		if (!sameHotkey(binding, DEFAULT_HOTKEYS[action])) next[action] = binding;
		commit(action, next);
	};

	const capture = (action: HotkeyAction, event: React.KeyboardEvent): void => {
		// Tab keeps moving focus; the resulting blur ends the capture.
		if (recording !== action || event.key === "Tab") return;
		// Also stops Space/Enter from re-activating the button.
		event.preventDefault();
		// Keeps Esc from reaching useEscapeToClose on window.
		event.stopPropagation();
		if (event.key === "Escape") {
			setRecording(null);
			return;
		}
		const binding = hotkeyFromEvent(event.nativeEvent);
		if (!binding) return;
		setRecording(null);
		assign(action, binding);
	};

	const customized = ACTIONS.some((action) => !sameHotkey(hotkeys[action], DEFAULT_HOTKEYS[action]));

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<section className="flex flex-col gap-3" aria-labelledby="settings-keybindings">
				<SectionHeading id="settings-keybindings">Key Bindings</SectionHeading>
				<p className="text-app-tertiary text-xs">
					Shortcuts work while the main window is focused and are ignored while typing in a field. Click a
					shortcut, then press the new key combination. Esc cancels.
				</p>
				<div className="flex items-center gap-3">
					<Button size="sm" variant="outline" disabled={!customized} onClick={() => commit(null, {})}>
						Restore All Defaults
					</Button>
					{feedback && feedback.action === null ? (
						<p className="text-error-400 text-xs" role="alert">
							{feedback.text}
						</p>
					) : null}
				</div>
			</section>

			{GROUPS.map((group) => (
				<section
					key={group.id}
					className="flex flex-col gap-1"
					aria-labelledby={`settings-keybindings-${group.id}`}
				>
					<SectionHeading id={`settings-keybindings-${group.id}`}>{group.title}</SectionHeading>
					<ul className="flex flex-col">
						{group.actions.map(([action, label]) => {
							const binding = hotkeys[action];
							const isRecording = recording === action;
							const isDefault = sameHotkey(binding, DEFAULT_HOTKEYS[action]);
							return (
								<li
									key={action}
									className="border-app-primary flex flex-col gap-1 border-b py-2 last:border-b-0"
								>
									<div className="flex items-center justify-between gap-3">
										<span className="text-sm">{label}</span>
										<div className="flex items-center gap-2">
											<button
												type="button"
												aria-label={`Change ${label} shortcut, currently ${hotkeyLabel(binding)}`}
												aria-pressed={isRecording}
												onClick={() => {
													setFeedback(null);
													setRecording(isRecording ? null : action);
												}}
												onBlur={() => setRecording((current) => (current === action ? null : current))}
												onKeyDown={(event) => capture(action, event)}
												className={`h-8 min-w-36 rounded-md border px-3 text-xs transition-colors focus-visible:outline-none ${
													isRecording
														? "border-primary-500 ring-primary-500 text-primary-400 ring-1"
														: "border-app-secondary bg-app-tertiary text-app-primary hover:border-primary-500 focus-visible:ring-primary-500 focus-visible:ring-1"
												}`}
											>
												{isRecording ? (
													"Press keys…"
												) : (
													<kbd className="font-mono">{hotkeyLabel(binding)}</kbd>
												)}
											</button>
											<Button
												size="sm"
												variant="ghost"
												disabled={isDefault}
												title={`Default: ${hotkeyLabel(DEFAULT_HOTKEYS[action])}`}
												onClick={() => assign(action, DEFAULT_HOTKEYS[action])}
											>
												Reset
											</Button>
										</div>
									</div>
									{feedback && feedback.action === action ? (
										<p className="text-error-400 text-right text-xs" role="alert">
											{feedback.text}
										</p>
									) : null}
								</li>
							);
						})}
					</ul>
				</section>
			))}
		</div>
	);
}
