import { JSX } from "react";
import { useVideoGeneratorStore } from "@renderer/stores/videoGeneratorStore";
import { Button } from "../ui/Button/Button";

export function FileSelector(): JSX.Element {
	const { selectedFilePath, loadError, selectFile, recording } = useVideoGeneratorStore();

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium text-white/70">Recording File</label>
				<div className="flex gap-2">
					<div className="flex-1 overflow-hidden rounded border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white/90">
						<span className="block truncate">{selectedFilePath || "No file selected"}</span>
					</div>
					<Button variant="outline" onClick={selectFile}>
						Browse
					</Button>
				</div>
			</div>

			{loadError && (
				<div className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
					Error: {loadError}
				</div>
			)}

			{recording && (
				<div className="grid grid-cols-2 gap-4 text-sm">
					<div className="rounded border border-white/10 bg-gray-800 p-3">
						<span className="block text-xs text-white/50">Teams</span>
						<span className="font-medium text-white">
							{recording.metadata.homeName} vs {recording.metadata.awayName}
						</span>
					</div>
					<div className="rounded border border-white/10 bg-gray-800 p-3">
						<span className="block text-xs text-white/50">Snapshots</span>
						<span className="font-medium text-white">{recording.metadata.totalSnapshots}</span>
					</div>
					<div className="rounded border border-white/10 bg-gray-800 p-3">
						<span className="block text-xs text-white/50">Started</span>
						<span className="font-medium text-white">
							{new Date(recording.metadata.startedAt).toLocaleString()}
						</span>
					</div>
					<div className="rounded border border-white/10 bg-gray-800 p-3">
						<span className="block text-xs text-white/50">Ended</span>
						<span className="font-medium text-white">
							{recording.metadata.endedAt ? new Date(recording.metadata.endedAt).toLocaleString() : "N/A"}
						</span>
					</div>
				</div>
			)}
		</div>
	);
}
