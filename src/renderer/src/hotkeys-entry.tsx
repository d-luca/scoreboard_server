import React from "react";
import ReactDOM from "react-dom/client";
import { HotkeySettings } from "./components/HotkeySettings";
import "./global.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<div className="bg-app-primary h-screen w-screen overflow-auto p-6">
			<HotkeySettings />
		</div>
	</React.StrictMode>,
);
