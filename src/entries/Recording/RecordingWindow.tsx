import React from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { CardContent } from "@/components/ui/Card/CardContent";
import { CardHeader } from "@/components/ui/Card/CardHeader";
import { CardTitle } from "@/components/ui/Card/CardTitle";
import { formatTimer } from "@/lib/format";
import { useRecordingStore } from "@/lib/stores/recordingStore";
import { useWindowStore } from "@/lib/stores/windowStore";

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Recording window (doc 06 §A6): output directory, Start/Stop, live REC
 * status and the recent-recordings list. There is deliberately no
 * `useEscapeToClose` here — `Esc` must not risk hiding the window mid-work
 * — and closing the window never stops the recording; the main status bar
 * keeps the REC badge counting.
 */
export function RecordingWindow(): React.JSX.Element {
	const status = useRecordingStore((store) => store.status);
	const outputDir = useRecordingStore((store) => store.outputDir);
	const recents = useRecordingStore((store) => store.recents);
	const refresh = useRecordingStore((store) => store.refresh);
	const start = useRecordingStore((store) => store.start);
	const stop = useRecordingStore((store) => store.stop);
	const selectOutputDir = useRecordingStore((store) => store.selectOutputDir);
	const openWindow = useWindowStore((store) => store.openWindow);

	const [busy, setBusy] = React.useState<"start" | "stop" | "dir" | null>(null);
	const [message, setMessage] = React.useState<string | null>(null);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	const isRecording = status?.isRecording ?? false;

	const run = async (which: "start" | "stop" | "dir", action: () => Promise<unknown>): Promise<void> => {
		setBusy(which);
		setMessage(null);
		try {
			await action();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className="bg-app-primary flex min-h-screen w-screen flex-col gap-4 overflow-auto p-4">
			<header className="flex items-baseline justify-between">
				<h1 className="font-[Poppins] text-xl font-semibold">Recording</h1>
				{isRecording ? (
					<span className="text-error-400 flex items-center gap-1.5 text-sm font-medium">
						<span className="bg-error-500 inline-block size-2 animate-pulse rounded-full" />
						REC {formatTimer(status?.durationSecs ?? 0)}
					</span>
				) : (
					<span className="text-app-tertiary text-xs">not recording</span>
				)}
			</header>

			{/* Start / Stop (doc 06 §A6) */}
			<Card>
				<CardHeader className="p-4 pb-2">
					<CardTitle className="text-base">Match recording</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3 p-4 pt-0">
					<p className="text-app-tertiary text-xs">
						Captures the full scoreboard state once per second to a <code>.sbrec</code> file. Closing this
						window does not stop the recording.
					</p>
					<div className="flex items-center gap-3">
						<Button
							variant={isRecording ? "destructive" : "default"}
							disabled={busy !== null}
							className="min-w-32"
							onClick={() => void run(isRecording ? "stop" : "start", isRecording ? stop : start)}
						>
							{busy === "start"
								? "Starting..."
								: busy === "stop"
									? "Stopping..."
									: isRecording
										? "Stop"
										: "Start"}
						</Button>
						{isRecording ? (
							<span className="text-app-tertiary truncate text-xs" title={status?.filePath ?? undefined}>
								{status?.snapshotCount ?? 0} snapshots · {status?.filePath ?? ""}
							</span>
						) : null}
					</div>
					{message ? (
						<p className="text-error-400 text-xs" role="alert">
							{message}
						</p>
					) : null}
				</CardContent>
			</Card>

			{/* Output directory (doc 06 §A3) */}
			<Card>
				<CardHeader className="p-4 pb-2">
					<CardTitle className="text-base">Output directory</CardTitle>
				</CardHeader>
				<CardContent className="flex items-center justify-between gap-3 p-4 pt-0">
					<p className="text-app-secondary min-w-0 truncate text-sm" title={outputDir ?? undefined}>
						{outputDir ?? "…"}
					</p>
					<Button
						size="sm"
						variant="outline"
						disabled={isRecording || busy !== null}
						onClick={() => void run("dir", selectOutputDir)}
					>
						Change…
					</Button>
				</CardContent>
			</Card>

			{/* Recent recordings (doc 06 §A6) */}
			<Card>
				<CardHeader className="p-4 pb-2">
					<CardTitle className="text-base">Recent recordings</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					{recents.length === 0 ? (
						<p className="text-app-tertiary text-xs">No recordings yet.</p>
					) : (
						<ul className="flex flex-col">
							{recents.map((rec) => (
								<li
									key={rec.filePath}
									className="hover:bg-app-secondary flex items-center justify-between gap-2 rounded px-1 py-1.5"
								>
									<div className="min-w-0">
										<p className="truncate text-sm" title={rec.filePath}>
											{rec.fileName}
										</p>
										<p className="text-app-quaternary text-xs">
											{new Date(rec.modifiedUnixSecs * 1000).toLocaleString()} · {formatSize(rec.sizeBytes)}
										</p>
									</div>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => void revealItemInDir(rec.filePath).catch(() => undefined)}
									>
										Reveal
									</Button>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>

			<footer className="mt-auto flex items-center justify-between gap-3">
				<p className="text-app-quaternary text-xs">The REC badge in the main window keeps counting.</p>
				{/* Pre-filling the picked recording lands with the generator itself (Phase 9). */}
				<Button
					size="sm"
					variant="secondary"
					disabled={isRecording}
					title="Open the Video Generator with this recording"
					onClick={() => void openWindow("video-generator")}
				>
					Generate Video from Recording…
				</Button>
			</footer>
		</div>
	);
}
