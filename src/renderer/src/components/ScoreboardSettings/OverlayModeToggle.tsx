import { JSX } from "react";
import { Label } from "../ui/Label";
import { Button } from "../ui/Button/Button";

interface OverlayModeToggleProps {
	enabled: boolean;
	onToggle: () => void;
}

export function OverlayModeToggle({ enabled, onToggle }: OverlayModeToggleProps): JSX.Element {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-4">
				<div className="flex flex-col gap-1">
					<Label>Overlay Mode</Label>
					<span className="text-xs text-gray-500">
						Opens separate windows for scoreboard preview and controls with global hotkeys
					</span>
				</div>
				<Button variant={enabled ? "default" : "outline"} size="sm" onClick={onToggle}>
					{enabled ? "ON" : "OFF"}
				</Button>
			</div>
		</div>
	);
}
