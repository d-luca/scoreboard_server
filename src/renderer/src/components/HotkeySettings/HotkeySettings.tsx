import { JSX, useState } from "react";
import { Card } from "../ui/Card/Card";
import { CardContent } from "../ui/Card/CardContent";
import { CardTitle } from "../ui/Card/CardTitle";
import { Button } from "../ui/Button/Button";
import { useHotkeyStore, hotkeyActionLabels, type HotkeyAction } from "@renderer/stores/hotkeyStore";
import { HotkeyRecorder } from "./HotkeyRecorder";

export function HotkeySettings(): JSX.Element {
	const { hotkeys, enabled, toggleEnabled, resetHotkeys, getHotkeyString } = useHotkeyStore();
	const [editingAction, setEditingAction] = useState<HotkeyAction | null>(null);
	const [wasEnabledBeforeEdit, setWasEnabledBeforeEdit] = useState<boolean>(false);

	const startEditing = (action: HotkeyAction): void => {
		if (enabled) {
			setWasEnabledBeforeEdit(true);
			toggleEnabled();
		}
		setEditingAction(action);
	};

	const finishEditing = (): void => {
		setEditingAction(null);
		if (wasEnabledBeforeEdit) {
			toggleEnabled();
			setWasEnabledBeforeEdit(false);
		}
	};

	const hotkeyGroups = {
		Score: ["increaseHomeScore", "decreaseHomeScore", "increaseAwayScore", "decreaseAwayScore"],
		Half: ["increaseHalf", "decreaseHalf"],
		Timer: [
			"startTimer",
			"pauseTimer",
			"stopTimer",
			"increaseTimerSecond",
			"decreaseTimerSecond",
			"increaseTimerMinute",
			"decreaseTimerMinute",
		],
		Loadouts: ["timerLoadout1", "timerLoadout2", "timerLoadout3"],
		Other: ["resetScoreboard"],
	} as const;

	return (
		<Card className="flex h-full flex-col gap-4 overflow-hidden">
			<CardTitle>Keyboard Shortcuts</CardTitle>
			<CardContent className="flex h-full flex-col gap-4 overflow-hidden">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium">Hotkeys Enabled</span>
						<Button variant={enabled ? "default" : "outline"} size="sm" onClick={toggleEnabled}>
							{enabled ? "ON" : "OFF"}
						</Button>
					</div>
					<Button variant="outline" size="sm" onClick={resetHotkeys}>
						Reset to Defaults
					</Button>
				</div>

				<div className="h-full space-y-4 overflow-y-auto">
					{Object.entries(hotkeyGroups).map(([groupName, actions]) => (
						<div key={groupName} className="space-y-2">
							<h4 className="text-app-secondary text-sm font-semibold">{groupName}</h4>
							<div className="space-y-1">
								{actions.map((action) => {
									const typedAction = action as HotkeyAction;
									const hotkey = hotkeys[typedAction];
									const isEditing = editingAction === typedAction;

									return (
										<div
											key={action}
											className="bg-surface-secondary border-app-secondary flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
										>
											<span className="text-app-secondary flex-1">{hotkeyActionLabels[typedAction]}</span>
											{isEditing ? (
												<HotkeyRecorder
													action={typedAction}
													onCancel={finishEditing}
													onComplete={finishEditing}
													autoStart={true}
												/>
											) : (
												<>
													<kbd className="bg-surface-tertiary border-app-tertiary text-app-primary min-w-28 rounded-md border px-3 py-1.5 text-center font-mono text-xs shadow-sm">
														{getHotkeyString(typedAction)}
													</kbd>
													<Button
														variant="outline"
														size="sm"
														onClick={() => startEditing(typedAction)}
														disabled={!hotkey.enabled}
													>
														Change
													</Button>
												</>
											)}
										</div>
									);
								})}
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
