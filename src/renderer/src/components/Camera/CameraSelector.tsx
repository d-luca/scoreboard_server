import { useState, useEffect, JSX } from "react";
import { Button } from "../ui/Button/Button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/Select";
import { CameraTroubleshooting } from "../CameraFeedback/CameraTroubleshooting";

interface MediaDeviceInfo {
	deviceId: string;
	label: string;
	kind: string;
}

interface CameraSelectorProps {
	onCameraSelect: (deviceId: string) => void;
	selectedDeviceId?: string;
}

export function CameraSelector({ onCameraSelect, selectedDeviceId }: CameraSelectorProps): JSX.Element {
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string>("");
	const [showTroubleshooting, setShowTroubleshooting] = useState(false);

	const retryDeviceAccess = (): void => {
		setShowTroubleshooting(false);
		setError("");
		// Trigger re-run of the effect by updating a dependency
		setIsLoading(true);
	};

	useEffect(() => {
		const getDevices = async (): Promise<void> => {
			try {
				setIsLoading(true);
				setError("");
				setShowTroubleshooting(false);

				// First try to get devices without requesting permission
				let allDevices = await navigator.mediaDevices.enumerateDevices();
				let videoDevices = allDevices.filter((device) => device.kind === "videoinput");

				// If device labels are empty, we need permission
				if (videoDevices.some((device) => !device.label)) {
					try {
						// Request permission with minimal constraints to avoid hardware conflicts
						const stream = await navigator.mediaDevices.getUserMedia({
							video: {
								width: { ideal: 320 },
								height: { ideal: 240 },
								frameRate: { ideal: 15 },
							},
						});

						// Stop the stream immediately to free resources
						stream.getTracks().forEach((track) => track.stop());

						// Now get devices again with proper labels
						allDevices = await navigator.mediaDevices.enumerateDevices();
						videoDevices = allDevices.filter((device) => device.kind === "videoinput");
					} catch (permissionError) {
						console.warn("Permission request failed, using devices without labels:", permissionError);
					}
				}

				setDevices(
					videoDevices.map((device) => ({
						deviceId: device.deviceId,
						label: device.label || `Camera ${device.deviceId.slice(0, 8)}`,
						kind: device.kind,
					})),
				);

				// Auto-select first device if none selected
				if (videoDevices.length > 0 && !selectedDeviceId) {
					onCameraSelect(videoDevices[0].deviceId);
				}
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : "Unknown error";
				console.error("Camera access error:", err);

				if (
					errorMessage.includes("Could not start video source") ||
					errorMessage.includes("Hardware MFT failed")
				) {
					setError("Camera hardware conflict detected. This often happens with OBS Virtual Camera.");
					setShowTroubleshooting(true);
				} else {
					setError(`Failed to access camera devices: ${errorMessage}`);
					setShowTroubleshooting(true);
				}
			} finally {
				setIsLoading(false);
			}
		};

		getDevices();

		// Listen for device changes
		const handleDeviceChange = (): void => {
			getDevices();
		};

		navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

		return () => {
			navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
		};
	}, [onCameraSelect, selectedDeviceId]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center p-4">
				<span className="text-muted-foreground">Loading camera devices...</span>
			</div>
		);
	}

	if (error) {
		if (showTroubleshooting) {
			return <CameraTroubleshooting onRetry={retryDeviceAccess} />;
		}

		return (
			<div className="p-4 text-red-500">
				<p>{error}</p>
				<div className="mt-3 flex gap-2">
					<Button size="sm" onClick={retryDeviceAccess}>
						Retry
					</Button>
					<Button size="sm" variant="outline" onClick={() => setShowTroubleshooting(true)}>
						Show Troubleshooting
					</Button>
				</div>
			</div>
		);
	}

	if (devices.length === 0) {
		return (
			<div className="text-muted-foreground p-4">
				<p>No camera devices found.</p>
				<p className="mt-2 text-sm">Please connect a camera and refresh the page.</p>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<h3 className="text-sm font-medium">Select Camera:</h3>
			<Select value={selectedDeviceId || ""} onValueChange={onCameraSelect}>
				<SelectTrigger className="w-full">
					<SelectValue placeholder="Choose a camera device..." />
				</SelectTrigger>
				<SelectContent>
					{devices.map((device) => (
						<SelectItem key={device.deviceId} value={device.deviceId}>
							{device.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<p className="text-muted-foreground mt-2 text-xs">
				Found {devices.length} camera device{devices.length !== 1 ? "s" : ""}
			</p>
		</div>
	);
}
