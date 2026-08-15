import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
	plugins: [
		react({
			babel: {
				// React Compiler: auto-memoization + Rules-of-React validation at build time.
				// https://react.dev/learn/react-compiler
				plugins: [["babel-plugin-react-compiler", {}]],
			},
		}),
		tailwindcss(),
	],

	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},

	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	//
	// 1. prevent Vite from obscuring rust errors
	clearScreen: false,
	// 2. tauri expects a fixed port, fail if that port is not available
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host
			? {
					protocol: "ws",
					host,
					port: 1421,
				}
			: undefined,
		watch: {
			// 3. tell Vite to ignore watching `src-tauri`
			ignored: ["**/src-tauri/**"],
		},
	},

	// Multi-entry build (tauri-rebuild doc 04 §2): one bundle per window / LAN page,
	// all served from the same dist/ folder.
	build: {
		target: "es2022",
		rollupOptions: {
			input: {
				main: fileURLToPath(new URL("./index.html", import.meta.url)),
				settings: fileURLToPath(new URL("./settings.html", import.meta.url)),
				outputs: fileURLToPath(new URL("./outputs.html", import.meta.url)),
				about: fileURLToPath(new URL("./about.html", import.meta.url)),
				scoreboard: fileURLToPath(new URL("./scoreboard.html", import.meta.url)),
				control: fileURLToPath(new URL("./control.html", import.meta.url)),
				recording: fileURLToPath(new URL("./recording.html", import.meta.url)),
				overlayControl: fileURLToPath(new URL("./overlay-control.html", import.meta.url)),
				overlayPreview: fileURLToPath(new URL("./overlay-preview.html", import.meta.url)),
				videoGenerator: fileURLToPath(new URL("./video-generator.html", import.meta.url)),
			},
		},
	},
}));
