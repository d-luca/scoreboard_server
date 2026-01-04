import { JSX } from "react";
import { useVideoGeneratorStore } from "@renderer/stores/videoGeneratorStore";
import { GenerationStep } from "../../../../types/scoreboard";

const stepLabels: Record<GenerationStep, string> = {
	idle: "Ready",
	parsing: "Parsing Recording",
	rendering: "Rendering Frames",
	encoding: "Encoding Video",
	cleanup: "Cleaning Up",
	complete: "Complete",
	error: "Error",
};

export function GenerationProgress(): JSX.Element {
	const { progress, isGenerating } = useVideoGeneratorStore();

	if (!progress && !isGenerating) {
		return <></>;
	}

	const step = progress?.step || "idle";
	const overallProgress = progress?.overallProgress || 0;
	const message = progress?.message || "";
	const error = progress?.error;
	const currentFrame = progress?.currentFrame;
	const totalFrames = progress?.totalFrames;

	const isComplete = step === "complete";
	const isError = step === "error";

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<span className="text-sm font-medium text-white/70">Generation Progress</span>
				<span
					className={`text-sm font-medium ${
						isComplete ? "text-green-400" : isError ? "text-red-400" : "text-blue-400"
					}`}
				>
					{stepLabels[step]}
				</span>
			</div>

			{/* Progress bar */}
			<div className="h-2 overflow-hidden rounded-full bg-gray-700">
				<div
					className={`h-full transition-all duration-300 ${
						isComplete ? "bg-green-500" : isError ? "bg-red-500" : "bg-blue-500"
					}`}
					style={{ width: `${overallProgress}%` }}
				/>
			</div>

			{/* Progress details */}
			<div className="flex items-center justify-between text-xs text-white/50">
				<span>{message}</span>
				<span>
					{overallProgress}%{currentFrame && totalFrames && ` (${currentFrame}/${totalFrames} frames)`}
				</span>
			</div>

			{/* Error message */}
			{isError && error && (
				<div className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
					{error}
				</div>
			)}

			{/* Success message */}
			{isComplete && (
				<div className="rounded border border-green-500/50 bg-green-500/10 px-3 py-2 text-sm text-green-400">
					Video generated successfully!
				</div>
			)}
		</div>
	);
}
