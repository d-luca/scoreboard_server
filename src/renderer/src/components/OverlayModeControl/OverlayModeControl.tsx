import { JSX, useEffect } from "react";
import { Card } from "../ui/Card/Card";
import { CardContent } from "../ui/Card/CardContent";
import { CardTitle } from "../ui/Card/CardTitle";
import { Button } from "../ui/Button/Button";
import { useOverlayStore } from "@renderer/stores/overlayStore";
import { useHotkeyStore } from "@renderer/stores/hotkeyStore";

export function OverlayModeControl(): JSX.Element {
	const { enabled, toggleOverlay, setOverlay } = useOverlayStore();
	const { enabled: hotkeyEnabled } = useHotkeyStore();

	useEffect(() => {
		// Listen for overlay windows being closed
		const unsubscribeClosed = window.api.onOverlayWindowsClosed(() => {
			setOverlay(false);
		});

		// Listen for overlay windows being opened (from menu)
		const unsubscribeOpened = window.api.onOverlayWindowsOpened(() => {
			setOverlay(true);
		});

		// Listen for reset overlay state on app startup
		const unsubscribeReset = window.api.onResetOverlayState(() => {
			setOverlay(false);
		});

		return () => {
			unsubscribeClosed();
			unsubscribeOpened();
			unsubscribeReset();
		};
	}, [setOverlay]);

	const handleToggle = (): void => {
		if (enabled) {
			window.api.disableOverlayMode();
		} else {
			window.api.enableOverlayMode(hotkeyEnabled);
		}
		toggleOverlay();
	};

	return (
		<Card className="flex flex-col gap-4">
			<CardTitle>Overlay Mode</CardTitle>
			<CardContent className="flex flex-col gap-4">
				<div className="flex items-center justify-between gap-4">
					<div className="flex flex-col gap-1">
						<span className="text-sm font-medium">Overlay Mode</span>
						<span className="text-xs text-gray-500">
							Opens separate windows for scoreboard preview and controls with global hotkeys
						</span>
					</div>
					<Button variant={enabled ? "default" : "outline"} size="sm" onClick={handleToggle}>
						{enabled ? "ON" : "OFF"}
					</Button>
				</div>

				{enabled && (
					<div className="bg-primary-900/30 border-primary-700 rounded-md border p-4">
						<p className="text-primary-300 font-medium">Overlay Mode Active</p>
						<p className="text-app-secondary mt-1.5 text-xs">
							Two new windows have been opened. Hotkeys will work even when the windows are not in focus.
						</p>
					</div>
				)}

				{!enabled && (
					<div className="border-app-secondary bg-surface-secondary rounded-md border p-4">
						<p className="text-app-secondary text-xs">
							<strong>Overlay Mode Features:</strong>
						</p>
						<ul className="text-app-secondary mt-2 list-inside list-disc space-y-1 text-xs">
							<li>Separate transparent scoreboard preview window (always on top)</li>
							<li>Compact floating control panel</li>
							<li>Global hotkeys work from any application</li>
							<li>Perfect for streaming and presentations</li>
						</ul>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
