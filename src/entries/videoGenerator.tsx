import React from "react";
import ReactDOM from "react-dom/client";
import "../global.css";
import { VideoGeneratorWindow } from "./VideoGenerator/VideoGeneratorWindow";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<VideoGeneratorWindow />
	</React.StrictMode>,
);
