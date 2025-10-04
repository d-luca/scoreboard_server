import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin(), react()],
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
	},
	renderer: {
		resolve: {
			alias: {
				"@renderer": resolve("src/renderer/src"),
			},
		},
		plugins: [react(), tailwindcss()],
		build: {
			rollupOptions: {
				input: {
					index: resolve(__dirname, "src/renderer/index.html"),
					hotkeys: resolve(__dirname, "src/renderer/hotkeys.html"),
					"overlay-preview": resolve(__dirname, "src/renderer/overlay-preview.html"),
					"overlay-control": resolve(__dirname, "src/renderer/overlay-control.html"),
				},
			},
		},
	},
});
