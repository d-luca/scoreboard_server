import React from "react";
import { createRoot } from "react-dom/client";
import "../../global.css";
import { ScoreboardDesignerWindow } from "./ScoreboardDesignerWindow";

const element = document.getElementById("root");
if (!element) throw new Error("Scoreboard Designer root is missing.");
createRoot(element).render(
	<React.StrictMode>
		<ScoreboardDesignerWindow />
	</React.StrictMode>,
);
