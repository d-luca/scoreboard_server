import { useState, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { ScoreboardLayout } from "../components/ScoreboardLayout/ScoreboardLayout";
import { loadLayoutFonts } from "../lib/layouts/fonts";
import { rendererFixtures } from "../lib/layouts/renderFixtures";
import { createLayoutFrame } from "../lib/layouts/renderFrame";
import { renderLayoutToCanvas } from "../lib/layouts/renderLayoutToCanvas";
import { resolveLayout } from "../lib/layouts/resolveLayout";
import { alternateInputs, sampleInputs } from "../lib/layouts/testFixtures";
import { RollingScore } from "../components/Scoreboard/RollingScore";
import "../scoreboard.css";

const scenes = rendererFixtures.map(({ root }) => resolveLayout(root));
const element = document.getElementById("root");
if (!element) throw new Error("The parity page root is missing.");
const root = createRoot(element);
let disposed = false;
import.meta.hot?.dispose(() => {
	disposed = true;
	root.unmount();
});

function Parity(): JSX.Element {
	const [index, setIndex] = useState(0);
	const [alternate, setAlternate] = useState(false);
	const [score, setScore] = useState(0);
	const [awayScore, setAwayScore] = useState(0);
	const inputs = {
		...(alternate ? alternateInputs : sampleInputs),
		homeScore: score + (alternate ? 12 : 0),
		awayScore: awayScore + (alternate ? 105 : 0),
	};
	const frame = createLayoutFrame(scenes[index], inputs);
	const name = rendererFixtures[index].name;
	return (
		<main data-fixture={name} data-alternate={String(alternate)}>
			<header style={{ height: 192 }}>
				<h1>Custom layout renderer parity</h1>
				<p>Development-only proof page. No match state, Tauri, editor guides or layout activation.</p>
				<label>
					Fixture{" "}
					<select id="fixture" value={index} onChange={(event) => setIndex(Number(event.target.value))}>
						{rendererFixtures.map(({ name }, index) => (
							<option value={index} key={name}>
								{name}
							</option>
						))}
					</select>
				</label>{" "}
				<button id="inputs" onClick={() => setAlternate((value) => !value)}>
					Toggle sample / alternate
				</button>{" "}
				<button id="score" onClick={() => setScore((value) => value + 1)}>
					Increment home score
				</button>
				<button id="away-score" onClick={() => setAwayScore((value) => value + 1)}>
					Increment away score
				</button>
				<button id="decrement" onClick={() => setScore((value) => Math.max(0, value - 1))}>
					Decrement home score
				</button>
				<p>
					{navigator.userAgent}; device pixel ratio {devicePixelRatio}
				</p>
			</header>
			<h2>Live</h2>
			<ScoreboardLayout frame={frame} />
			<h2>Canvas (scores are static)</h2>
			<canvas
				style={{ display: "block" }}
				width={frame.scene.width}
				height={frame.scene.height}
				data-layout-canvas
				ref={(canvas) => {
					if (!canvas) return;
					const ctx = canvas.getContext("2d");
					if (!ctx) throw new Error("Canvas2D is unavailable.");
					renderLayoutToCanvas(ctx, frame);
				}}
			/>
			<details>
				<summary>Diagnostics ({frame.diagnostics.length})</summary>
				<pre>{JSON.stringify(frame.diagnostics, null, 2)}</pre>
			</details>
			<div data-classic-rolling>
				<RollingScore value={inputs.homeScore} />
			</div>
		</main>
	);
}

async function start(): Promise<void> {
	await Promise.all(scenes.map(loadLayoutFonts));
	if (!disposed) root.render(<Parity />);
}

void start().catch((error: unknown) => {
	if (!disposed) root.render(<p role="alert">Layout renderer initialization failed: {String(error)}</p>);
	throw error;
});
