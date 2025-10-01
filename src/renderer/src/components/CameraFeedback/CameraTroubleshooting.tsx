import { Button } from "../ui/Button/Button";
import { JSX } from "react";

interface CameraTroubleshootingProps {
	onRetry: () => void;
}

export function CameraTroubleshooting({ onRetry }: CameraTroubleshootingProps): JSX.Element {
	return (
		<div className="space-y-4 p-4">
			<h3 className="font-semibold text-amber-600">Camera Access Issues</h3>

			<div className="space-y-3 text-sm">
				<div>
					<h4 className="font-medium text-gray-700">For OBS Virtual Camera:</h4>
					<ul className="mt-1 ml-4 list-disc space-y-1 text-gray-600">
						<li>Make sure OBS Virtual Camera is started (Tools → Virtual Camera → Start)</li>
						<li>Close OBS preview windows that might be using the camera</li>
						<li>Try stopping and restarting the Virtual Camera in OBS</li>
						<li>Make sure no other applications are using your cameras</li>
					</ul>
				</div>

				<div>
					<h4 className="font-medium text-gray-700">For Physical Cameras:</h4>
					<ul className="mt-1 ml-4 list-disc space-y-1 text-gray-600">
						<li>Close other apps that might be using the camera (Zoom, Teams, etc.)</li>
						<li>Check if camera is properly connected</li>
						<li>Try unplugging and reconnecting USB cameras</li>
						<li>Restart your computer if issues persist</li>
					</ul>
				</div>

				<div>
					<h4 className="font-medium text-gray-700">Windows-specific:</h4>
					<ul className="mt-1 ml-4 list-disc space-y-1 text-gray-600">
						<li>Check Windows camera privacy settings (Settings → Privacy → Camera)</li>
						<li>Make sure &quot;Allow apps to access your camera&quot; is enabled</li>
						<li>Allow this app to access your camera</li>
					</ul>
				</div>
			</div>

			<div className="flex gap-2">
				<Button onClick={onRetry} size="sm">
					Retry Camera Access
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => window.open("https://obsproject.com/kb/virtual-camera-guide", "_blank")}
				>
					OBS Virtual Camera Guide
				</Button>
			</div>
		</div>
	);
}
