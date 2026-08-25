import React from "react";
import ReactDOM from "react-dom/client";
import "../../global.css";
import { PresetsWindow } from "./PresetsWindow";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<PresetsWindow />
	</React.StrictMode>,
);
