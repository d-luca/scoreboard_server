import { Card } from "@/components/ui/Card/Card";
import { CardContent } from "@/components/ui/Card/CardContent";
import { CardHeader } from "@/components/ui/Card/CardHeader";
import { CardTitle } from "@/components/ui/Card/CardTitle";
import { Label } from "@/components/ui/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { useServerStore } from "@/lib/server-store";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import React from "react";
import { UrlRow } from "./UrlRow";
import { SmallButton } from "./SmallButton";
import { openUrl } from "@tauri-apps/plugin-opener";

function maskControlToken(url: string): string {
	return url.replace(/([?&]t=)[^&]+/, "$1••••••••••••");
}

/**
 * Outputs & Sharing window (doc 04 §7.5): everything the old
 * `ScoreboardFeedback` card held, minus the cramped iframe. The remote
 * control section (QR, token) lands in Phase 4.
 */

const PREVIEW_SCALES = [50, 100, 200] as const;

const VALUE_PROPERTIES = [
	["timer", "Timer (MM:SS)"],
	["teamHomeName", "Home name"],
	["teamHomeScore", "Home score"],
	["teamHomeColor", "Home color"],
	["teamAwayName", "Away name"],
	["teamAwayScore", "Away score"],
	["teamAwayColor", "Away color"],
	["half", "Half"],
	["halfPrefix", "Half prefix"],
	["isTimerRunning", "Timer running"],
	["timerLoadout1", "Loadout 1"],
	["timerLoadout2", "Loadout 2"],
	["timerLoadout3", "Loadout 3"],
] as const;

