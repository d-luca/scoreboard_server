import React from "react";
import ReactDOM from "react-dom/client";
import { Scoreboard } from "../components/Scoreboard/Scoreboard";
import { ScoreboardLayout } from "../components/ScoreboardLayout/ScoreboardLayout";
import type { PublishedLayoutSnapshot } from "../bindings/PublishedLayoutSnapshot";
import { inputsFromLiveState, type LayoutRenderInputs } from "../lib/layouts/bindings";
import { loadLayoutFonts } from "../lib/layouts/fonts";
import { PublishedLayoutProtocolError } from "../lib/layouts/publication";
import { createLayoutFrame } from "../lib/layouts/renderFrame";
import { resolveLayout, type ResolvedLayoutScene } from "../lib/layouts/resolveLayout";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../lib/scoreboardGeometry";
import { createScoreboardStore } from "../lib/stores/scoreboardStore";
import { WsTransport } from "../lib/wsTransport";
import "../scoreboard.css";

/**
 * OBS browser-source page, served over plain HTTP by the embedded axum server.
 * This entry and everything it imports must remain free of Tauri imports.
 */

const config = window.__SCOREBOARD__;
const transport = new WsTransport(config?.wsUrl ?? `ws://${window.location.host}/ws`);
const useStore = createScoreboardStore(transport);

type ActivePublication =
	| { snapshot: PublishedLayoutSnapshot; scene: null }
	| { snapshot: PublishedLayoutSnapshot; scene: ResolvedLayoutScene };

type PreparedPublication = {
	snapshot: PublishedLayoutSnapshot;
	scene: ResolvedLayoutScene | null;
};

function dimensions(active: ActivePublication): { width: number; height: number } {
	return active.scene
		? { width: active.scene.width, height: active.scene.height }
		: { width: FRAME_WIDTH, height: FRAME_HEIGHT };
}

function ScoreboardView(): React.JSX.Element {
	const state = useStore((store) => store.state);
	const scoreAnimation = useStore((store) => store.scoreAnimation);
	const connect = useStore((store) => store.connect);
	const [active, setActive] = React.useState<ActivePublication | null>(null);
	const [publicationError, setPublicationError] = React.useState<string | null>(null);
	const activeRequest = React.useRef(0);
	const activeRef = React.useRef<ActivePublication | null>(active);

	React.useEffect(() => {
		void connect();
	}, [connect]);

	React.useEffect(() => {
		void document.fonts.load('400 32px "Anton"');
	}, []);

	React.useEffect(() => {
		let mounted = true;
		const unsubscribe = transport.subscribePublishedLayout(
			(snapshot) => {
				const request = ++activeRequest.current;
				setPublicationError(null);
				const prepare = async (): Promise<PreparedPublication> => {
					if (snapshot.selection.kind === "classic") return { snapshot, scene: null };
					let scene: ResolvedLayoutScene;
					try {
						scene = resolveLayout(snapshot.selection.root);
					} catch (error) {
						throw new PublishedLayoutProtocolError(`invalid custom rendering tree: ${String(error)}`);
					}
					await loadLayoutFonts(scene);
					try {
						createLayoutFrame(scene, inputsFromLiveState(useStore.getState().state));
					} catch (error) {
						throw new PublishedLayoutProtocolError(`invalid custom rendering scene: ${String(error)}`);
					}
					return { snapshot, scene };
				};
				void prepare().then(
					(prepared) => {
						if (mounted && activeRequest.current === request) {
							setActive(prepared);
							setPublicationError(null);
						}
					},
					(error: unknown) => {
						if (activeRequest.current !== request) return;
						const message = error instanceof Error ? error.message : String(error);
						console.error(
							error instanceof PublishedLayoutProtocolError
								? "Published scoreboard protocol error."
								: "Could not load published scoreboard fonts.",
							error,
						);
						setPublicationError(message);
						if (!activeRef.current) {
							// No previous valid publication exists; keep the output
							// explicitly unavailable rather than fabricating Classic.
							setActive(null);
						}
					},
				);
			},
			(error) => {
				console.error("Published scoreboard protocol error.", error);
				setPublicationError(error.message);
			},
		);
		return () => {
			mounted = false;
			activeRequest.current += 1;
			unsubscribe();
		};
	}, []);

	const size = active ? dimensions(active) : null;
	const width = size?.width;
	const height = size?.height;
	React.useLayoutEffect(() => {
		activeRef.current = active;
		if (width === undefined || height === undefined) return;
		document.documentElement.style.setProperty("--scoreboard-width", `${width}px`);
		document.documentElement.style.setProperty("--scoreboard-height", `${height}px`);
	}, [active, width, height]);

	// Classic keeps its compatibility renderer and 11px skew padding. Custom
	// roots render their own complete logical frame.
	const inputs: LayoutRenderInputs = React.useMemo(() => inputsFromLiveState(state), [state]);
	let frame: ReturnType<typeof createLayoutFrame> | null = null;
	let renderError: string | null = null;
	if (active?.scene) {
		try {
			frame = createLayoutFrame(active.scene, inputs);
		} catch (error) {
			renderError = error instanceof Error ? error.message : String(error);
		}
	}

	if (!active || renderError) {
		const message = renderError ?? publicationError;
		return (
			<main
				className="scoreboard-unavailable"
				role="alert"
				aria-live="polite"
				data-publication-error={message ? "true" : "false"}
			>
				{message ? `Scoreboard layout unavailable: ${message}` : "Loading published scoreboard…"}
			</main>
		);
	}

	return active.scene && frame ? (
		<div
			id="scoreboard-root"
			style={{
				boxSizing: "border-box",
				width: active.scene.width,
				height: active.scene.height,
				padding: 0,
			}}
			data-published-layout={active.snapshot.revision}
		>
			<ScoreboardLayout frame={frame} />
		</div>
	) : (
		<div
			id="scoreboard-root"
			style={{
				boxSizing: "border-box",
				width: FRAME_WIDTH,
				height: FRAME_HEIGHT,
				padding: "0 11px",
			}}
			data-published-layout={active.snapshot.revision}
		>
			<Scoreboard {...state} scoreAnimation={scoreAnimation} />
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<ScoreboardView />
	</React.StrictMode>,
);
