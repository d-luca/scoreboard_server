import React from "react";
import ReactDOM from "react-dom/client";
import "../../global.css";
import { SettingsWindow } from "./SettingsWindow";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<SettingsWindow />
	</React.StrictMode>,
);
