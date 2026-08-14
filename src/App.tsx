import { JSX } from "react";
import { Button } from "./components/ui/Button/Button";

/**
 * Phase 0 smoke test: proves the ported shadcn primitives, Tailwind 4 theme
 * tokens and the Anton/Poppins fonts all render inside the Tauri webview.
 * Replaced by the real layout in Phase 2 (doc 04 §7).
 */
function App(): JSX.Element {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-900 text-white">
			<h1 className="font-[Anton] text-5xl tracking-wide">SCOREBOARD SERVER</h1>
			<p className="font-[Poppins] text-zinc-400">Phase 0 scaffold — button + font smoke test</p>
			<div className="flex gap-3">
				<Button>Default</Button>
				<Button variant="secondary">Secondary</Button>
				<Button variant="destructive">Destructive</Button>
				<Button variant="outline">Outline</Button>
			</div>
		</main>
	);
}

export default App;
