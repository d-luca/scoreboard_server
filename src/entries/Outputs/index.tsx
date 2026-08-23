import React from "react";
import ReactDOM from "react-dom/client";
import "../../global.css";
import { OutputsWindow } from "./OutputsWindow";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<OutputsWindow />
	</React.StrictMode>,
);
