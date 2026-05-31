import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { useBuzzerStore } from "@renderer/stores/buzzerStore";

export function BuzzerSettingsPanel(): JSX.Element {
	const { buzzerEnabled, toggleBuzzer, playBuzzer, customTrackName, selectTrack, clearTrack } =
		useBuzzerStore();

	return (
		<div className="flex size-full flex-col gap-6 overflow-auto">
			{/* Auto-buzzer toggle */}
			<div className="flex flex-col gap-2">
				<span className="text-app-secondary text-sm font-semibold">Auto Buzzer</span>
				<div className="flex items-center justify-between gap-4">
					<span className="text-app-secondary text-sm">
						Play the buzzer automatically when the countdown timer reaches zero.
					</span>
					<Button
						variant={buzzerEnabled ? "default" : "outline"}
						size="sm"
						onClick={toggleBuzzer}
						title="Auto-buzzer when timer ends"
					>
						{buzzerEnabled ? "ON" : "OFF"}
					</Button>
				</div>
			</div>

			{/* Audio track selection */}
			<div className="flex flex-col gap-2">
				<span className="text-app-secondary text-sm font-semibold">Buzzer Audio Track</span>
				<div className="bg-surface-secondary border-app-secondary flex flex-col gap-1 rounded-md border p-3">
					<span className="text-app-secondary text-xs">Current track</span>
					<span className="text-app-primary truncate text-sm font-medium">
						{customTrackName ?? "Default (built-in buzzer)"}
					</span>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" size="sm" onClick={() => void selectTrack()}>
						Choose File…
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => void clearTrack()}
						disabled={customTrackName === null}
					>
						Use Default
					</Button>
					<Button variant="outline" size="sm" onClick={playBuzzer} title="Preview buzzer sound">
						Test
					</Button>
				</div>
				<span className="text-app-secondary text-xs">Supported formats: MP3, WAV, OGG, M4A, AAC, FLAC.</span>
			</div>
		</div>
	);
}
