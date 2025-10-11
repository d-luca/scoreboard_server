import { ChangeEvent, JSX, useEffect, useState } from "react";
import { Card } from "../ui/Card/Card";
import { CardTitle } from "../ui/Card/CardTitle";
import { CardContent } from "../ui/Card/CardContent";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";
import { useOverlayStore } from "@renderer/stores/overlayStore";
import { useHotkeyStore } from "@renderer/stores/hotkeyStore";
import { formatSecondsToClock, parseMinutesSeconds, sanitizeTimerInput } from "./utils";
import { OverlayModeToggle } from "./OverlayModeToggle";
import { TeamSettings } from "./TeamSettings";
import { TeamColorSettings } from "./TeamColorSettings";
import { TimerLoadoutSettings } from "./TimerLoadoutSettings";

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

	return (
		<Card className="border-app-primary flex h-1/2 w-full flex-col gap-4 overflow-hidden border">
			<CardTitle>Scoreboard Settings</CardTitle>
			<CardContent className="flex size-full flex-col justify-between gap-4 overflow-auto">
				{/* Overlay Mode Toggle */}
				<OverlayModeToggle enabled={overlayEnabled} onToggle={handleOverlayToggle} />

				{/* Team Settings */}
				<TeamSettings
					teamHomeName={store.teamHomeName}
					teamAwayName={store.teamAwayName}
					halfPrefix={store.halfPrefix}
					onTeamHomeNameChange={handleTeamHomeNameChange}
					onTeamAwayNameChange={handleTeamAwayNameChange}
					onHalfPrefixChange={handleHalfPrefixChange}
				/>

				{/* Team Colors */}
				<TeamColorSettings
					teamHomeColor={store.teamHomeColor}
					teamAwayColor={store.teamAwayColor}
					onTeamHomeColorChange={store.setTeamHomeColor}
					onTeamAwayColorChange={store.setTeamAwayColor}
				/>

				{/* Timer Loadouts */}
				<TimerLoadoutSettings
					loadoutInputs={timerLoadoutInputs}
					onLoadoutChange={handleLoadoutChange}
					onLoadoutFocus={handleLoadoutFocus}
					onLoadoutBlur={handleLoadoutBlur}
				/>
			</CardContent>
		</Card>
	);
}
