import React from "react";
import ReactDOM from "react-dom/client";
import "./scoreboard.css";

export function OverlayPreview(): React.JSX.Element {
	return (
		<div className="flex h-screen w-screen flex-col overflow-hidden bg-transparent">
			{/* Draggable title bar */}
			<div
				style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
				className="flex h-8 w-full cursor-move items-center justify-center bg-black/20 backdrop-blur-sm"
			>
				<span className="text-xs font-semibold text-white/60">📺 Scoreboard Preview - Drag to move</span>
			</div>
			{/* Content area with iframe to exposed scoreboard */}
			<div className="flex flex-1 items-center justify-center overflow-hidden p-4">
				<iframe
					src="http://localhost:3001/scoreboard"
					className="h-32 w-full border-0 p-4"
					title="Scoreboard Preview"
				/>
			</div>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<OverlayPreview />
	</React.StrictMode>,
);
