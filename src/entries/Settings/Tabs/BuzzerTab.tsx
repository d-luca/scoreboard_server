import { Button } from "@/components/ui/Button/Button";
import { useBuzzerStore } from "@/lib/stores/buzzer-store";
import { useSettingsStore } from "@/lib/stores/settings-store";
import React from "react";
import { SectionHeading } from "../SectionHeading";

export function BuzzerTab(): React.JSX.Element {
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
