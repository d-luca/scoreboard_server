import { useServerStore } from "@/lib/stores/serverStore";
import { useSettingsStore } from "@/lib/stores/settingsStore";
import React from "react";
import { SectionHeading } from "../SectionHeading";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button/Button";
import { Field } from "../Field";

export function ServerTab(): React.JSX.Element {
	const settings = useSettingsStore((store) => store.settings)!;
	const set = useSettingsStore((store) => store.set);
	const info = useServerStore((store) => store.info);
	const status = useServerStore((store) => store.status);

	const [portDraft, setPortDraft] = React.useState<string | null>(null);
	const [busy, setBusy] = React.useState(false);
	const [message, setMessage] = React.useState<string | null>(null);

	const boundPort = status?.port ?? 0;
	const running = status?.running ?? false;

	const applyPort = async (): Promise<void> => {
		const parsed = Number(portDraft ?? settings.serverPort);
		if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
			setMessage("Port must be a number between 1 and 65535.");
			return;
		}
		setBusy(true);
		setMessage(null);
		try {
			await set({ serverPort: parsed });
			setPortDraft(null);
			setMessage("Server restarting on the new port…");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<section className="flex flex-col gap-3" aria-labelledby="settings-server">
				<SectionHeading id="settings-server">HTTP Server</SectionHeading>
				<Field label="Preferred Port" htmlFor="server-port">
					<div className="flex items-center gap-2">
						<Input
							id="server-port"
							inputMode="numeric"
							className="w-28"
							value={portDraft ?? String(settings.serverPort)}
							onChange={(event) => setPortDraft(event.target.value.replace(/[^\d]/g, "").slice(0, 5))}
						/>
						<Button size="sm" disabled={busy || portDraft === null} onClick={() => void applyPort()}>
							Apply &amp; Restart Server
						</Button>
					</div>
				</Field>
				<p className="text-app-tertiary text-xs">
					{running
						? `Listening on :${boundPort}${
								boundPort !== settings.serverPort ? ` (preferred :${settings.serverPort} was occupied)` : ""
							}. LAN clients reconnect automatically when the server restarts.`
						: "Server is not running."}
				</p>
				{message ? (
					<p className="text-app-tertiary text-xs" role="status">
						{message}
					</p>
				) : null}
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="settings-access">
				<SectionHeading id="settings-access">Remote Access</SectionHeading>
				<label className="flex items-center gap-3 text-sm">
					<input
						type="checkbox"
						className="size-4"
						checked={settings.requireControlToken}
						onChange={(event) =>
							void set({ requireControlToken: event.target.checked }).catch(() => undefined)
						}
					/>
					Require control token
				</label>
				{settings.requireControlToken ? (
					<p className="text-success-400 text-xs">
						Phones must use the token-bearing link or QR code from Outputs &amp; Sharing.
					</p>
				) : (
					<p className="text-warning-400 text-xs">
						Warning: anyone on this network can change the score while the token is off.
					</p>
				)}
				<p className="text-app-quaternary text-xs">
					{info?.tokenRequired
						? "The control link and QR code are shown in Outputs & Sharing."
						: "Control is open; the QR code is hidden while the token is disabled."}
				</p>
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="settings-addresses">
				<SectionHeading id="settings-addresses">Bound Addresses</SectionHeading>
				{info && info.addresses.length > 0 ? (
					<ul className="text-app-tertiary flex flex-col gap-1 text-xs">
						{info.addresses.map((entry) => (
							<li key={entry.address}>
								<code>
									http://{entry.address}:{boundPort}/scoreboard
								</code>{" "}
								<span className="text-app-quaternary">({entry.name})</span>
							</li>
						))}
					</ul>
				) : (
					<p className="text-app-quaternary text-xs">No LAN interfaces found.</p>
				)}
			</section>
		</div>
	);
}
