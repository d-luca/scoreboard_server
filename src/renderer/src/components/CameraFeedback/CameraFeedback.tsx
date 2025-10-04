import { JSX, useState } from "react";
import { Card } from "../ui/Card/Card";
import { CameraSelector } from "./CameraSelector";
import { VideoFeed } from "./VideoFeed";
import { CardTitle } from "../ui/Card/CardTitle";
import { CardDescription } from "../ui/Card/CardDescription";
import { CardContent } from "../ui/Card/CardContent";

export function CameraFeedback(): JSX.Element {
	const [selectedCameraId, setSelectedCameraId] = useState<string>("");

	return (
		<Card className="border-app-primary flex size-full flex-col gap-4 border">
			<div className="flex w-full justify-between gap-4">
				<div className="flex flex-col gap-2">
					<CardTitle>Camera Feed</CardTitle>
					<CardContent>
						<CardDescription>Start OBS Virtual Camera an select it from the devices</CardDescription>
					</CardContent>
				</div>
				<CameraSelector onCameraSelect={setSelectedCameraId} selectedDeviceId={selectedCameraId} />
			</div>

			{selectedCameraId && selectedCameraId !== "none" && (
				<div className="flex size-full items-center justify-center">
					<VideoFeed deviceId={selectedCameraId} className="rounded-lg" />
				</div>
			)}
		</Card>
	);
}
