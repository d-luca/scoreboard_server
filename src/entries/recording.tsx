import React from "react";
import ReactDOM from "react-dom/client";
import "../global.css";
import { RecordingWindow } from "./Recording/RecordingWindow";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<RecordingWindow />
	</React.StrictMode>,
);