export function OutputsWindow(): React.JSX.Element {
	useEscapeToClose();

	const info = useServerStore((store) => store.info);
	const status = useServerStore((store) => store.status);
	const showAddresses = useServerStore((store) => store.showAddresses);
	const refresh = useServerStore((store) => store.refresh);
	const regenerateToken = useServerStore((store) => store.regenerateToken);
	const toggleShowAddresses = useServerStore((store) => store.toggleShowAddresses);

	const [scale, setScale] = React.useState<(typeof PREVIEW_SCALES)[number]>(100);
	const [valueProperty, setValueProperty] = React.useState<string>("timer");
	const [copied, setCopied] = React.useState<string | null>(null);
	const [regeneratingToken, setRegeneratingToken] = React.useState(false);
	const [remoteError, setRemoteError] = React.useState<string | null>(null);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	const port = status?.port ?? info?.port ?? 0;
	const running = status?.running ?? info?.running ?? false;
	const localScoreboardUrl = port ? `http://localhost:${port}/scoreboard` : null;
	const valueUrl = port ? `http://localhost:${port}/value/${valueProperty}` : null;
	const controlUrl = info?.controlUrl || null;

	const copy = async (key: string, text: string): Promise<void> => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(key);
			setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
		} catch {
			// Clipboard can fail when the window is unfocused; the URL stays
			// visible for manual selection.
		}
	};

	const handleRegenerateToken = async (): Promise<void> => {
		setRegeneratingToken(true);
		setRemoteError(null);
		setCopied(null);
		try {
			await regenerateToken();
		} catch (error) {
			setRemoteError(error instanceof Error ? error.message : String(error));
		} finally {
			setRegeneratingToken(false);
		}
	};

	return (
		<div className="bg-app-primary flex min-h-screen w-screen flex-col gap-4 overflow-auto p-4">
			<header className="flex items-baseline justify-between">
				<h1 className="font-[Poppins] text-xl font-semibold">Outputs &amp; Sharing</h1>
				<span className="text-app-tertiary text-xs">
					{running ? `server on :${port}` : "server starting…"}
				</span>
			</header>

			{/* Preview (doc 04 §7.5) */}
			<Card>
				<CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
					<CardTitle className="text-base">Preview</CardTitle>
					<div className="flex items-center gap-2">
						<Label htmlFor="preview-scale" className="text-app-tertiary text-xs">
							Scale
						</Label>
						<Select value={String(scale)} onValueChange={(value) => setScale(Number(value) as typeof scale)}>
							<SelectTrigger id="preview-scale" className="h-8 w-24">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PREVIEW_SCALES.map((option) => (
									<SelectItem key={option} value={String(option)}>
										{option} %
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					<div className="checkerboard inline-block overflow-hidden rounded">
						{localScoreboardUrl ? (
							<iframe
								src={localScoreboardUrl}
								title="Scoreboard preview"
								width={622}
								height={80}
								className="block border-0"
								style={{
									transform: `scale(${scale / 100})`,
									transformOrigin: "top left",
									// Keep the layout box at the scaled size so the
									// checkerboard wraps the visible board.
									marginRight: 600 * (scale / 100 - 1),
									marginBottom: 80 * (scale / 100 - 1),
								}}
							/>
						) : (
							<div className="text-app-tertiary flex h-20 w-150 items-center justify-center text-sm">
								Waiting for the server…
							</div>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Local output */}
			<Card>
				<CardHeader className="p-4 pb-2">
					<CardTitle className="text-base">Local output (OBS on this machine)</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-2 p-4 pt-0">
					<UrlRow
						url={localScoreboardUrl}
						copied={copied === "local"}
						onCopy={() => localScoreboardUrl && void copy("local", localScoreboardUrl)}
					/>
					<ol className="text-app-tertiary list-decimal pl-5 text-xs leading-5">
						<li>
							In OBS, add a <em>Browser</em> source.
						</li>
						<li>
							Paste the URL, set width <strong>622</strong> and height <strong>80</strong>.
						</li>
						<li>Scale or position the source in your scene.</li>
					</ol>
				</CardContent>
			</Card>

			{/* LAN outputs — hidden behind the eye toggle by default [PARITY] */}
			<Card>
				<CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
					<CardTitle className="text-base">LAN outputs</CardTitle>
					<button
						type="button"
						onClick={toggleShowAddresses}
						aria-label={showAddresses ? "Hide LAN addresses" : "Show LAN addresses"}
						title={showAddresses ? "Hide LAN addresses" : "Show LAN addresses"}
						className="text-app-tertiary hover:text-app-primary px-2 text-base transition-colors"
					>
						{showAddresses ? "🙈" : "👁"}
					</button>
				</CardHeader>
				<CardContent className="flex flex-col gap-2 p-4 pt-0">
					{!showAddresses ? (
						<p className="text-app-quaternary text-xs">Addresses hidden — click the eye to reveal them.</p>
					) : info && info.addresses.length > 0 ? (
						info.addresses.map((entry) => {
							const url = `http://${entry.address}:${port}/scoreboard`;
							return (
								<div key={entry.address} className="flex items-center gap-2">
									<code className="text-app-secondary bg-app-tertiary flex-1 truncate rounded px-2 py-1.5 text-xs">
										{url}
										<span className="text-app-quaternary"> ({entry.name})</span>
									</code>
									<SmallButton onClick={() => void copy(entry.address, url)}>
										{copied === entry.address ? "Copied!" : "Copy"}
									</SmallButton>
									<SmallButton onClick={() => void openUrl(url)}>Open</SmallButton>
								</div>
							);
						})
					) : (
						<p className="text-app-quaternary text-xs">No LAN interfaces found.</p>
					)}
				</CardContent>
			</Card>

			{/* Remote control */}
			<Card>
				<CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
					<CardTitle className="text-base">Remote control</CardTitle>
					<button
						type="button"
						onClick={toggleShowAddresses}
						aria-label={showAddresses ? "Mask control token" : "Reveal control token"}
						title={showAddresses ? "Mask control token" : "Reveal control token"}
						className="text-app-tertiary hover:text-app-primary px-2 text-base transition-colors"
					>
						{showAddresses ? "🙈" : "👁"}
					</button>
				</CardHeader>
				<CardContent className="grid gap-4 p-4 pt-0 sm:grid-cols-[9rem_minmax(0,1fr)]">
					<div className="bg-white p-2">
						{info?.controlQrSvg ? (
							<img
								src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(info.controlQrSvg)}`}
								alt="QR code for the remote control link"
								className="aspect-square size-full"
							/>
						) : (
							<div className="text-secondary-700 flex aspect-square items-center justify-center text-center text-xs">
								Waiting for server…
							</div>
						)}
					</div>
					<div className="flex min-w-0 flex-col gap-3">
						<p className="text-app-tertiary text-xs">
							Scan the QR code on a phone connected to this network, or use the token-bearing link below.
						</p>
						<code className="text-app-secondary bg-app-tertiary min-h-8 rounded px-2 py-1.5 text-xs break-all">
							{controlUrl ? (showAddresses ? controlUrl : maskControlToken(controlUrl)) : "server starting…"}
						</code>
						<div className="flex flex-wrap gap-2">
							<SmallButton
								disabled={!controlUrl}
								onClick={() => controlUrl && void copy("control", controlUrl)}
							>
								{copied === "control" ? "Copied!" : "Copy control link"}
							</SmallButton>
							<SmallButton disabled={!controlUrl} onClick={() => controlUrl && void openUrl(controlUrl)}>
								Open
							</SmallButton>
							<SmallButton disabled={!info || regeneratingToken} onClick={() => void handleRegenerateToken()}>
								{regeneratingToken ? "Regenerating…" : "Regenerate token"}
							</SmallButton>
						</div>
						<p className={`text-xs ${info?.tokenRequired ? "text-success-400" : "text-warning-400"}`}>
							{info
								? info.tokenRequired
									? "🔒 Control token required"
									: "🔓 Control is open to the LAN (token disabled in Settings › Server)"
								: ""}
						</p>
						{remoteError ? (
							<p className="text-error-400 text-xs" role="alert">
								{remoteError}
							</p>
						) : null}
					</div>
				</CardContent>
			</Card>

			{/* Single-value outputs [NEW] */}
			<Card>
				<CardHeader className="p-4 pb-2">
					<CardTitle className="text-base">Single-value outputs</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-2 p-4 pt-0">
					<p className="text-app-tertiary text-xs">
						Composite one field per OBS browser source (transparent, white, 48 px).
					</p>
					<div className="flex items-center gap-2">
						<Select value={valueProperty} onValueChange={setValueProperty}>
							<SelectTrigger aria-label="Value property" className="h-9 w-48">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{VALUE_PROPERTIES.map(([key, label]) => (
									<SelectItem key={key} value={key}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<UrlRow
							url={valueUrl}
							copied={copied === "value"}
							onCopy={() => valueUrl && void copy("value", valueUrl)}
						/>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
