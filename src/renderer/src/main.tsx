import "./global.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Layout } from "./Layout";
import { ScoreboardMain } from "./pages/ScoreboardMain";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<Layout>
			<ScoreboardMain />
		</Layout>
	</StrictMode>,
);
