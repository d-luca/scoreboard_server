import { defineConfig } from "eslint/config";
import tseslint from "@electron-toolkit/eslint-config-ts";
import eslintConfigPrettier from "@electron-toolkit/eslint-config-prettier";
import eslintPluginReact from "eslint-plugin-react";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import eslintPluginReactRefresh from "eslint-plugin-react-refresh";

export default defineConfig(
	{ ignores: ["**/node_modules", "**/dist", "**/out", "scripts/**"] },
	tseslint.configs.recommended,
	eslintPluginReact.configs.flat.recommended,
	eslintPluginReact.configs.flat["jsx-runtime"],
	{
		settings: {
			react: {
				version: "detect",
			},
		},
	},
	{
		files: ["**/*.{ts,tsx}"],
		plugins: {
			"react-hooks": eslintPluginReactHooks,
			"react-refresh": eslintPluginReactRefresh,
		},
		rules: {
			...eslintPluginReactHooks.configs.recommended.rules,
			...eslintPluginReactRefresh.configs.vite.rules,
		},
	},
	// The scoreboard/control/value entries are served over plain HTTP to LAN
	// clients (OBS, phones). They must never pull in the Tauri IPC API
	// (doc 04 §2).
	{
		files: [
			"src/entries/scoreboard.tsx",
			"src/entries/control.tsx",
			"src/entries/value.tsx",
			"src/features/remote/**",
		],
		rules: { "no-restricted-imports": ["error", { patterns: ["@tauri-apps/*"] }] },
	},
	// Entry files are app roots mounted once; they are not fast-refresh
	// boundaries, so the only-export-components rule does not apply to them.
	{
		files: ["src/entries/**/*.tsx", "src/main.tsx"],
		rules: { "react-refresh/only-export-components": "off" },
	},
	eslintConfigPrettier,
);
