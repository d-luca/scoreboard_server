import { useEffect, useRef, JSX } from "react";

interface VideoFeedProps {
	deviceId: string | null;
	width?: number | string;
	height?: number | string;
	className?: string;
}

export function VideoFeed({
	deviceId,
	width = "100%",
	height = "100%",
	className = "",
}: VideoFeedProps): JSX.Element {
	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		if (!deviceId || !videoRef.current) return;

		const getVideo = async (): Promise<void> => {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					video: { deviceId: { exact: deviceId } },
					audio: false,
				});

				if (videoRef.current) {
					videoRef.current.srcObject = stream;
					videoRef.current.play();
				}
			} catch (error) {
				console.error("VideoFeed failed:", error);
			}
		};

		getVideo();
	}, [deviceId]);

	if (!deviceId) {
		return (
			<div className={`flex items-center justify-center bg-gray-100 ${className}`} style={{ width, height }}>
				<span className="text-gray-500">No camera selected</span>
			</div>
		);
	}

	return (
		<video
			ref={videoRef}
			width={width}
			height={height}
			autoPlay
			muted
			playsInline
			className={`border border-blue-500 ${className}`}
		/>
	);
}
