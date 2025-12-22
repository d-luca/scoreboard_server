import { JSX, useState } from "react";
import { useRecordingStore } from "@renderer/stores/recordingStore";
import { Button } from "../ui/Button/Button";
import { Card } from "../ui/Card/Card";
import { CardContent } from "../ui/Card/CardContent";
import { CardTitle } from "../ui/Card/CardTitle";

export function RecordingControls(): JSX.Element {
	const { isRecording, outputDir, startRecording, stopRecording, selectOutputDir } = useRecordingStore();
	const [isStarting, setIsStarting] = useState(false);
	const [isStopping, setIsStopping] = useState(false);

	// Format duration as MM:SS
	// const formatDuration = (seconds: number): string => {
	// 	const mins = Math.floor(seconds / 60);
	// 	const secs = seconds % 60;
	// 	return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	// };

	const handleStartRecording = async (): Promise<void> => {
		setIsStarting(true);
		try {
			await startRecording();
		} catch (error) {
			console.error("Failed to start recording:", error);
			alert("Failed to start recording. Please check console for details.");
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
			alert("Failed to stop recording. Please check console for details.");
		} finally {
			setIsStopping(false);
		}
	};

	const handleChangeOutputDir = async (): Promise<void> => {
		if (isRecording) return;

		try {
			await selectOutputDir();
		} catch (error) {
			console.error("Failed to change output directory:", error);
			alert("Failed to change output directory. Please check console for details.");
		}
	};

	return (
		<Card className="flex w-full flex-col gap-4">
			<CardTitle className="flex items-center gap-2">
				Record Scoreboard data
				{isRecording && (
					<span className="flex items-center gap-1 text-sm font-normal text-red-500">
						<span className="animate-pulse leading-none">●</span>
						Recording...
					</span>
				)}
			</CardTitle>

			<CardContent className="flex flex-col gap-4">
				{/* Output Directory */}
				<div className="flex flex-col gap-2">
					<label className="text-sm font-medium text-white/70">Output Directory</label>
					<div className="flex gap-2">
						<div className="flex-1 rounded border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white/90">
							{outputDir || "Loading..."}
						</div>
						<Button
							variant="outline"
							onClick={handleChangeOutputDir}
							disabled={isRecording}
							title={isRecording ? "Cannot change directory while recording" : "Change output directory"}
						>
							Change
						</Button>
					</div>
				</div>

				{/* Recording Stats */}
				{/* {isRecording && (
					<div className="grid grid-cols-2 gap-4">
						<div className="flex flex-col gap-1 rounded border border-white/10 bg-gray-800 p-3">
							<span className="text-xs text-white/50">Duration</span>
							<span className="text-xl font-bold text-white">{formatDuration(duration)}</span>
						</div>
						<div className="flex flex-col gap-1 rounded border border-white/10 bg-gray-800 p-3">
							<span className="text-xs text-white/50">Snapshots</span>
							<span className="text-xl font-bold text-white">{snapshotCount}</span>
						</div>
					</div>
				)} */}

				{/* Recording Controls */}
				<div className="flex gap-2">
					{!isRecording ? (
						<Button
							className="flex-1"
							onClick={handleStartRecording}
							disabled={isStarting}
							title="Start recording scoreboard data"
						>
							{isStarting ? "Starting..." : "Start Recording"}
						</Button>
					) : (
						<Button
							className="flex-1"
							variant="destructive"
							onClick={handleStopRecording}
							disabled={isStopping}
							title="Stop recording"
						>
							{isStopping ? "Stopping..." : "Stop Recording"}
						</Button>
					)}
				</div>

				{/* Video Generator */}
				<Button
					variant="outline"
					onClick={() => window.api.openVideoGenerator()}
					disabled={isRecording}
					title={isRecording ? "Stop recording first to generate video" : "Open Video Generator"}
					className="w-full"
				>
					Generate Video from Recording
				</Button>
			</CardContent>
		</Card>
	);
}
