import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { glob } from "glob";
import { ScoreboardData } from "../types/scoreboard";

let compiledCSS: string | null = null;

// Load compiled Tailwind CSS
function loadCompiledCSS(): string {
	if (compiledCSS) return compiledCSS;

	// Try to find the compiled CSS file from built scoreboard first
	const scoreboardCssPaths = [
		join(process.cwd(), "dist/scoreboard-ssr/style.css"),
		join(process.cwd(), "dist/scoreboard-ssr/*.css"),
	];

	// Try scoreboard-specific CSS first
	for (const pattern of scoreboardCssPaths) {
		try {
			if (pattern.includes("*")) {
				const files = glob.sync(pattern.replace(/\\/g, "/"));
				if (files.length > 0) {
					compiledCSS = readFileSync(files[0], "utf8");
					console.log("Loaded scoreboard CSS from:", files[0]);
					return compiledCSS;
				}
			} else {
				if (existsSync(pattern)) {
					compiledCSS = readFileSync(pattern, "utf8");
					console.log("Loaded scoreboard CSS from:", pattern);
					return compiledCSS;
				}
			}
		} catch {
			// Continue to next pattern
		}
	}

	// Fallback to main renderer CSS
	const rendererCssPaths = [
		join(__dirname, "../renderer/assets/index-*.css"),
		join(process.cwd(), "out/renderer/assets/index-*.css"),
		join(process.cwd(), "dist/renderer/assets/index-*.css"),
	];

	// Use glob-like search for CSS files
	for (const pattern of rendererCssPaths) {
		try {
			const files = glob.sync(pattern.replace(/\\/g, "/"));
			if (files.length > 0) {
				compiledCSS = readFileSync(files[0], "utf8");
				console.log("Loaded compiled CSS from:", files[0]);
				return compiledCSS;
			}
		} catch {
			// Continue to next pattern
		}
	}

	// Fallback: minimal CSS with Tailwind equivalents
	compiledCSS = `
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body { background: transparent; font-family: system-ui, -apple-system, sans-serif; }
		.flex { display: flex; }
		.items-center { align-items: center; }
		.justify-center { justify-content: center; }
		.justify-between { justify-content: space-between; }
		.h-full { height: 100%; }
		.w-full { width: 100%; }
		.h-12 { height: 3rem; }
		.w-2 { width: 0.5rem; }
		.w-12 { width: 3rem; }
		.w-16 { width: 4rem; }
		.w-\\[480px\\] { width: 480px; }
		.overflow-hidden { overflow: hidden; }
		.rounded-md { border-radius: 0.375rem; }
		.border-2 { border-width: 2px; }
		.border-indigo-400 { border-color: rgb(129 140 248); }
		.bg-indigo-950 { background-color: rgb(30 27 75); }
		.bg-white { background-color: rgb(255 255 255); }
		.bg-slate-500 { background-color: rgb(100 116 139); }
		.px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
		.py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
		.px-1 { padding-left: 0.25rem; padding-right: 0.25rem; }
		.pl-2 { padding-left: 0.5rem; }
		.mr-1 { margin-right: 0.25rem; }
		.text-xl { font-size: 1.25rem; }
		.text-2xl { font-size: 1.5rem; }
		.font-medium { font-weight: 500; }
		.font-bold { font-weight: 700; }
		.font-semibold { font-weight: 600; }
		.text-indigo-400 { color: rgb(129 140 248); }
		.text-neutral-950 { color: rgb(10 10 10); }
		.tracking-wider { letter-spacing: 0.05em; }
		.gap-1 { gap: 0.25rem; }
		.gap-2 { gap: 0.5rem; }
		.gap-3 { gap: 0.75rem; }
		.w-0\\.5 { width: 0.125rem; }
		.object-contain { object-fit: contain; }
		.h-8 { height: 2rem; }
		.w-8 { width: 2rem; }
	`;

	console.log("Using fallback CSS styles");
	return compiledCSS;
}

// Load built scoreboard component
function loadScoreboardComponent(): React.ComponentType<ScoreboardData> {
	try {
		// Try to load the built component first
		const builtComponentPath = join(process.cwd(), "dist/scoreboard-ssr/scoreboard-ssr.js");
		if (existsSync(builtComponentPath)) {
			console.log("Loading built scoreboard component from:", builtComponentPath);
			// Clear require cache to ensure fresh component on each load
			delete (require.cache as any)[require.resolve(builtComponentPath)];
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const { Scoreboard } = require(builtComponentPath);
			return Scoreboard as React.ComponentType<ScoreboardData>;
		}
	} catch (error) {
		console.warn("Failed to load built scoreboard component:", error);
	}

	// If we reach here, no component could be loaded
	throw new Error("No scoreboard component available. Please run 'pnpm run build:scoreboard' first.");
}

// Render React component to HTML
export function renderScoreboardHTML(data: ScoreboardData): string {
	const css = loadCompiledCSS();
	const ScoreboardComponent = loadScoreboardComponent();

	const scoreboardElement = React.createElement(ScoreboardComponent, data);
	const htmlContent = renderToStaticMarkup(scoreboardElement);

	return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Scoreboard</title>
    <style>
        ${css}

        /* Additional optimizations for OBS */
        body {
            background: transparent !important;
            overflow: hidden;
            margin: 0;
            padding: 0;
        }

        /* Ensure proper sizing for OBS */
        .scoreboard-container {
            display: flex;
            // align-items: center;
            // justify-content: center;
            width: 100vw;
            height: 100vh;
			padding: 10px;
        }
    </style>
</head>
<body>
    <div class="scoreboard-container">
        ${htmlContent}
    </div>

    <script>
        // WebSocket connection for real-time updates
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(\`\${protocol}//\${window.location.host}\`);

        ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            updateScoreboard(data);
        };

        ws.onopen = function() {
            console.log('WebSocket connected');
        };

        ws.onclose = function() {
            console.log('WebSocket disconnected, attempting to reconnect...');
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        };

        function updateScoreboard(data) {
            // Find elements and update them
            const homeNameEl = document.querySelector('[data-home-name]');
            const awayNameEl = document.querySelector('[data-away-name]');
            const homeScoreEl = document.querySelector('[data-home-score]');
            const awayScoreEl = document.querySelector('[data-away-score]');
            const timerEl = document.querySelector('[data-timer]');
            const halfEl = document.querySelector('[data-half]');
            const homeColorEl = document.querySelector('[data-home-color]');
            const awayColorEl = document.querySelector('[data-away-color]');

            if (homeNameEl) homeNameEl.textContent = data.teamHomeName;
            if (awayNameEl) awayNameEl.textContent = data.teamAwayName;
            if (homeScoreEl) homeScoreEl.textContent = data.teamHomeScore;
            if (awayScoreEl) awayScoreEl.textContent = data.teamAwayScore;
            if (timerEl) timerEl.textContent = formatTime(data.timer);
            if (halfEl) halfEl.textContent = data.half;
            if (homeColorEl) homeColorEl.style.backgroundColor = data.teamHomeColor;
            if (awayColorEl) awayColorEl.style.backgroundColor = data.teamAwayColor;
        }

        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
        }

        // Fallback: Poll for updates every second if WebSocket fails
        setInterval(async () => {
            if (ws.readyState !== WebSocket.OPEN) {
                try {
                    const response = await fetch('/api/scoreboard');
                    const data = await response.json();
                    updateScoreboard(data);
                } catch (error) {
                    console.error('Failed to fetch scoreboard data:', error);
                }
            }
        }, 1000);
    </script>
</body>
</html>`;
}
