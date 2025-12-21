import { JSX } from "react";
import { useVideoGeneratorStore } from "@renderer/stores/videoGeneratorStore";

export function JsonPreview(): JSX.Element {
	const { recording } = useVideoGeneratorStore();

	if (!recording) {
		return (
			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium text-white/70">JSON Preview</label>
				<div className="flex h-64 items-center justify-center rounded border border-white/10 bg-gray-800 text-white/50">
					Select a recording file to preview its content
				</div>
			</div>
		);
	}

	const jsonContent = JSON.stringify(recording, null, 2);

	return (
		<div className="flex flex-col gap-2">
			<label className="text-sm font-medium text-white/70">
				JSON Preview ({recording.snapshots.length} snapshots)
			</label>
			<textarea
				readOnly
				value={jsonContent}
				className="h-64 resize-none rounded border border-white/10 bg-gray-800 p-3 font-mono text-xs text-white/90 focus:ring-1 focus:ring-blue-500 focus:outline-none"
				spellCheck={false}
			/>
		</div>
	);
}
