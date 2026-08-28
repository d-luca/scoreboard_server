import React from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { CardContent } from "@/components/ui/Card/CardContent";
import { CardHeader } from "@/components/ui/Card/CardHeader";
import { CardTitle } from "@/components/ui/Card/CardTitle";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { formatTimer } from "@/lib/format";
import { useVideoStore } from "@/lib/stores/videoStore";

const SCALE_OPTIONS = [0.5, 1, 2, 3];

const STEP_LABEL: Record<string, string> = {
	idle: "Idle",
	parsing: "Parsing recording",
	rendering: "Rendering frames",
	encoding: "Encoding video",
	cleanup: "Finalizing",
	complete: "Complete",
	error: "Error",
};

/**
 * Video-generator window (doc 06 §B7): pick a recording, tune the encode,
 * watch progress. There is deliberately no `useEscapeToClose` — `Esc` must
 * not risk hiding the window mid-generation.
 */
export function VideoGeneratorWindow(): React.JSX.Element {
	const recordingPath = useVideoStore((store) => store.recordingPath);
	const outputPath = useVideoStore((store) => store.outputPath);
	const metadata = useVideoStore((store) => store.metadata);
	const loadError = useVideoStore((store) => store.loadError);
	const frameRate = useVideoStore((store) => store.frameRate);
	const scale = useVideoStore((store) => store.scale);
	const progress = useVideoStore((store) => store.progress);
	const generating = useVideoStore((store) => store.generating);
	const init = useVideoStore((store) => store.init);
	const browseRecording = useVideoStore((store) => store.browseRecording);
	const browseOutput = useVideoStore((store) => store.browseOutput);
	const setFrameRate = useVideoStore((store) => store.setFrameRate);
	const setScale = useVideoStore((store) => store.setScale);
	const generate = useVideoStore((store) => store.generate);
	const cancel = useVideoStore((store) => store.cancel);
	const reset = useVideoStore((store) => store.reset);

	const [browseBusy, setBrowseBusy] = React.useState(false);
	const [actionError, setActionError] = React.useState<string | null>(null);

	React.useEffect(() => {
		void init();
	}, [init]);

	const runBrowse = (action: () => Promise<void>): void => {
		setBrowseBusy(true);
		setActionError(null);
		void action()
			.catch((error) => setActionError(error instanceof Error ? error.message : String(error)))
			.finally(() => setBrowseBusy(false));
	};

	const ready = metadata !== null && outputPath !== null && !generating;
	const done = progress.step === "complete";

	return (
		<div className="bg-app-primary flex min-h-screen w-screen flex-col gap-4 overflow-auto p-4">
			<header className="flex items-baseline justify-between">
				<h1 className="font-[Poppins] text-xl font-semibold">Video Generator</h1>
				<span className="text-app-tertiary text-xs">{STEP_LABEL[progress.step] ?? progress.step}</span>
			</header>

			<div className="grid flex-1 grid-cols-1 items-start gap-4 md:grid-cols-2">
				{/* Recording File card (doc 06 §B7) */}
				<Card>
					<CardHeader className="p-4 pb-2">
						<CardTitle className="text-base">Recording File</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3 p-4 pt-0">
						<div className="flex items-center justify-between gap-3">
							<p className="text-app-secondary min-w-0 truncate text-sm" title={recordingPath ?? undefined}>
								{recordingPath ?? "No recording selected"}
							</p>
							<Button
								size="sm"
								variant="outline"
								disabled={generating || browseBusy}
								onClick={() => runBrowse(browseRecording)}
							>
								Browse…
							</Button>
						</div>

						{loadError ? (
							<p className="text-error-400 bg-error-500/10 rounded-md p-2 text-xs" role="alert">
								{loadError}
							</p>
						) : null}

						{metadata ? (
							<>
								<dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
									<dt className="text-app-tertiary">Teams</dt>
									<dd className="truncate">
										{metadata.homeName} vs {metadata.awayName}
									</dd>
									<dt className="text-app-tertiary">Snapshots</dt>
									<dd>
										{metadata.snapshotCount} ({formatTimer(metadata.durationSecs)})
									</dd>
									<dt className="text-app-tertiary">Started</dt>
									<dd className="truncate">{new Date(metadata.startedAt).toLocaleString()}</dd>
									<dt className="text-app-tertiary">Ended</dt>
									<dd className="truncate">
										{metadata.endedAt ? new Date(metadata.endedAt).toLocaleString() : "interrupted"}
									</dd>
								</dl>
								<pre className="bg-app-secondary text-app-quaternary max-h-28 overflow-auto rounded-md p-2 text-[10px] leading-relaxed">
									{metadata.firstSnapshots.map((snapshot) => JSON.stringify(snapshot)).join("\n")}
								</pre>
							</>
						) : (
							<p className="text-app-tertiary text-xs">
								Pick a <code>.sbrec</code> recording (or a legacy Electron <code>.json</code> one).
							</p>
						)}
					</CardContent>
				</Card>

				{/* Video Settings card (doc 06 §B7) */}
				<Card>
					<CardHeader className="p-4 pb-2">
						<CardTitle className="text-base">Video Settings</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3 p-4 pt-0">
						<div className="flex items-center justify-between gap-3">
							<p className="text-app-secondary min-w-0 truncate text-sm" title={outputPath ?? undefined}>
								{outputPath ?? "No output selected"}
							</p>
							<Button
								size="sm"
								variant="outline"
								disabled={generating || browseBusy}
								onClick={() => runBrowse(browseOutput)}
							>
								Browse…
							</Button>
						</div>

						<div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
							<Label htmlFor="frame-rate">Frame rate</Label>
							<input
								id="frame-rate"
								type="range"
								min={1}
								max={60}
								value={frameRate}
								disabled={generating}
								className="accent-primary-500 w-full"
								onChange={(event) => setFrameRate(Number(event.target.value))}
							/>
							<Input
								type="number"
								min={1}
								max={60}
								value={frameRate}
								disabled={generating}
								className="w-20"
								aria-label="Frame rate value"
								onChange={(event) => setFrameRate(Number(event.target.value))}
							/>
						</div>

						<div className="grid grid-cols-[auto_1fr] items-center gap-3">
							<Label>Scoreboard scale</Label>
							<Select
								value={String(scale)}
								onValueChange={(value) => setScale(Number(value))}
								disabled={generating}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{SCALE_OPTIONS.map((option) => (
										<SelectItem key={option} value={String(option)}>
											{option}×
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Progress (doc 06 §B5/B7) */}
			<Card>
				<CardContent className="flex flex-col gap-2 p-4">
					<div className="flex items-center justify-between text-sm">
						<span className={progress.step === "error" ? "text-error-400" : undefined}>
							{progress.message}
						</span>
						<span className="text-app-tertiary text-xs">
							{progress.currentFrame !== null && progress.totalFrames !== null
								? `${progress.currentFrame} / ${progress.totalFrames} frames · `
								: ""}
							{progress.overallProgress}%
						</span>
					</div>
					<div
						className="bg-app-secondary h-2 overflow-hidden rounded-full"
						role="progressbar"
						aria-valuenow={progress.overallProgress}
					>
						<div
							className={`h-full transition-[width] ${progress.step === "error" ? "bg-error-500" : done ? "bg-success-500" : "bg-primary-500"}`}
							style={{ width: `${progress.overallProgress}%` }}
						/>
					</div>
					{actionError ? (
						<p className="text-error-400 text-xs" role="alert">
							{actionError}
						</p>
					) : null}
				</CardContent>
			</Card>

			<footer className="flex items-center justify-end gap-2">
				<Button size="sm" variant="ghost" disabled={generating} onClick={reset}>
					Reset
				</Button>
				{done && outputPath ? (
					<Button
						size="sm"
						variant="outline"
						onClick={() => void revealItemInDir(outputPath).catch(() => undefined)}
					>
						Reveal in folder
					</Button>
				) : null}
				{generating ? (
					<Button size="sm" variant="destructive" onClick={() => void cancel()}>
						Cancel
					</Button>
				) : (
					<Button size="sm" disabled={!ready} onClick={() => void generate()}>
						{done ? "Generate Again" : "Generate Video"}
					</Button>
				)}
			</footer>
		</div>
	);
}
