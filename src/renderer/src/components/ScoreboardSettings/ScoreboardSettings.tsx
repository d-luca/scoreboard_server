import { ChangeEvent, JSX, useEffect, useState } from "react";
import { Card } from "../ui/Card/Card";
import { CardTitle } from "../ui/Card/CardTitle";
import { CardContent } from "../ui/Card/CardContent";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { ColorPicker } from "../ui/ColorPicker";
import { Button } from "../ui/Button/Button";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";
import { useOverlayStore } from "@renderer/stores/overlayStore";
import { useHotkeyStore } from "@renderer/stores/hotkeyStore";
import { formatSecondsToClock, parseMinutesSeconds, sanitizeTimerInput } from "./utils";

type TimerLoadoutIndex = 1 | 2 | 3;
type TimerLoadoutState = Record<TimerLoadoutIndex, string>;

export function ScoreboardSettings(): JSX.Element {
	const store = useScoreboardStore();
	const { enabled: overlayEnabled, toggleOverlay, setOverlay } = useOverlayStore();
	const { enabled: hotkeyEnabled } = useHotkeyStore();

	const [activeLoadout, setActiveLoadout] = useState<TimerLoadoutIndex | null>(null);
	const [timerLoadoutInputs, setTimerLoadoutInputs] = useState<TimerLoadoutState>(() => ({
		1: formatSecondsToClock(store.timerLoadout1),
		2: formatSecondsToClock(store.timerLoadout2),
		3: formatSecondsToClock(store.timerLoadout3),
	}));

	useEffect(() => {
		// Listen for overlay windows being closed
		const unsubscribeClosed = window.api.onOverlayWindowsClosed(() => {
			setOverlay(false);
		});

		// Listen for overlay windows being opened (from menu)
		const unsubscribeOpened = window.api.onOverlayWindowsOpened(() => {
			setOverlay(true);
		});

		// Listen for reset overlay state on app startup
		const unsubscribeReset = window.api.onResetOverlayState(() => {
			setOverlay(false);
		});

		return () => {
			unsubscribeClosed();
			unsubscribeOpened();
			unsubscribeReset();
		};
	}, [setOverlay]);

	useEffect(() => {
		const formatted: TimerLoadoutState = {
			1: formatSecondsToClock(store.timerLoadout1),
			2: formatSecondsToClock(store.timerLoadout2),
			3: formatSecondsToClock(store.timerLoadout3),
		};

		setTimerLoadoutInputs((previous) => {
			let needsUpdate = false;
			const next: TimerLoadoutState = { ...previous };
			([1, 2, 3] as const).forEach((index) => {
				if (activeLoadout === index) {
					return;
				}
				if (previous[index] !== formatted[index]) {
					next[index] = formatted[index];
					needsUpdate = true;
				}
			});
			return needsUpdate ? next : previous;
		});
	}, [store.timerLoadout1, store.timerLoadout2, store.timerLoadout3, activeLoadout]);

	const handleTeamHomeNameChange = (e: ChangeEvent<HTMLInputElement>): void => {
		store.setTeamHomeName(e.target.value);
	};

	const handleTeamAwayNameChange = (e: ChangeEvent<HTMLInputElement>): void => {
		store.setTeamAwayName(e.target.value);
	};

	const handleHalfPrefixChange = (e: ChangeEvent<HTMLInputElement>): void => {
		store.setHalfPrefix(e.target.value);
	};

	const handleOverlayToggle = (): void => {
		if (overlayEnabled) {
			window.api.disableOverlayMode();
		} else {
			window.api.enableOverlayMode(hotkeyEnabled);
		}
		toggleOverlay();
	};

	const getTimerLoadoutValue = (index: TimerLoadoutIndex): number | undefined => {
		switch (index) {
			case 1:
				return store.timerLoadout1;
			case 2:
				return store.timerLoadout2;
			case 3:
				return store.timerLoadout3;
			default:
				return undefined;
		}
	};

	const handleLoadoutChange =
		(index: TimerLoadoutIndex) =>
		(event: ChangeEvent<HTMLInputElement>): void => {
			setActiveLoadout(index);
			const sanitizedValue = sanitizeTimerInput(event.target.value);
			setTimerLoadoutInputs((previous) => ({ ...previous, [index]: sanitizedValue }));
		};

	const handleLoadoutFocus = (index: TimerLoadoutIndex) => (): void => {
		setActiveLoadout(index);
	};

	const handleLoadoutBlur = (index: TimerLoadoutIndex) => (): void => {
		const rawValue = timerLoadoutInputs[index];
		const parsed = parseMinutesSeconds(rawValue);
		setActiveLoadout((previous) => (previous === index ? null : previous));

		if (parsed === null) {
			const fallback = formatSecondsToClock(getTimerLoadoutValue(index));
			setTimerLoadoutInputs((previous) => ({ ...previous, [index]: fallback }));
			return;
		}

		void store.setTimerLoadout({ index, value: parsed });
		setTimerLoadoutInputs((previous) => ({ ...previous, [index]: formatSecondsToClock(parsed) }));
	};

	const timerLoadoutConfig: Array<{
		index: TimerLoadoutIndex;
		label: string;
		placeholder: string;
	}> = [
		{ index: 1, label: "Loadout 1 (MM:SS)", placeholder: "45:00" },
		{ index: 2, label: "Loadout 2 (MM:SS)", placeholder: "90:00" },
		{ index: 3, label: "Loadout 3 (MM:SS)", placeholder: "30:00" },
	];

	return (
		<Card className="border-app-primary flex h-1/2 w-full flex-col gap-4 overflow-hidden border">
			<CardTitle>Scoreboard Settings</CardTitle>
			<CardContent className="flex size-full flex-col justify-between gap-4 overflow-auto">
				{/* Overlay Mode Toggle */}
				<div className="space-y-2">
					<div className="flex items-center justify-between gap-4">
						<div className="flex flex-col gap-1">
							<Label>Overlay Mode</Label>
							<span className="text-xs text-gray-500">
								Opens separate windows for scoreboard preview and controls with global hotkeys
							</span>
						</div>
						<Button variant={overlayEnabled ? "default" : "outline"} size="sm" onClick={handleOverlayToggle}>
							{overlayEnabled ? "ON" : "OFF"}
						</Button>
					</div>
				</div>

				{/* Team Settings */}
				<div className="grid grid-cols-3 gap-4">
					<div className="space-y-2">
						<Label htmlFor="teamHomeName">Team Home Name</Label>
						<Input
							id="teamHomeName"
							placeholder="Home Team"
							onChange={handleTeamHomeNameChange}
							value={store.teamHomeName}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="teamAwayName">Team Away Name</Label>
						<Input
							id="teamAwayName"
							placeholder="Away Team"
							onChange={handleTeamAwayNameChange}
							value={store.teamAwayName}
						/>
					</div>
					{/* Half Settings */}
					<div className="space-y-2">
						<Label htmlFor="halfPrefix">Half Prefix</Label>
						<Input
							id="halfPrefix"
							placeholder="PERIODO"
							onChange={handleHalfPrefixChange}
							value={store.halfPrefix}
						/>
					</div>
				</div>

				{/* Team Colors */}
				<div className="grid grid-cols-2 gap-4">
					<div className="space-y-2">
						<Label htmlFor="teamHomeColor">Team Home Color</Label>
						<ColorPicker value={store.teamHomeColor} onChange={store.setTeamHomeColor} />
					</div>
					<div className="space-y-2">
						<Label htmlFor="teamAwayColor">Team Away Color</Label>
						<ColorPicker value={store.teamAwayColor} onChange={store.setTeamAwayColor} />
					</div>
				</div>

				{/* Timer Loadouts */}
				<div className="space-y-4">
					<Label>Timer Loadouts</Label>
					<div className="grid grid-cols-3 gap-4">
						{timerLoadoutConfig.map(({ index, label, placeholder }) => (
							<div key={index} className="space-y-2">
								<Label htmlFor={`timerLoadout${index}`}>{label}</Label>
								<Input
									id={`timerLoadout${index}`}
									type="text"
									inputMode="numeric"
									placeholder={placeholder}
									value={timerLoadoutInputs[index]}
									pattern="^\\d{1,3}(:[0-5]\\d)?$"
									onFocus={handleLoadoutFocus(index)}
									onBlur={handleLoadoutBlur(index)}
									onChange={handleLoadoutChange(index)}
								/>
							</div>
						))}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
