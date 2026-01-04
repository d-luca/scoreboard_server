import { JSX } from "react";
import { useVideoGeneratorStore } from "@renderer/stores/videoGeneratorStore";
import { Card } from "../ui/Card/Card";
import { CardContent } from "../ui/Card/CardContent";
import { CardTitle } from "../ui/Card/CardTitle";
import { Button } from "../ui/Button/Button";
import { FileSelector } from "./FileSelector";
import { JsonPreview } from "./JsonPreview";
import { VideoSettings } from "./VideoSettings";
import { GenerationProgress } from "./GenerationProgress";

export function VideoGenerator(): JSX.Element {
	const { recording, outputPath, isGenerating, progress, startGeneration, cancelGeneration, reset } =
		useVideoGeneratorStore();

	const canGenerate = recording && outputPath && !isGenerating;
	const isComplete = progress?.step === "complete";

	return (
		<div className="flex size-full flex-col gap-4 p-4">
			<h1 className="text-2xl font-bold text-white">Scoreboard Video Generator</h1>
			<p className="text-sm text-white/70">
				Generate a video from a recorded scoreboard JSON file. The video will have a transparent background
				for easy overlay in video editors.
			</p>

			<div className="grid flex-1 grid-cols-2 gap-4">
				{/* Left column: File selection and preview */}
				<Card className="flex flex-col gap-4 overflow-hidden">
					<CardTitle>Recording File</CardTitle>
					<CardContent className="flex flex-1 flex-col gap-4 overflow-auto">
						<FileSelector />
						<JsonPreview />
					</CardContent>
				</Card>

				{/* Right column: Settings and controls */}
				<Card className="flex flex-col gap-4">
					<CardTitle>Video Settings</CardTitle>
					<CardContent className="flex flex-1 flex-col gap-4">
						<VideoSettings />

						<div className="flex-1" />

						<GenerationProgress />

						{/* Action buttons */}
						<div className="flex gap-2">
							{!isGenerating ? (
								<>
									<Button
										className="flex-1"
										onClick={startGeneration}
										disabled={!canGenerate}
										title={
											!recording
												? "Select a recording file first"
												: !outputPath
													? "Select an output path first"
													: "Start video generation"
										}
									>
										{isComplete ? "Generate Again" : "Generate Video"}
									</Button>
									{(recording || outputPath) && (
										<Button variant="outline" onClick={reset}>
											Reset
										</Button>
									)}
								</>
							) : (
								<Button className="flex-1" variant="destructive" onClick={cancelGeneration}>
									Cancel
								</Button>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
