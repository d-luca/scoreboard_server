export function renderControlPage(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
	<title>Scoreboard Remote Control</title>
	<style>
		:root {
			--color-background-primary: #0f172a;
			--color-background-secondary: #1e293b;
			--color-background-tertiary: #334155;
			--color-surface-primary: #1e293b;
			--color-surface-secondary: #334155;
			--color-surface-tertiary: #475569;
			--color-text-primary: #f8fafc;
			--color-text-secondary: #e2e8f0;
			--color-text-tertiary: #cbd5e1;
			--color-text-quaternary: #94a3b8;
			--color-border-primary: #334155;
			--color-border-secondary: #475569;
			--color-primary-500: #3b82f6;
			--color-primary-600: #2563eb;
			--color-success-500: #22c55e;
			--color-warning-500: #f59e0b;
			--color-error-500: #ef4444;
			--bg: var(--color-background-primary);
			--panel: var(--color-surface-primary);
			--panel-strong: var(--color-surface-secondary);
			--border: var(--color-border-primary);
			--text: var(--color-text-primary);
			--muted: var(--color-text-quaternary);
			--accent: var(--color-warning-500);
			--good: var(--color-success-500);
			--danger: var(--color-error-500);
			--blue: var(--color-primary-500);
			--shadow: 0 18px 50px rgba(0, 0, 0, 0.32);
		}

		* { box-sizing: border-box; }

		body {
			margin: 0;
			min-height: 100vh;
			background: var(--color-background-primary);
			color: var(--text);
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
			letter-spacing: 0;
		}

		button, input {
			font: inherit;
		}

		button {
			min-height: 48px;
			border: 1px solid transparent;
			border-radius: 8px;
			background: var(--panel-strong);
			color: var(--text);
			font-weight: 700;
			cursor: pointer;
			touch-action: manipulation;
			transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
		}

		button:active {
			transform: scale(0.98);
		}

		button:focus-visible, input:focus-visible {
			outline: 3px solid rgba(59, 130, 246, 0.42);
			outline-offset: 2px;
		}

		input {
			min-height: 44px;
			width: 100%;
			border: 1px solid var(--border);
			border-radius: 8px;
			background: var(--color-background-tertiary);
			color: var(--text);
			padding: 0.65rem 0.75rem;
		}

		input[type="color"] {
			padding: 0.25rem;
			min-height: 48px;
		}

		.page {
			width: min(1120px, 100%);
			margin: 0 auto;
			padding: max(1rem, env(safe-area-inset-top)) 1rem max(1.5rem, env(safe-area-inset-bottom));
		}

		.header {
			display: flex;
			justify-content: space-between;
			gap: 1rem;
			align-items: center;
			margin-bottom: 1rem;
		}

		.title {
			margin: 0;
			font-size: clamp(1.35rem, 5vw, 2.1rem);
			font-weight: 900;
		}

		.title-block {
			display: flex;
			min-width: 0;
			flex-direction: column;
			gap: 0.25rem;
		}

		.input-note {
			margin: 0;
			color: var(--color-text-tertiary);
			font-size: 0.86rem;
			line-height: 1.35;
		}

		.status {
			display: inline-flex;
			align-items: center;
			gap: 0.5rem;
			border: 1px solid var(--border);
			border-radius: 999px;
			background: var(--panel);
			padding: 0.5rem 0.75rem;
			white-space: nowrap;
			color: var(--muted);
			font-size: 0.9rem;
		}

		.status-dot {
			width: 0.7rem;
			height: 0.7rem;
			border-radius: 999px;
			background: var(--danger);
			box-shadow: 0 0 0 4px rgba(242, 95, 92, 0.15);
		}

		.status.connected .status-dot {
			background: var(--good);
			box-shadow: 0 0 0 4px rgba(47, 208, 127, 0.16);
		}

		.grid {
			display: grid;
			grid-template-columns: repeat(12, 1fr);
			gap: 1rem;
		}

		.panel {
			grid-column: span 12;
			border: 1px solid var(--border);
			border-radius: 8px;
			background: var(--panel);
			box-shadow: var(--shadow);
			padding: 1rem;
		}

		.panel-title {
			margin: 0 0 0.85rem;
			color: var(--muted);
			font-size: 0.78rem;
			font-weight: 900;
			letter-spacing: 0.08em;
			text-transform: uppercase;
		}

		.teams {
			display: grid;
			grid-template-columns: 1fr;
			gap: 1rem;
		}

		.team-card {
			border: 1px solid var(--border);
			border-radius: 8px;
			background: var(--color-surface-secondary);
			padding: 0.9rem;
		}

		.team-row, .field-row {
			display: flex;
			flex-wrap: wrap;
			gap: 0.75rem;
		}

		.field-row {
			margin-top: 0.75rem;
		}

		label {
			display: block;
			margin-bottom: 0.35rem;
			color: var(--muted);
			font-size: 0.78rem;
			font-weight: 800;
			text-transform: uppercase;
		}

		.field-hint {
			display: block;
			margin-top: 0.32rem;
			color: var(--color-text-quaternary);
			font-size: 0.72rem;
			line-height: 1.25;
		}

		.color-presets {
			display: flex;
			flex-wrap: wrap;
			gap: 0.4rem;
			margin-top: 0.5rem;
		}

		.color-preset {
			min-height: 2.15rem;
			width: 2.15rem;
			border: 2px solid var(--color-border-secondary);
			border-radius: 8px;
			padding: 0;
			box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
		}

		.color-preset.selected {
			border-color: var(--color-primary-500);
			box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.42);
		}

		.score-row {
			display: grid;
			grid-template-columns: 1fr minmax(5rem, 7rem) 1fr;
			gap: 0.75rem;
			align-items: center;
			margin-top: 0.9rem;
		}

		.score-value {
			min-width: 0;
			border-radius: 8px;
			background: var(--color-background-primary);
			padding: 0.7rem 0.25rem;
			text-align: center;
			font-size: clamp(2.3rem, 12vw, 4.5rem);
			font-weight: 900;
			line-height: 1;
		}

		.score-btn {
			font-size: clamp(1.4rem, 7vw, 2.3rem);
		}

		.minus { background-color: #dc2626; }
		.plus { background-color: #2563eb; }
		.primary { background: var(--color-primary-600); }
		.warning { background: #92400e; border-color: var(--color-warning-500); }
		.danger { background: #dc2626; }

		.timer-display {
			border-radius: 8px;
			background: var(--color-background-primary);
			padding: 1rem;
			text-align: center;
			font-family: Consolas, Monaco, monospace;
			font-size: clamp(3rem, 16vw, 6.6rem);
			font-weight: 900;
			line-height: 1;
		}

		.timer-controls {
			display: grid;
			grid-template-columns: repeat(5, 1fr);
			gap: 0.6rem;
			margin-top: 0.85rem;
		}

		.stop-row, .preset-row, .settings-grid {
			display: grid;
			gap: 0.75rem;
			margin-top: 0.75rem;
		}

		.stop-row { grid-template-columns: 1fr; }
		.preset-row { grid-template-columns: repeat(3, 1fr); }
		.settings-grid { grid-template-columns: 1fr; }

		.half-row {
			display: grid;
			grid-template-columns: 1fr minmax(7rem, 12rem) 1fr;
			gap: 0.75rem;
			align-items: center;
		}

		.half-value {
			border-radius: 8px;
			background: var(--color-background-primary);
			padding: 0.85rem 0.35rem;
			text-align: center;
			font-size: clamp(1.25rem, 5vw, 2.2rem);
			font-weight: 900;
			line-height: 1.1;
			word-break: break-word;
		}

		@media (min-width: 720px) {
			.panel.teams-panel { grid-column: span 7; }
			.panel.timer-panel { grid-column: span 5; }
			.panel.half-panel { grid-column: span 5; }
			.panel.settings-panel { grid-column: span 7; }
			.teams { grid-template-columns: repeat(2, minmax(0, 1fr)); }
			.settings-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		}

		@media (max-width: 520px) {
			.header { align-items: flex-start; flex-direction: column; }
			.timer-controls { grid-template-columns: repeat(2, 1fr); }
			.timer-controls .primary { grid-column: span 2; }
			.preset-row { grid-template-columns: 1fr; }
		}
	</style>
</head>
<body>
	<div class="page">
		<header class="header">
			<div class="title-block">
				<h1 class="title">Scoreboard Remote</h1>
				<p class="input-note">Press Enter or leave a field to apply typed changes.</p>
			</div>
			<div id="connectionStatus" class="status">
				<span class="status-dot"></span>
				<span id="connectionText">Disconnected</span>
			</div>
		</header>

		<main class="grid">
			<section class="panel teams-panel">
				<h2 class="panel-title">Teams and Score</h2>
				<div class="teams">
					<div class="team-card">
						<div class="team-row">
							<div>
								<label for="teamHomeName">Home Name</label>
								<input id="teamHomeName" type="text" autocomplete="off" />
								<span class="field-hint">Enter or leave to apply</span>
							</div>
							<div>
								<label for="teamHomeColor">Color</label>
								<input id="teamHomeColor" type="color" />
								<div id="teamHomeColorPresets" class="color-presets" aria-label="Home color presets"></div>
							</div>
						</div>
						<div class="score-row">
							<button id="homeDec" class="score-btn minus" type="button">-</button>
							<div id="teamHomeScore" class="score-value">0</div>
							<button id="homeInc" class="score-btn plus" type="button">+</button>
						</div>
					</div>

					<div class="team-card">
						<div class="team-row">
							<div>
								<label for="teamAwayName">Away Name</label>
								<input id="teamAwayName" type="text" autocomplete="off" />
								<span class="field-hint">Enter or leave to apply</span>
							</div>
							<div>
								<label for="teamAwayColor">Color</label>
								<input id="teamAwayColor" type="color" />
								<div id="teamAwayColorPresets" class="color-presets" aria-label="Away color presets"></div>
							</div>
						</div>
						<div class="score-row">
							<button id="awayDec" class="score-btn minus" type="button">-</button>
							<div id="teamAwayScore" class="score-value">0</div>
							<button id="awayInc" class="score-btn plus" type="button">+</button>
						</div>
					</div>
				</div>
			</section>

			<section class="panel timer-panel">
				<h2 class="panel-title">Timer</h2>
				<div id="timerDisplay" class="timer-display">00:00</div>
				<div class="timer-controls">
					<button id="timerPlusMinute" type="button">+1m</button>
					<button id="timerPlusSecond" type="button">+1s</button>
					<button id="timerToggle" class="primary" type="button">Start</button>
					<button id="timerMinusSecond" type="button">-1s</button>
					<button id="timerMinusMinute" type="button">-1m</button>
				</div>
				<div class="stop-row">
					<button id="timerStop" class="danger" type="button">Reset</button>
				</div>
				<div class="stop-row" style="gap: 0.5rem;">
					<button id="buzzerPlay" type="button" style="flex:1;">🔔 Buzzer</button>
					<button id="buzzerToggle" class="primary" type="button" style="flex:1;">Auto: ON</button>
				</div>
				<div class="field-row">
					<div>
						<label for="timerInput">Set Timer (MM:SS)</label>
						<input id="timerInput" type="text" inputmode="numeric" placeholder="15:00" />
						<span class="field-hint">Press Set or Enter to apply</span>
					</div>
					<button id="timerSet" class="primary" type="button">Set</button>
				</div>
				<div class="preset-row">
					<button id="preset1" type="button">Loadout 1</button>
					<button id="preset2" type="button">Loadout 2</button>
					<button id="preset3" type="button">Loadout 3</button>
				</div>
			</section>

			<section class="panel half-panel">
				<h2 class="panel-title">Half / Period</h2>
				<div class="half-row">
					<button id="halfDec" class="minus" type="button">-</button>
					<div id="halfValue" class="half-value">PERIODO 1</div>
					<button id="halfInc" class="plus" type="button">+</button>
				</div>
			</section>

			<section class="panel settings-panel">
				<h2 class="panel-title">Settings</h2>
				<div class="settings-grid">
					<div>
						<label for="halfPrefix">Half Prefix</label>
						<input id="halfPrefix" type="text" autocomplete="off" placeholder="PERIODO" />
						<span class="field-hint">Enter or leave to apply</span>
					</div>
					<div>
						<label for="timerLoadout1">Loadout 1 (MM:SS)</label>
						<input id="timerLoadout1" type="text" inputmode="numeric" placeholder="15:00" />
						<span class="field-hint">Enter or leave to apply</span>
					</div>
					<div>
						<label for="timerLoadout2">Loadout 2 (MM:SS)</label>
						<input id="timerLoadout2" type="text" inputmode="numeric" placeholder="45:00" />
						<span class="field-hint">Enter or leave to apply</span>
					</div>
					<div>
						<label for="timerLoadout3">Loadout 3 (MM:SS)</label>
						<input id="timerLoadout3" type="text" inputmode="numeric" placeholder="20:00" />
						<span class="field-hint">Enter or leave to apply</span>
					</div>
				</div>
				<div class="stop-row">
					<button id="resetAll" class="danger" type="button">Reset All</button>
				</div>
			</section>
		</main>
	</div>

	<script>
		let websocket = null;
		let reconnectDelay = 1000;
		let scoreboardState = {};
		const presetColors = ["#ffffff", "#000000", "#ffcc00", "#0066cc", "#00cc00"];

		function element(id) {
			return document.getElementById(id);
		}

		function formatClock(seconds) {
			const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
			const minutes = Math.floor(safeSeconds / 60);
			const remainingSeconds = safeSeconds % 60;
			return String(minutes).padStart(2, "0") + ":" + String(remainingSeconds).padStart(2, "0");
		}

		function parseClock(value) {
			const trimmed = String(value || "").trim();
			if (!trimmed) return null;
			if (/^\\d+$/.test(trimmed)) return Math.max(0, Number(trimmed));
			const match = trimmed.match(/^(\\d{1,3}):([0-5]\\d)$/);
			if (!match) return null;
			return Math.max(0, Number(match[1]) * 60 + Number(match[2]));
		}

		function updateConnectionStatus(connected) {
			const status = element("connectionStatus");
			const text = element("connectionText");
			status.classList.toggle("connected", connected);
			text.textContent = connected ? "Connected" : "Disconnected";
		}

		function updateInput(id, value) {
			const input = element(id);
			if (document.activeElement !== input) {
				input.value = value == null ? "" : String(value);
				input.dataset.submittedValue = input.value;
			}
		}

		function updateColorPresetSelection(inputId, value) {
			document.querySelectorAll('[data-input="' + inputId + '"]').forEach(function (button) {
				button.classList.toggle("selected", button.dataset.color === String(value).toLowerCase());
			});
		}

		function updateUI(data) {
			scoreboardState = Object.assign({}, scoreboardState, data);

			updateInput("teamHomeName", scoreboardState.teamHomeName || "");
			updateInput("teamAwayName", scoreboardState.teamAwayName || "");
			updateInput("teamHomeColor", scoreboardState.teamHomeColor || "#00ff00");
			updateInput("teamAwayColor", scoreboardState.teamAwayColor || "#ff0000");
			updateColorPresetSelection("teamHomeColor", scoreboardState.teamHomeColor || "#00ff00");
			updateColorPresetSelection("teamAwayColor", scoreboardState.teamAwayColor || "#ff0000");
			updateInput("halfPrefix", scoreboardState.halfPrefix || "PERIODO");

			element("teamHomeScore").textContent = String(scoreboardState.teamHomeScore || 0);
			element("teamAwayScore").textContent = String(scoreboardState.teamAwayScore || 0);
			element("timerDisplay").textContent = formatClock(scoreboardState.timer || 0);
			updateInput("timerInput", formatClock(scoreboardState.timer || 0));

			const prefix = scoreboardState.halfPrefix || "PERIODO";
			element("halfValue").textContent = prefix + " " + String(scoreboardState.half || 1);

			const isRunning = Boolean(scoreboardState.isTimerRunning);
			element("timerToggle").textContent = isRunning ? "Pause" : "Start";

			[1, 2, 3].forEach(function (index) {
				const key = "timerLoadout" + index;
				const value = scoreboardState[key];
				const fallback = index === 1 ? 900 : index === 2 ? 2700 : 1200;
				const seconds = typeof value === "number" ? value : fallback;
				updateInput(key, formatClock(seconds));
				element("preset" + index).textContent = "Loadout " + index + " - " + formatClock(seconds);
			});
		}

		function sendCommand(action, data) {
			if (websocket && websocket.readyState === WebSocket.OPEN) {
				websocket.send(JSON.stringify({ type: "command", action: action, data: data }));
			}
		}

		function sendUpdate(key, value) {
			const data = {};
			data[key] = value;
			sendCommand("update", data);
		}

		function setTimer(seconds) {
			sendCommand("timer:set", { timer: Math.max(0, Math.floor(Number(seconds) || 0)) });
		}

		function adjustTimer(delta) {
			setTimer((scoreboardState.timer || 0) + delta);
		}

		function bindField(id, key, normalize) {
			const input = element(id);
			function submitInput() {
				const value = normalize ? normalize(input.value) : input.value;
				const serializedValue = String(value);
				if (value !== null && input.dataset.submittedValue !== serializedValue) {
					sendUpdate(key, value);
					input.dataset.submittedValue = serializedValue;
				}
			}

			input.addEventListener("change", submitInput);
			input.addEventListener("keydown", function (event) {
				if (event.key === "Enter") {
					event.preventDefault();
					submitInput();
					input.blur();
				}
			});
		}

		function renderColorPresets(containerId, inputId, key) {
			const container = element(containerId);
			presetColors.forEach(function (color) {
				const button = document.createElement("button");
				button.type = "button";
				button.className = "color-preset";
				button.dataset.color = color;
				button.dataset.input = inputId;
				button.style.backgroundColor = color;
				button.title = "Select " + color;
				button.setAttribute("aria-label", "Select " + color);
				button.addEventListener("click", function () {
					const input = element(inputId);
					input.value = color;
					input.dataset.submittedValue = color;
					sendUpdate(key, color);
					updateColorPresetSelection(inputId, color);
				});
				container.appendChild(button);
			});
		}

		function bindLoadout(index) {
			const input = element("timerLoadout" + index);
			function submitLoadout() {
				const seconds = parseClock(input.value);
				const serializedValue = String(seconds);
				if (seconds !== null && input.dataset.submittedValue !== serializedValue) {
					sendUpdate("timerLoadout" + index, seconds);
					input.dataset.submittedValue = serializedValue;
				}
			}

			input.addEventListener("change", submitLoadout);
			input.addEventListener("keydown", function (event) {
				if (event.key === "Enter") {
					event.preventDefault();
					submitLoadout();
					input.blur();
				}
			});
			element("preset" + index).addEventListener("click", function () {
				const key = "timerLoadout" + index;
				const fallback = index === 1 ? 900 : index === 2 ? 2700 : 1200;
				setTimer(typeof scoreboardState[key] === "number" ? scoreboardState[key] : fallback);
			});
		}

		function connect() {
			websocket = new WebSocket("ws://" + window.location.host);

			websocket.onopen = function () {
				reconnectDelay = 1000;
				updateConnectionStatus(true);
			};

			websocket.onmessage = function (event) {
				try {
					var msg = JSON.parse(event.data);
					if (msg.event === "timer-finished") {
						if (buzzerAutoEnabled) playBuzzer();
						return;
					}
					updateUI(msg);
				} catch (error) {
					console.error("Failed to parse scoreboard state", error);
				}
			};

			websocket.onclose = function () {
				updateConnectionStatus(false);
				window.setTimeout(connect, reconnectDelay);
				reconnectDelay = Math.min(reconnectDelay * 2, 10000);
			};

			websocket.onerror = function () {
				updateConnectionStatus(false);
			};
		}

		element("homeInc").addEventListener("click", function () { sendCommand("score:home:inc"); });
		element("homeDec").addEventListener("click", function () { sendCommand("score:home:dec"); });
		element("awayInc").addEventListener("click", function () { sendCommand("score:away:inc"); });
		element("awayDec").addEventListener("click", function () { sendCommand("score:away:dec"); });
		element("halfInc").addEventListener("click", function () { sendCommand("half:inc"); });
		element("halfDec").addEventListener("click", function () { sendCommand("half:dec"); });
		element("timerPlusMinute").addEventListener("click", function () { adjustTimer(60); });
		element("timerPlusSecond").addEventListener("click", function () { adjustTimer(1); });
		element("timerMinusSecond").addEventListener("click", function () { adjustTimer(-1); });
		element("timerMinusMinute").addEventListener("click", function () { adjustTimer(-60); });
		element("timerToggle").addEventListener("click", function () {
			sendCommand(scoreboardState.isTimerRunning ? "timer:pause" : "timer:start");
		});
		element("timerStop").addEventListener("click", function () { sendCommand("timer:stop"); });

		// Buzzer
		var buzzerAudio = new Audio("/buzzer.mp3");
		var buzzerAutoEnabled = true;

		function playBuzzer() {
			buzzerAudio.currentTime = 0;
			buzzerAudio.play().catch(function (err) { console.error("Buzzer play failed", err); });
		}

		element("buzzerPlay").addEventListener("click", playBuzzer);
		element("buzzerToggle").addEventListener("click", function () {
			buzzerAutoEnabled = !buzzerAutoEnabled;
			element("buzzerToggle").textContent = "Auto: " + (buzzerAutoEnabled ? "ON" : "OFF");
			element("buzzerToggle").className = buzzerAutoEnabled ? "primary" : "";
		});

		element("timerSet").addEventListener("click", function () {
			const seconds = parseClock(element("timerInput").value);
			if (seconds !== null) setTimer(seconds);
		});
		element("timerInput").addEventListener("keydown", function (event) {
			if (event.key === "Enter") {
				event.preventDefault();
				const seconds = parseClock(element("timerInput").value);
				if (seconds !== null) setTimer(seconds);
				element("timerInput").blur();
			}
		});
		element("resetAll").addEventListener("click", function () {
			if (window.confirm("Reset scoreboard?")) sendCommand("reset");
		});

		bindField("teamHomeName", "teamHomeName");
		bindField("teamAwayName", "teamAwayName");
		renderColorPresets("teamHomeColorPresets", "teamHomeColor", "teamHomeColor");
		renderColorPresets("teamAwayColorPresets", "teamAwayColor", "teamAwayColor");
		bindField("teamHomeColor", "teamHomeColor");
		bindField("teamAwayColor", "teamAwayColor");
		bindField("halfPrefix", "halfPrefix");
		bindLoadout(1);
		bindLoadout(2);
		bindLoadout(3);

		connect();
	</script>
</body>
</html>`;
}
