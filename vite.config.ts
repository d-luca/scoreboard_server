import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

/**
 * The config-declared `main` window loads `frontendDist/index.html` (dist
 * root) in production, but the shell lives under pages/ so it builds to
 * dist/pages/index.html. Copy it to the dist root so the main window
 * resolves. The HTTP server redirects `/` → `/scoreboard`, so the duplicate
 * is never served to browsers.
 */
function copyMainIndexToRoot(): Plugin {
	return {
		name: "copy-main-index-to-root",
		enforce: "post",
		generateBundle(_, bundle) {
			const index = bundle["pages/index.html"];
			if (index?.type === "asset") {
				this.emitFile({ type: "asset", fileName: "index.html", source: index.source });
			}
		},
	};
}

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
		copyMainIndexToRoot(),
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
	// all served from the same dist/ folder. The HTML shells live in pages/ but the
	// keys keep dist/ flat (dist/<name>.html) because rust-embed and the Tauri
	// windows reference them by bare filename.
	build: {
		target: "es2022",
		rollupOptions: {
			input: {
				main: fileURLToPath(new URL("./pages/index.html", import.meta.url)),
				settings: fileURLToPath(new URL("./pages/settings.html", import.meta.url)),
				outputs: fileURLToPath(new URL("./pages/outputs.html", import.meta.url)),
				about: fileURLToPath(new URL("./pages/about.html", import.meta.url)),
				scoreboard: fileURLToPath(new URL("./pages/scoreboard.html", import.meta.url)),
				value: fileURLToPath(new URL("./pages/value.html", import.meta.url)),
				control: fileURLToPath(new URL("./pages/control.html", import.meta.url)),
				recording: fileURLToPath(new URL("./pages/recording.html", import.meta.url)),
				overlayControl: fileURLToPath(new URL("./pages/overlay-control.html", import.meta.url)),
				overlayPreview: fileURLToPath(new URL("./pages/overlay-preview.html", import.meta.url)),
				videoGenerator: fileURLToPath(new URL("./pages/video-generator.html", import.meta.url)),
			},
		},
	},
}));
