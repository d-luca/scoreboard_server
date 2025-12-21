import { JSX } from "react";
import { useVideoGeneratorStore } from "@renderer/stores/videoGeneratorStore";
import { Button } from "../ui/Button/Button";

export function VideoSettings(): JSX.Element {
	const { outputPath, frameRate, scoreboardScale, selectOutputPath, setFrameRate, setScoreboardScale } =
		useVideoGeneratorStore();

	return (
		<div className="flex flex-col gap-4">
			{/* Output Path */}
			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium text-white/70">Output File</label>
				<div className="flex gap-2">
					<div className="flex-1 overflow-hidden rounded border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white/90">
						<span className="block truncate">{outputPath || "No output path selected"}</span>
					</div>
					<Button variant="outline" onClick={selectOutputPath}>
						Browse
					</Button>
				</div>
			</div>

			{/* Frame Rate and Scale */}
			<div className="grid grid-cols-2 gap-4">
				<div className="flex flex-col gap-2">
					<label className="text-sm font-medium text-white/70">Frame Rate (FPS)</label>
					<div className="flex items-center gap-2">
						<input
							type="range"
							min={1}
							max={60}
							value={frameRate}
							onChange={(e) => setFrameRate(Number(e.target.value))}
							className="flex-1"
						/>
						<input
							type="number"
							min={1}
							max={60}
							value={frameRate}
							onChange={(e) => setFrameRate(Number(e.target.value))}
							className="w-16 rounded border border-white/10 bg-gray-800 px-2 py-1 text-center text-sm text-white"
						/>
					</div>
					<span className="text-xs text-white/50">Higher FPS = smoother video, larger file</span>
				</div>

				<div className="flex flex-col gap-2">
					<label className="text-sm font-medium text-white/70">Scoreboard Scale</label>
					<div className="flex items-center gap-2">
						<input
							type="range"
							min={0.5}
							max={3}
							step={0.1}
							value={scoreboardScale}
							onChange={(e) => setScoreboardScale(Number(e.target.value))}
							className="flex-1"
						/>
						<input
							type="number"
							min={0.5}
							max={3}
							step={0.1}
							value={scoreboardScale}
							onChange={(e) => setScoreboardScale(Number(e.target.value))}
							className="w-16 rounded border border-white/10 bg-gray-800 px-2 py-1 text-center text-sm text-white"
						/>
					</div>
					<span className="text-xs text-white/50">1.0 = 600×80px, 2.0 = 1200×160px</span>
				</div>
			</div>
		</div>
	);
}
