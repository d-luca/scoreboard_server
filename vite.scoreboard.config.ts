import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";

// Vite config specifically for building the scoreboard component for SSR
export default defineConfig({
	plugins: [react()],
	css: {
		postcss: {
			plugins: [tailwindcss, autoprefixer],
		},
	},
	build: {
		lib: {
			entry: resolve(__dirname, "src/renderer/src/scoreboard-entry.tsx"),
			name: "Scoreboard",
			fileName: "scoreboard-ssr",
			formats: ["cjs"], // CommonJS for Node.js compatibility
		},
		rollupOptions: {
			// Don't externalize react/react-dom - bundle them in for SSR
			// external: ["react", "react-dom"],
			output: {
				exports: "named",
			},
		},
		outDir: "dist/scoreboard-ssr",
		emptyOutDir: true,
	},
	resolve: {
		alias: {
			"@renderer": resolve(__dirname, "src/renderer/src"),
		},
	},
});
