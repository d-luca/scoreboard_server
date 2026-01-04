import { JSX, useState } from "react";
import { useRecordingStore } from "@renderer/stores/recordingStore";
import { Button } from "../ui/Button/Button";

export function RecordingControlsCompact(): JSX.Element {
	const { isRecording, duration, startRecording, stopRecording } = useRecordingStore();
	const [isStarting, setIsStarting] = useState(false);
	const [isStopping, setIsStopping] = useState(false);

	const formatDuration = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	const handleStartRecording = async (): Promise<void> => {
		setIsStarting(true);
		try {
			await startRecording();
		} catch (error) {
			console.error("Failed to start recording:", error);
		} finally {
			setIsStarting(false);
		}
	};

	const handleStopRecording = async (): Promise<void> => {
		setIsStopping(true);
		try {
			await stopRecording();
		} catch (error) {
			console.error("Failed to stop recording:", error);
		} finally {
			setIsStopping(false);
		}
	};

	return (
		<div className="flex gap-2 rounded-lg border border-white/10 bg-gray-900 p-2 shadow-2xl backdrop-blur-md">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					{isRecording && <span className="animate-pulse text-xl text-red-500">●</span>}
					<span className="text-xs font-medium text-white/70">
						{isRecording ? `REC ${formatDuration(duration)}` : "Record Scoreboard data"}
					</span>
				</div>
				{/* {isRecording && <span className="text-xs text-white/50">{snapshotCount} snaps</span>} */}
			</div>

			{!isRecording ? (
				<Button size="sm" onClick={handleStartRecording} disabled={isStarting} className="w-full">
					{isStarting ? "Starting..." : "Start Rec"}
				</Button>
			) : (
				<Button
					size="sm"
					variant="destructive"
					onClick={handleStopRecording}
					disabled={isStopping}
					className="w-full"
				>
					{isStopping ? "Stopping..." : "Stop Rec"}
				</Button>
			)}
		</div>
	);
}
