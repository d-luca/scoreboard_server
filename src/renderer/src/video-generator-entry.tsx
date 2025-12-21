import "./global.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Layout } from "./Layout";
import { VideoGeneratorPage } from "./pages/VideoGeneratorPage";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<Layout>
			<VideoGeneratorPage />
		</Layout>
	</StrictMode>,
);
